import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "@platform/database/service";
import { eventKey, verifyWebhookSignature, type PaystackEvent } from "@platform/billing/paystack";
import { sendEmail, templates } from "@platform/notifications";
import { verifyAndApply } from "@/server/billing-apply";
import { reportError } from "@/server/errors";
import { appUrl } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Paystack webhook.
 * 1. Verify HMAC-SHA512 signature over the RAW body (reject otherwise).
 * 2. Record the event under a unique key — duplicates are acknowledged and ignored (idempotency).
 * 3. Process: charges are re-verified with Paystack's API before anything is activated.
 * Always answers 200 for authentic events so Paystack stops retrying; failures are logged for review.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!verifyWebhookSignature(raw, request.headers.get("x-paystack-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let evt: PaystackEvent;
  try {
    evt = JSON.parse(raw) as PaystackEvent;
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const service = getServiceClient();
  const key = eventKey(evt, raw);
  const { data: inserted, error: insErr } = await service.from("payment_events")
    .insert({ provider: "paystack", event_key: key, event_type: evt.event, payload: evt })
    .select("id").maybeSingle();
  if (insErr) {
    if (insErr.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    await reportError(insErr, { where: "paystack-webhook-insert" });
    return NextResponse.json({ error: "store failed" }, { status: 500 }); // let Paystack retry
  }

  let outcome = "ignored";
  try {
    const d = evt.data as Record<string, unknown>;
    const sub = d.subscription as { subscription_code?: string } | undefined;
    const customer = d.customer as { customer_code?: string; email?: string } | undefined;
    switch (evt.event) {
      case "charge.success":
        outcome = await verifyAndApply(String(d.reference), { subscriptionCode: sub?.subscription_code ?? null });
        break;
      case "subscription.create": {
        const plan = d.plan as { plan_code?: string } | undefined;
        const { data } = await service.rpc("billing_attach_subscription", {
          p_customer_code: customer?.customer_code ?? null, p_subscription_code: d.subscription_code ?? null,
          p_email_token: d.email_token ?? null, p_paystack_plan_code: plan?.plan_code ?? null,
        });
        outcome = String(data);
        break;
      }
      case "invoice.payment_failed": {
        const { data } = await service.rpc("billing_mark_failed", {
          p_subscription_code: sub?.subscription_code ?? null, p_customer_code: customer?.customer_code ?? null, p_reason: "invoice.payment_failed",
        });
        outcome = String(data);
        if (customer?.email) await sendEmail({ to: customer.email, ...templates.paymentFailed("your workspace", `${appUrl()}/settings/billing`) });
        break;
      }
      case "subscription.not_renew":
      case "subscription.disable": {
        const { data } = await service.rpc("billing_mark_canceled", { p_subscription_code: d.subscription_code ?? null });
        outcome = String(data);
        break;
      }
    }
    await service.from("payment_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", inserted!.id);
  } catch (e) {
    await service.from("payment_events").update({ error: e instanceof Error ? e.message.slice(0, 500) : "error" }).eq("id", inserted!.id);
    await reportError(e, { where: "paystack-webhook", event: evt.event });
    // Remove the idempotency record so Paystack's retry can be processed again.
    await service.from("payment_events").delete().eq("id", inserted!.id);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, outcome });
}
