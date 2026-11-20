import Link from "next/link";
import { MessageSquare, Plus } from "lucide-react";
import { Button, cn, formatDate } from "@platform/ui";
import { requirePermission } from "@platform/auth";
import { getServerClient } from "@platform/database/server";
import { SUGGESTED_QUESTIONS } from "@/server/ai/prompt";
import { Chat, type ChatMessage } from "./chat";
import { DeleteConversation } from "./delete-conversation";

export const metadata = { title: "AI Assistant" };

export default async function Assistant({ searchParams }: { searchParams: Promise<{ c?: string; q?: string }> }) {
  const sp = await searchParams;
  const ws = await requirePermission("ai.use");
  const supabase = await getServerClient();
  const org = ws.organization.id;

  const [{ data: conversations }, { data: quota }] = await Promise.all([
    supabase.from("ai_conversations").select("id, title, updated_at").eq("organization_id", org).eq("user_id", ws.user.id).is("archived_at", null).order("updated_at", { ascending: false }).limit(30),
    supabase.rpc("ai_quota", { p_org: org }),
  ]);
  const active = sp.c && conversations?.some((c) => c.id === sp.c) ? sp.c : null;
  let messages: ChatMessage[] = [];
  if (active) {
    const { data } = await supabase.from("ai_messages").select("id, role, content, sources").eq("conversation_id", active).order("created_at").limit(200);
    messages = (data ?? []) as ChatMessage[];
  }
  const q = (quota ?? { limit: null, used: 0, remaining: null }) as { limit: number | null; used: number; remaining: number | null };
  const suggestions = SUGGESTED_QUESTIONS.filter((s) => ws.can("finance.read") || !/profit|expenses/i.test(s)).slice(0, 8);

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <aside className="hidden space-y-2 lg:block">
        <Button asChild className="w-full"><Link href="/assistant"><Plus /> New conversation</Link></Button>
        <p className="px-1 pt-3 text-2xs font-medium uppercase tracking-wide text-muted-foreground">History</p>
        <ul className="space-y-0.5">
          {(conversations ?? []).map((c) => (
            <li key={c.id} className="group flex items-center">
              <Link href={`/assistant?c=${c.id}`} className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm", c.id === active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1"><span className="block truncate">{c.title}</span><span className="text-2xs opacity-70">{formatDate(c.updated_at as string, { day: "numeric", month: "short" })}</span></span>
              </Link>
              <DeleteConversation id={c.id as string} />
            </li>
          ))}
          {(conversations ?? []).length === 0 && <li className="px-2 text-xs text-muted-foreground">No conversations yet.</li>}
        </ul>
      </aside>
      <section>
        <div className="mb-3 flex items-center justify-between lg:hidden">
          <h1 className="text-lg font-semibold">AI Assistant</h1>
          {active && <Button asChild size="sm" variant="outline"><Link href="/assistant"><Plus /> New</Link></Button>}
        </div>
        <Chat key={active ?? "new"} conversationId={active} initialMessages={messages} suggestions={suggestions} quota={q}
          autoAsk={!active ? sp.q : undefined} configured={Boolean(process.env.ANTHROPIC_API_KEY)} isDemo={ws.organization.is_demo} />
      </section>
    </div>
  );
}
