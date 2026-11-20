"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@platform/database/server";
import { listWorkspaces, requireUser, requireWorkspace, WORKSPACE_COOKIE } from "@platform/auth";
import { capture } from "@platform/analytics";
import { sendEmail, templates } from "@platform/notifications";
import { runAction, fail, type ActionResult } from "./action";
import { uploadImage } from "./storage";
import { appUrl } from "./rate-limit";
import { reportError } from "./errors";

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };

const onboardingSchema = z.object({
  name: z.string().trim().min(2, "Enter your business name").max(120),
  category: z.string().trim().min(1, "Choose a category").max(60),
  description: z.string().trim().max(500).optional().default(""),
  country: z.string().trim().length(2).default("NG"),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default("NGN"),
  timezone: z.string().trim().min(3).max(60).default("Africa/Lagos"),
  business_email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  business_type: z.enum(["products", "services", "both"]).default("products"),
  products_sold: z.string().trim().max(300).optional().default(""),
  product_count_range: z.string().max(20).optional().default(""),
  employee_count_range: z.string().max(20).optional().default(""),
  experience: z.enum(["empty", "demo"]).default("empty"),
});

export async function completeOnboardingAction(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  let target: string | null = null;
  const res = await runAction(async () => {
    const user = await requireUser();
    const raw = JSON.parse(String(fd.get("payload") ?? "{}"));
    const input = onboardingSchema.parse(raw);
    try {
      Intl.DateTimeFormat(undefined, { timeZone: input.timezone });
    } catch {
      fail("Unknown timezone");
    }
    const supabase = await getServerClient();
    const { experience, ...p } = input;
    const { data: orgId, error } = await supabase.rpc("create_workspace", { p });
    if (error) throw error;

    const logo = fd.get("logo");
    if (logo instanceof File && logo.size > 0) {
      try {
        const path = await uploadImage(supabase, orgId as string, "logo", logo);
        await supabase.from("business_profiles").update({ logo_path: path }).eq("organization_id", orgId);
      } catch (e) {
        // The workspace exists; a failed logo upload must not block onboarding.
        await reportError(e, { where: "onboarding-logo", orgId, userId: user.id });
      }
    }

    let landing = orgId as string;
    if (experience === "demo") {
      const { data: demoId, error: demoErr } = await supabase.rpc("create_demo_workspace");
      if (!demoErr && demoId) landing = demoId as string;
      await capture(user.id, "demo_started", { from: "onboarding" });
    }
    (await cookies()).set(WORKSPACE_COOKIE, landing, COOKIE_OPTS);
    await capture(user.id, "workspace_created", { category: input.category });
    if (user.email) {
      const name = (user.user_metadata?.full_name as string | undefined) ?? "";
      await sendEmail({ to: user.email, ...templates.welcome(name, appUrl()) });
    }
    target = `/dashboard?welcome=${experience}`;
    return null;
  });
  if (res.ok && target) redirect(target);
  return res;
}

export async function switchWorkspaceAction(orgId: string): Promise<void> {
  const workspaces = await listWorkspaces();
  if (!workspaces.some((w) => w.id === orgId)) fail("You are not a member of that workspace", "forbidden");
  (await cookies()).set(WORKSPACE_COOKIE, orgId, COOKIE_OPTS);
  const supabase = await getServerClient();
  const user = await requireUser();
  await supabase.from("profiles").update({ default_organization_id: orgId }).eq("id", user.id);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function startDemoAction(): Promise<void> {
  const user = await requireUser();
  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc("create_demo_workspace");
  if (error) redirect("/dashboard?error=demo");
  (await cookies()).set(WORKSPACE_COOKIE, data as string, COOKIE_OPTS);
  await capture(user.id, "demo_started", { from: "app" });
  revalidatePath("/", "layout");
  redirect("/dashboard?welcome=demo");
}

export async function resetDemoAction(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await requireWorkspace();
    if (!ws.organization.is_demo) fail("Only demo workspaces can be reset", "forbidden");
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("reset_demo_workspace", { p_org: ws.organization.id });
    if (error) throw error;
    await capture(ws.user.id, "demo_reset");
    revalidatePath("/", "layout");
    return null;
  }, "Demo data has been reset");
}
