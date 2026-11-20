import "server-only";
import { getServiceClient } from "@platform/database/service";
import { fromMinorUnits } from "@platform/billing";
import { disableSubscription, verifyTransaction } from "@platform/billing/paystack";
import { sendEmail, templates } from "@platform/notifications";
import { capture } from "@platform/analytics";
import { appUrl } from "./rate-limit";

/**
 * Verifies a transaction with Paystack (server-to-server) and, only if
 * Paystack confirms success, applies it. Safe to call repeatedly: the SQL
 * function is idempotent on the reference.
 */
export async function verifyAndApply(reference: string, hints: { subscriptionCode?: string | null } = {}): Promise<string> {
  const tx = await verifyTransaction(reference);
  if (tx.status !== "success") return `not_successful:${tx.status}`;
  const planCode = typeof tx.plan === "string" ? tx.plan : tx.plan?.plan_code ?? null;
  const service = getServiceClient();
  // Snapshot the current recurring subscription so a plan switch can retire it (prevents double billing).
  const { data: pending } = await service.from("payment_transactions").select("organization_id").eq("reference", tx.reference).maybeSingle();
  const { data: prior } = pending
    ? await service.from("subscriptions").select("paystack_subscription_code, paystack_email_token").eq("organization_id", pending.organization_id).maybeSingle()
    : { data: null };
  const { data, error } = await service.rpc("billing_apply_charge_success", {
    p_reference: tx.reference,
    p_amount: fromMinorUnits(tx.amount),
    p_currency: tx.currency,
    p_paid_at: tx.paid_at,
    p_channel: tx.channel,
    p_customer_code: tx.customer?.customer_code ?? null,
    p_subscription_code: hints.subscriptionCode ?? null,
    p_paystack_plan_code: planCode,
    p_raw: tx as unknown as Record<string, unknown>,
  });
  if (error) throw new Error(`billing_apply_charge_success failed: ${error.message}`);
  const result = data as string;

  // A new checkout replaced an existing auto-renewing Paystack subscription: disable the old one.
  const oldCode = prior?.paystack_subscription_code as string | null | undefined;
  const newCode = hints.subscriptionCode ?? null;
  if (result === "activated" && oldCode && prior?.paystack_email_token && oldCode !== newCode) {
    try {
      await disableSubscription(oldCode, prior.paystack_email_token as string);
      await service.from("subscriptions").update({ paystack_subscription_code: newCode, paystack_email_token: null }).eq("organization_id", pending!.organization_id);
      await service.from("audit_logs").insert({ organization_id: pending!.organization_id, actor_type: "system", action: "subscription.previous_disabled", metadata: { old_code: oldCode } });
    } catch (e) {
      // Surface for manual follow-up rather than failing the (already applied) payment.
      await service.from("app_errors").insert({ app: "growth-os", message: `Failed to disable previous Paystack subscription ${oldCode}: ${e instanceof Error ? e.message : e}`, organization_id: pending!.organization_id });
    }
  }

  if (result === "activated" || result === "renewed") {
    const { data: row } = await service.from("payment_transactions")
      .select("organization_id, amount, currency, initiated_by, subscription_plans(name), organizations(name), subscriptions(current_period_end)")
      .eq("reference", tx.reference).maybeSingle();
    const email = tx.customer?.email;
    if (row && email) {
      const plan = (row.subscription_plans as unknown as { name: string } | null)?.name ?? "Growth OS";
      const org = (row.organizations as unknown as { name: string } | null)?.name ?? "your business";
      const until = (row.subscriptions as unknown as { current_period_end: string } | null)?.current_period_end;
      const amount = new Intl.NumberFormat("en-NG", { style: "currency", currency: String(row.currency) }).format(Number(row.amount));
      await sendEmail({ to: email, ...templates.paymentReceived(org, plan, amount, until ? new Date(until).toDateString() : "next month", `${appUrl()}/settings/billing`) });
      if (row.initiated_by) await capture(String(row.initiated_by), "subscription_activated", { plan, result });
    }
  }
  return result;
}
