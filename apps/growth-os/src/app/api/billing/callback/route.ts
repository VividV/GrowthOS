import { NextResponse, type NextRequest } from "next/server";
import { verifyAndApply } from "@/server/billing-apply";
import { reportError } from "@/server/errors";

export const dynamic = "force-dynamic";

/**
 * Paystack redirects the browser here after checkout. The redirect itself
 * proves nothing: we verify the reference with Paystack's API server-side and
 * only then apply it. The webhook does the same independently (idempotent).
 */
export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference") ?? request.nextUrl.searchParams.get("trxref");
  const back = (status: string) => NextResponse.redirect(new URL(`/settings/billing?payment=${status}`, request.url));
  if (!reference || !/^[A-Za-z0-9._=-]{6,100}$/.test(reference)) return back("invalid");
  try {
    const result = await verifyAndApply(reference);
    if (result === "activated" || result === "renewed" || result === "already_processed") return back("success");
    if (result === "amount_mismatch") return back("mismatch");
    return back("pending");
  } catch (e) {
    await reportError(e, { where: "billing-callback", reference });
    return back("pending");
  }
}
