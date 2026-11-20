import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@platform/database/middleware";

const PUBLIC_PREFIXES = [
  "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/auth/", "/invite/",
  "/demo", "/api/webhooks/", "/api/cron/", "/api/health", "/offline", "/setup",
];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { response, user } = await updateSession(request);
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && !pathname.startsWith("/setup") && !pathname.startsWith("/api/health")) {
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  if (!user && !isPublic) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (user && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|robots.txt).*)"],
};
