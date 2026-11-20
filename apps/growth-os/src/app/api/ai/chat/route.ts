import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@platform/auth";
import { AssistantError, runAssistantTurn } from "@/server/ai/assistant";
import { reportError } from "@/server/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const body = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1, "Type a question").max(2000, "Keep questions under 2,000 characters"),
});

export async function POST(request: NextRequest) {
  // Same-origin check (defence against CSRF on a cookie-authenticated JSON endpoint).
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  try {
    const ws = await requireWorkspace();
    const result = await runAssistantTurn(ws, parsed.data, request.signal);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AssistantError) return NextResponse.json({ error: e.message }, { status: e.status });
    await reportError(e, { where: "api/ai/chat" });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
