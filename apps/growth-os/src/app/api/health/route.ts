import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness + configuration probe for uptime monitors. Reveals no secrets. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "growth-os",
    time: new Date().toISOString(),
    integrations: {
      supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      paystack: Boolean(process.env.PAYSTACK_SECRET_KEY),
      ai: Boolean(process.env.ANTHROPIC_API_KEY),
      email: Boolean(process.env.RESEND_API_KEY),
    },
  });
}
