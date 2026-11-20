import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@platform/database/middleware";

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  if (!user && !request.nextUrl.pathname.startsWith("/login")) return NextResponse.redirect(new URL("/login", request.url));
  // Internal tool: never indexable, never framed.
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.svg).*)"] };
