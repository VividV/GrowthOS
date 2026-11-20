import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getServerClient } from "@platform/database/server";
import { safeRedirect } from "@platform/auth/validation";

/**
 * Handles every Supabase email link: sign-up verification, password recovery,
 * email change and magic links. Supports both the token_hash flow (recommended
 * email templates) and the PKCE ?code= flow.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeRedirect(url.searchParams.get("next"), "/dashboard");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const supabase = await getServerClient();

  let ok = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }
  return NextResponse.redirect(new URL(ok ? next : "/login?error=link", request.url));
}
