"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { getServerClient } from "@platform/database/server";
import { emailSchema, loginSchema, registerSchema, resetPasswordSchema, safeRedirect, WORKSPACE_COOKIE } from "@platform/auth";
import { capture } from "@platform/analytics";
import { runAction, formToObject, fail, type ActionResult } from "./action";
import { appUrl, clientIp, rateLimit } from "./rate-limit";

async function limitOrFail(scope: string, max: number, windowSeconds: number) {
  const ip = await clientIp();
  if (!(await rateLimit(`${scope}:${ip}`, max, windowSeconds))) fail("Too many attempts. Please wait a few minutes and try again.");
}

export async function signUpAction(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  let next: string | null = null;
  const res = await runAction(async () => {
    await limitOrFail("signup", 5, 600);
    const raw = formToObject(fd);
    const input = registerSchema.parse(raw);
    const after = safeRedirect(raw.next, "/onboarding");
    const supabase = await getServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { full_name: input.fullName }, emailRedirectTo: `${appUrl()}/auth/confirm?next=${encodeURIComponent(after)}` },
    });
    if (error) {
      if (/already registered|already exists/i.test(error.message)) fail("An account with this email already exists. Try signing in.");
      if (/password/i.test(error.message)) fail(error.message);
      fail("We couldn't create your account. Please try again.");
    }
    // Supabase returns a user with no identities when the email is already registered (enumeration protection).
    if (data.user && data.user.identities?.length === 0) fail("An account with this email already exists. Try signing in.");
    if (data.user) await capture(data.user.id, "user_signed_up");
    next = data.session ? after : `/verify-email?email=${encodeURIComponent(input.email)}`;
    return null;
  });
  if (res.ok && next) redirect(next);
  return res;
}

export async function signInAction(_: unknown, fd: FormData): Promise<ActionResult<{ unverified?: string }>> {
  const raw = formToObject(fd);
  let target: string | null = null;
  const res = await runAction(async () => {
    await limitOrFail("login", 10, 300);
    const input = loginSchema.parse(raw);
    const supabase = await getServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) {
      if (/not confirmed/i.test(error.message)) return { unverified: input.email };
      fail("Incorrect email or password.");
    }
    target = safeRedirect(raw.next);
    return {};
  });
  if (res.ok && target) redirect(target);
  return res;
}

export async function forgotPasswordAction(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await limitOrFail("forgot", 5, 900);
    const email = emailSchema.parse(fd.get("email"));
    const supabase = await getServerClient();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl()}/auth/confirm?next=/reset-password` });
    // Same response whether or not the account exists (no account enumeration).
    return null;
  }, "If an account exists for that email, a reset link is on its way.");
}

export async function resetPasswordAction(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  const res = await runAction(async () => {
    const input = resetPasswordSchema.parse(formToObject(fd));
    const supabase = await getServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) fail("Your reset link has expired. Request a new one.");
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) fail(/same/i.test(error.message) ? "Choose a password you haven't used before." : "Could not update your password.");
    return null;
  });
  if (res.ok) redirect("/dashboard?password=updated");
  return res;
}

export async function resendVerificationAction(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await limitOrFail("resend", 3, 600);
    const email = emailSchema.parse(fd.get("email"));
    const supabase = await getServerClient();
    await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${appUrl()}/auth/confirm?next=/onboarding` } });
    return null;
  }, "Verification email sent. Check your inbox (and spam folder).");
}

export async function signOutAction() {
  const supabase = await getServerClient();
  await supabase.auth.signOut();
  (await cookies()).delete(WORKSPACE_COOKIE);
  redirect("/login");
}

const profileSchema = z.object({ fullName: z.string().trim().min(2, "Enter your full name").max(120) });
export async function updateProfileAction(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { fullName } = profileSchema.parse(formToObject(fd));
    const supabase = await getServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) fail("Not signed in", "forbidden");
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", data.user.id);
    if (error) throw error;
    await supabase.auth.updateUser({ data: { full_name: fullName } });
    return null;
  }, "Profile updated");
}

export async function changeEmailAction(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await limitOrFail("email-change", 3, 900);
    const email = emailSchema.parse(fd.get("email"));
    const supabase = await getServerClient();
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${appUrl()}/auth/confirm?next=/settings/account` });
    if (error) fail("Could not start the email change. Is that address already in use?");
    return null;
  }, "Check both inboxes to confirm the change.");
}

export async function changePasswordAction(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const input = resetPasswordSchema.parse(formToObject(fd));
    const supabase = await getServerClient();
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) fail("Could not update your password.");
    return null;
  }, "Password updated");
}
