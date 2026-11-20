import "server-only";
import { createProvider, estimateCostUsd, AIUnavailableError, type ChatTurn, type ProviderConfig } from "@platform/ai-core";
import { getServerClient } from "@platform/database/server";
import { getServiceClient } from "@platform/database/service";
import type { Workspace } from "@platform/auth";
import { capture } from "@platform/analytics";
import { todayIn } from "@/lib/dates";
import { reportError } from "../errors";
import { rateLimit } from "../rate-limit";
import { buildTools, type ToolContext } from "./tools";
import { systemPrompt } from "./prompt";

export class AssistantError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const MAX_HISTORY = 20;

async function providerConfig(): Promise<ProviderConfig> {
  try {
    const { data } = await getServiceClient().from("platform_settings").select("value").eq("key", "ai").maybeSingle();
    const v = data?.value as { provider?: string; model?: string } | undefined;
    return { provider: v?.provider ?? "anthropic", model: v?.model ?? "claude-opus-5-5" };
  } catch {
    return { provider: "anthropic", model: "claude-opus-5-5" };
  }
}

async function toolContext(ws: Workspace): Promise<ToolContext> {
  const supabase = await getServerClient(); // user-scoped: RLS applies to every tool query
  const org = ws.organization.id;
  return {
    orgId: org, timezone: ws.organization.timezone, currency: ws.organization.currency, can: ws.can,
    db: {
      rpc: async (fn, args) => {
        const { data, error } = await supabase.rpc(fn, args);
        return { data, error: error ? { message: error.message, code: error.code } : null };
      },
      customersByName: async (name) => {
        const clean = name.replace(/[%_,()\\]/g, " ").trim();
        const { data } = await supabase.from("customers").select("id, full_name, phone").eq("organization_id", org).is("archived_at", null).ilike("full_name", `%${clean}%`).limit(10);
        return (data ?? []) as { id: string; full_name: string; phone: string | null }[];
      },
      openOrders: async () => {
        const { data } = await supabase.from("orders").select("order_number, status, order_date, expected_delivery_date, total, balance_due, customers(full_name)")
          .eq("organization_id", org).in("status", ["confirmed", "processing", "ready", "dispatched"]).order("order_date").limit(100);
        return (data ?? []).map((o) => ({ ...o, total: Number(o.total), balance_due: Number(o.balance_due), customer: (o.customers as unknown as { full_name: string } | null)?.full_name ?? null })) as never;
      },
    },
  };
}

export interface ChatResult {
  conversationId: string;
  message: { id: string; role: "assistant"; content: string; sources: { name: string; summary: string; ok: boolean }[]; created_at: string };
  quota: { limit: number | null; used: number; remaining: number | null };
}

/** Runs one assistant turn with every guard: permission, feature flag, quota, rate limit. */
export async function runAssistantTurn(ws: Workspace, input: { conversationId?: string | null; message: string }, signal?: AbortSignal): Promise<ChatResult> {
  if (!ws.can("ai.use")) throw new AssistantError("Your role doesn't include the AI assistant.", 403);
  const supabase = await getServerClient();
  const service = getServiceClient();
  const org = ws.organization.id;

  const { data: flag } = await supabase.from("feature_flags").select("enabled").eq("key", "ai_assistant").maybeSingle();
  if (flag && !flag.enabled) throw new AssistantError("The AI assistant is temporarily unavailable. Your records are unaffected.", 503);
  if (!(await rateLimit(`ai:${ws.user.id}`, 12, 60))) throw new AssistantError("You're sending messages very quickly. Please wait a moment.", 429);

  const { data: quota, error: qErr } = await supabase.rpc("ai_quota", { p_org: org });
  if (qErr) throw new AssistantError("Could not check your AI allowance.", 500);
  const q = quota as { limit: number | null; used: number; remaining: number | null; allowed: boolean };
  if (!q.allowed) {
    throw new AssistantError(ws.writable ? `You've used all ${q.limit} AI messages included in your plan this month. Upgrade for more.` : "Your subscription is inactive. Choose a plan to use the AI assistant.", 402);
  }

  const provider = createProvider(await providerConfig());
  if (!provider.isConfigured()) throw new AssistantError("The AI assistant isn't configured on this deployment yet (missing AI provider key). Everything else works normally.", 503);

  // Conversation (owned by this user, in this workspace — enforced by RLS on read and checked here before service writes).
  let conversationId = input.conversationId ?? null;
  if (conversationId) {
    const { data: conv } = await supabase.from("ai_conversations").select("id").eq("id", conversationId).eq("organization_id", org).eq("user_id", ws.user.id).maybeSingle();
    if (!conv) throw new AssistantError("Conversation not found.", 404);
  } else {
    const { data: conv, error } = await supabase.from("ai_conversations").insert({ organization_id: org, user_id: ws.user.id, title: input.message.slice(0, 80) }).select("id").single();
    if (error) throw new AssistantError("Could not start a conversation.", 500);
    conversationId = conv.id as string;
  }

  const { data: prior } = await supabase.from("ai_messages").select("role, content").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(MAX_HISTORY);
  const history: ChatTurn[] = [...((prior ?? []) as ChatTurn[]).reverse(), { role: "user", content: input.message }];
  while (history.length && history[0]!.role !== "user") history.shift();

  await service.from("ai_messages").insert({ organization_id: org, conversation_id: conversationId, role: "user", content: input.message });

  const { data: bp } = await supabase.from("organizations").select("description, category").eq("id", org).maybeSingle();
  const system = systemPrompt({
    businessName: ws.organization.name, category: bp?.category ?? null, description: bp?.description ?? null, currency: ws.organization.currency,
    timezone: ws.organization.timezone, today: todayIn(ws.organization.timezone), role: ws.role, permissions: ws.permissions, isDemo: ws.organization.is_demo,
  });

  let result;
  try {
    result = await provider.runAgent({ system, history, tools: buildTools(await toolContext(ws)), maxRounds: 6, signal });
  } catch (e) {
    await service.from("ai_usage_logs").insert({ organization_id: org, user_id: ws.user.id, conversation_id: conversationId, provider: provider.name, model: provider.model, status: "error" });
    if (e instanceof AIUnavailableError) throw new AssistantError(e.message, 503);
    await reportError(e, { where: "ai-assistant", orgId: org, userId: ws.user.id });
    throw new AssistantError("The AI service didn't respond. Please try again in a moment — your records are unaffected.", 502);
  }

  const sources = result.toolCalls.map((t) => ({ name: t.name, summary: t.summary, ok: t.ok }));
  const { data: saved } = await service.from("ai_messages").insert({ organization_id: org, conversation_id: conversationId, role: "assistant", content: result.text, sources })
    .select("id, created_at").single();
  await service.from("ai_usage_logs").insert({
    organization_id: org, user_id: ws.user.id, conversation_id: conversationId, request_kind: "chat", provider: result.provider, model: result.model,
    input_tokens: result.usage.inputTokens, output_tokens: result.usage.outputTokens, tool_calls: result.toolCalls.length,
    estimated_cost_usd: estimateCostUsd(result.model, result.usage.inputTokens, result.usage.outputTokens), status: "ok",
  });
  await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  await capture(ws.user.id, "ai_question_asked", { tools: result.toolCalls.length });

  return {
    conversationId,
    message: { id: (saved?.id as string) ?? crypto.randomUUID(), role: "assistant", content: result.text, sources, created_at: (saved?.created_at as string) ?? new Date().toISOString() },
    quota: { limit: q.limit, used: q.used + 1, remaining: q.remaining === null ? null : Math.max(0, q.remaining - 1) },
  };
}
