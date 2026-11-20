"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerClient } from "@platform/database/server";
import { audit, db, requireStaffWrite } from "./staff";

type R = { ok: true; message?: string } | { ok: false; error: string };
async function wrap(fn: () => Promise<string | void>): Promise<R> {
  try {
    const m = await fn();
    return { ok: true, message: m || "Saved" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function signInAction(_: unknown, fd: FormData): Promise<R> {
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  const supabase = await getServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: "Invalid credentials" };
  const { data: role } = await supabase.rpc("my_platform_role");
  if (!role) {
    await supabase.auth.signOut();
    return { ok: false, error: "This account is not authorised for the internal admin panel." };
  }
  redirect("/");
}

export async function signOutAction() {
  const supabase = await getServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function extendTrialAction(orgId: string, days: number): Promise<R> {
  return wrap(async () => {
    const staff = await requireStaffWrite("workspaces");
    const n = z.number().int().min(1).max(60).parse(days);
    const { data: sub } = await db().from("subscriptions").select("id, status, trial_ends_at").eq("organization_id", z.string().uuid().parse(orgId)).single();
    if (!sub) throw new Error("No subscription");
    if (!["trialing", "expired"].includes(sub.status as string)) throw new Error("Only trial / expired-trial workspaces can be extended");
    const base = Math.max(Date.now(), new Date(sub.trial_ends_at as string).getTime());
    const until = new Date(base + n * 86_400_000).toISOString();
    await db().from("subscriptions").update({ status: "trialing", trial_ends_at: until }).eq("id", sub.id);
    await audit(staff, "admin.trial_extended", "subscription", sub.id as string, { days: n, until }, orgId);
    revalidatePath("/workspaces");
    return `Trial extended by ${n} days`;
  });
}

export async function setEntitlementStatusAction(orgId: string, status: "active" | "suspended"): Promise<R> {
  return wrap(async () => {
    const staff = await requireStaffWrite("workspaces");
    const { data: p } = await db().from("platform_products").select("id").eq("code", "growth-os").single();
    await db().from("organization_products").update({ status: z.enum(["active", "suspended"]).parse(status) }).eq("organization_id", orgId).eq("product_id", p!.id);
    await audit(staff, `admin.entitlement_${status}`, "organization", orgId, { product: "growth-os" }, orgId);
    revalidatePath("/workspaces");
    return status === "suspended" ? "Growth OS access suspended" : "Growth OS access restored";
  });
}

const planSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300),
  price: z.coerce.number().min(0).max(1e9),
  paystack_plan_code: z.string().trim().max(60).regex(/^(PLN_[A-Za-z0-9]+)?$/, "Paystack plan codes look like PLN_xxx").transform((v) => v || null),
  is_active: z.boolean(),
  is_public: z.boolean(),
  features: z.array(z.string().trim().min(1).max(120)).max(15),
  entitlements: z.array(z.object({ key: z.string(), enabled: z.boolean(), limit_value: z.number().int().min(0).nullable() })),
});

export async function savePlanAction(raw: unknown): Promise<R> {
  return wrap(async () => {
    const staff = await requireStaffWrite("plans");
    const p = planSchema.parse(raw);
    const { data: before } = await db().from("subscription_plans").select("price, paystack_plan_code, is_active").eq("id", p.id).single();
    const { error } = await db().from("subscription_plans").update({
      name: p.name, description: p.description, price: p.price, paystack_plan_code: p.paystack_plan_code, is_active: p.is_active, is_public: p.is_public, features: p.features,
    }).eq("id", p.id);
    if (error) throw new Error(error.message);
    for (const e of p.entitlements) {
      await db().from("plan_entitlements").upsert({ plan_id: p.id, key: e.key, enabled: e.enabled, limit_value: e.limit_value });
    }
    await audit(staff, "admin.plan_updated", "subscription_plan", p.id, { before, after: { price: p.price, paystack_plan_code: p.paystack_plan_code, is_active: p.is_active }, entitlements: p.entitlements });
    revalidatePath("/plans");
    return "Plan saved. Existing subscribers keep their current period price until renewal.";
  });
}

export async function setFlagAction(key: string, enabled: boolean): Promise<R> {
  return wrap(async () => {
    const staff = await requireStaffWrite("flags");
    await db().from("feature_flags").update({ enabled, updated_at: new Date().toISOString() }).eq("key", key);
    await audit(staff, "admin.flag_changed", "feature_flag", key, { enabled });
    revalidatePath("/flags");
    return `${key} ${enabled ? "enabled" : "disabled"}`;
  });
}

export async function setAiSettingsAction(provider: string, model: string): Promise<R> {
  return wrap(async () => {
    const staff = await requireStaffWrite("ai");
    const p = z.enum(["anthropic", "disabled"]).parse(provider);
    const m = z.string().trim().regex(/^[a-z0-9.\-]{3,60}$/).parse(model);
    const { data: before } = await db().from("platform_settings").select("value").eq("key", "ai").single();
    const value = { ...(before?.value as object), provider: p, model: m };
    await db().from("platform_settings").update({ value, updated_by: staff.id, updated_at: new Date().toISOString() }).eq("key", "ai");
    await audit(staff, "admin.ai_settings_changed", "platform_settings", "ai", { before: before?.value, after: value });
    revalidatePath("/ai");
    return "AI settings saved";
  });
}

export async function setSupportStatusAction(id: string, status: string): Promise<R> {
  return wrap(async () => {
    const staff = await requireStaffWrite("support");
    const s = z.enum(["open", "in_progress", "resolved", "closed"]).parse(status);
    await db().from("support_requests").update({ status: s }).eq("id", z.string().uuid().parse(id));
    await audit(staff, "admin.support_status", "support_request", id, { status: s });
    revalidatePath("/support");
    return "Status updated";
  });
}
