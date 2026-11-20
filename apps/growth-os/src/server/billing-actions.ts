"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@platform/auth";
import { getServiceClient } from "@platform/database/service";
import { newPaymentReference, toMinorUnits } from "@platform/billing";
import { disableSubscription, initializeTransaction, isPaystackConfigured } from "@platform/billing/paystack";
import { capture } from "@platform/analytics";
import { runAction, fail, type ActionResult } from "./action";
import { appUrl } from "./rate-limit";

async function owner() {
  const ws = await requireWorkspace();
  if (!ws.can("billing.manage")) fail("Only the workspace owner can manage billing.", "forbidden");
  if (ws.organization.is_demo) fail("Demo workspaces can't be upgraded. Switch to your own business first.", "forbidden");
  return ws;
}

/**
 * Starts a Paystack checkout. A pending transaction is recorded first; the
 * subscription is only activated after server-side verification (callback
 * verify or signed webhook) — never because the browser came back.
 */
export async function startCheckoutAction(planCode: string): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const ws = await owner();
    if (!isPaystackConfigured()) fail("Online payments aren't configured on this deployment yet. Please contact support.", "unknown");
    const code = z.enum(["starter", "growth", "pro"]).parse(planCode);
    const email = ws.user.email;
    if (!email) fail("Add an email address to your account before subscribing.");
    const reference = newPaymentReference();
    const service = getServiceClient();
    const { data, error } = await service.rpc("billing_create_checkout", { p_org: ws.organization.id, p_plan_code: code, p_reference: reference, p_user: ws.user.id });
    if (error) throw error;
    const plan = data as { amount: number; paystack_plan_code: string | null; plan_name: string };
    const init = await initializeTransaction({
      email, amountKobo: toMinorUnits(plan.amount), reference, callbackUrl: `${appUrl()}/api/billing/callback`,
      planCode: plan.paystack_plan_code, metadata: { organization_id: ws.organization.id, plan_code: code, product: "growth-os" },
    });
    await capture(ws.user.id, "checkout_started", { plan: code });
    return { url: init.authorization_url };
  });
}

export async function cancelSubscriptionAction(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await owner();
    const service = getServiceClient();
    const { data: sub } = await service.from("subscriptions").select("id, status, paystack_subscription_code, paystack_email_token, current_period_end")
      .eq("organization_id", ws.organization.id).maybeSingle();
    if (!sub || sub.status !== "active") fail("There is no active paid subscription to cancel.");
    if (sub.paystack_subscription_code && sub.paystack_email_token && isPaystackConfigured()) {
      await disableSubscription(sub.paystack_subscription_code as string, sub.paystack_email_token as string);
    }
    await service.from("subscriptions").update({ status: "canceled", cancel_at_period_end: true, canceled_at: new Date().toISOString() }).eq("id", sub.id);
    await service.from("audit_logs").insert({ organization_id: ws.organization.id, actor_id: ws.user.id, action: "subscription.cancel_requested", entity_type: "subscription", entity_id: sub.id });
    revalidatePath("/settings/billing");
    return null;
  }, "Subscription cancelled. You keep access until the end of the paid period — your data is never deleted.");
}
