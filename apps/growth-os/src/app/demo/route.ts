import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@platform/database/server";
import { WORKSPACE_COOKIE } from "@platform/auth";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * "Explore the demo" entry point. Visitors without an account get an anonymous
 * Supabase session (if anonymous sign-ins are enabled) so they can explore a
 * fictional business without entering any details. They can convert to a real
 * account later from Settings → Account.
 */
export async function GET(request: NextRequest) {
  const supabase = await getServerClient();
  let { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (!(await rateLimit(`demo:${await clientIp()}`, 5, 3600))) {
      return NextResponse.redirect(new URL("/register?demo=1", request.url));
    }
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      // Anonymous sign-ins disabled in Supabase → ask the visitor to register first.
      return NextResponse.redirect(new URL("/register?demo=1", request.url));
    }
    user = data.user;
    await supabase.from("profiles").update({ full_name: "Demo visitor" }).eq("id", user.id);
  }

  const { data: orgId, error } = await supabase.rpc("create_demo_workspace");
  if (error || !orgId) return NextResponse.redirect(new URL("/login?error=demo", request.url));

  const res = NextResponse.redirect(new URL("/dashboard?welcome=demo", request.url));
  res.cookies.set(WORKSPACE_COOKIE, orgId as string, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  return res;
}
