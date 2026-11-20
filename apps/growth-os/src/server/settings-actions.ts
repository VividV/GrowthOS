"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@platform/database/server";
import { getServiceClient } from "@platform/database/service";
import { requireWorkspace } from "@platform/auth";
import { ROLE_LABELS } from "@platform/permissions";
import { sendEmail, templates } from "@platform/notifications";
import { runAction, fail, formToObject, type ActionResult } from "./action";
import { uploadImage } from "./storage";
import { appUrl, rateLimit } from "./rate-limit";

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

const businessSchema = z.object({
  name: z.string().trim().min(2, "Business name is too short").max(120),
  category: opt(60),
  description: opt(500),
  currency: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().min(3).max(60).refine((tz) => { try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return true; } catch { return false; } }, "Unknown timezone"),
  business_email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]).optional().transform((v) => v || null),
  phone: opt(30),
  address: opt(300),
  order_prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,8}$/, "1–8 letters or numbers"),
  stock_policy: z.enum(["reserve_on_confirm", "deduct_on_confirm"]),
  allow_negative_stock: z.enum(["on", "off"]).optional().transform((v) => v === "on"),
});

export async function updateBusinessAction(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await requireWorkspace();
    if (!ws.can("settings.manage")) fail("Only owners and admins can change business settings.", "forbidden");
    if (!ws.writable) fail("Your workspace is read-only. Choose a plan to make changes.", "subscription");
    const i = businessSchema.parse(formToObject(fd));
    const supabase = await getServerClient();
    const org = ws.organization.id;
    const { error: e1 } = await supabase.from("organizations").update({ name: i.name, category: i.category, description: i.description, currency: i.currency, timezone: i.timezone }).eq("id", org);
    if (e1) throw e1;
    const bp: Record<string, unknown> = { business_email: i.business_email, phone: i.phone, address: i.address, order_prefix: i.order_prefix, stock_policy: i.stock_policy, allow_negative_stock: i.allow_negative_stock };
    const logo = fd.get("logo");
    if (logo instanceof File && logo.size > 0) bp.logo_path = await uploadImage(supabase, org, "logo", logo);
    const { error: e2 } = await supabase.from("business_profiles").update(bp).eq("organization_id", org);
    if (e2) throw e2;
    revalidatePath("/", "layout");
    return null;
  }, "Business settings saved");
}

export async function inviteMemberAction(_: unknown, fd: FormData): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  return runAction(async () => {
    const ws = await requireWorkspace();
    if (!ws.can("members.manage")) fail("You can't manage team members.", "forbidden");
    if (!(await rateLimit(`invite:${ws.user.id}`, 20, 3600))) fail("Too many invitations. Try again later.");
    const { email, role } = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email"), role: z.enum(["admin", "manager", "staff", "viewer"]) }).parse(formToObject(fd));
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("create_invitation", { p_org: ws.organization.id, p_email: email, p_role: role, p_token_hash: hash });
    if (error) throw error;
    const link = `${appUrl()}/invite/${token}`;
    const inviter = (ws.user.user_metadata?.full_name as string | undefined) || ws.user.email || "A teammate";
    const sent = await sendEmail({ to: email, ...templates.invitation(inviter, ws.organization.name, ROLE_LABELS[role].label, link) });
    revalidatePath("/settings/team");
    return { link, emailed: sent.sent };
  }, "Invitation created");
}

export async function updateMemberAction(memberId: string, role: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireWorkspace();
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("update_member", { p_member: z.string().uuid().parse(memberId), p_role: z.enum(["admin", "manager", "staff", "viewer"]).parse(role), p_status: null });
    if (error) throw error;
    revalidatePath("/settings/team");
    return null;
  }, "Role updated");
}

export async function removeMemberAction(memberId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireWorkspace();
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("remove_member", { p_member: z.string().uuid().parse(memberId) });
    if (error) throw error;
    revalidatePath("/settings/team");
    return null;
  }, "Member removed");
}

export async function revokeInvitationAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await requireWorkspace();
    if (!ws.can("members.manage")) fail("You can't manage team members.", "forbidden");
    // Invitations have no client update policy; verified above, then scoped to this workspace.
    const { error } = await getServiceClient().from("organization_invitations").update({ revoked_at: new Date().toISOString() })
      .eq("id", z.string().uuid().parse(id)).eq("organization_id", ws.organization.id);
    if (error) throw error;
    revalidatePath("/settings/team");
    return null;
  }, "Invitation revoked");
}

export async function acceptInvitationAction(token: string): Promise<ActionResult<{ orgId: string }>> {
  return runAction(async () => {
    const hash = createHash("sha256").update(z.string().min(20).max(100).parse(token)).digest("hex");
    const supabase = await getServerClient();
    const { data, error } = await supabase.rpc("accept_invitation", { p_token_hash: hash });
    if (error) throw error;
    const { cookies } = await import("next/headers");
    const { WORKSPACE_COOKIE } = await import("@platform/auth");
    (await cookies()).set(WORKSPACE_COOKIE, data as string, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
    return { orgId: data as string };
  }, "Welcome to the team!");
}

export async function supportRequestAction(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await requireWorkspace();
    if (!(await rateLimit(`support:${ws.user.id}`, 5, 3600))) fail("Too many requests. Please wait a while.");
    const i = z.object({ subject: z.string().trim().min(3, "Add a subject").max(200), message: z.string().trim().min(5, "Describe the problem").max(5000) }).parse(formToObject(fd));
    const supabase = await getServerClient();
    const { error } = await supabase.from("support_requests").insert({ ...i, user_id: ws.user.id, organization_id: ws.organization.id });
    if (error) throw error;
    return null;
  }, "Thanks — our team will get back to you by email.");
}

/** Lets a demo visitor (anonymous session) keep their account by adding an email + password. */
export async function convertAnonymousAction(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { registerSchema } = await import("@platform/auth/validation");
    const i = registerSchema.parse(formToObject(fd));
    const supabase = await getServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user?.is_anonymous) fail("This account already has an email address.");
    const { error } = await supabase.auth.updateUser({ email: i.email, password: i.password, data: { full_name: i.fullName } }, { emailRedirectTo: `${appUrl()}/auth/confirm?next=/onboarding` });
    if (error) fail(/already/i.test(error.message) ? "An account with this email already exists." : "Could not save your account.");
    await supabase.from("profiles").update({ full_name: i.fullName }).eq("id", data.user!.id);
    return null;
  }, "Check your email to confirm your address — then set up your own business.");
}
