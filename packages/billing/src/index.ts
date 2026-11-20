/**
 * Product-agnostic billing helpers. Plan prices, features and limits live in
 * the database (subscription_plans / plan_entitlements) and are editable from
 * the admin panel — nothing here hard-codes a price.
 */
export type SubscriptionState = "demo" | "trialing" | "active" | "past_due" | "expired" | "none";

export const ENTITLEMENT_LABELS: Record<string, string> = {
  max_users: "Team members",
  max_products: "Products",
  max_customers: "Customers",
  max_orders_per_month: "Orders per month",
  ai_messages_per_month: "AI assistant messages per month",
  csv_export: "CSV exports",
  csv_import: "CSV imports",
  advanced_inventory: "Advanced inventory",
  advanced_reports: "Advanced reports",
  priority_support: "Priority support",
  advanced_insights: "Additional business insights",
};

const DAY = 86_400_000;

export function daysLeft(until: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!until) return null;
  return Math.max(0, Math.ceil((new Date(until).getTime() - now.getTime()) / DAY));
}

export interface SubscriptionView {
  state: SubscriptionState;
  plan_name?: string | null;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
}

/** Human banner for the current subscription, or null when nothing needs saying. */
export function subscriptionBanner(sub: SubscriptionView | null, now: Date = new Date()):
  { tone: "info" | "warning" | "danger"; title: string; body: string } | null {
  if (!sub || sub.state === "demo") return null;
  if (sub.state === "trialing") {
    const d = daysLeft(sub.trial_ends_at, now) ?? 0;
    return {
      tone: d <= 2 ? "warning" : "info",
      title: d === 0 ? "Your free trial ends today" : `${d} day${d === 1 ? "" : "s"} left in your free trial`,
      body: "Choose a plan any time — you won't be charged automatically when the trial ends.",
    };
  }
  if (sub.state === "past_due") {
    return { tone: "warning", title: "We couldn't renew your subscription", body: "Update your payment within the grace period to avoid read-only mode." };
  }
  if (sub.state === "expired" || sub.state === "none") {
    return { tone: "danger", title: "Your workspace is read-only", body: "All your records are safe. Choose a plan to continue adding and editing." };
  }
  if (sub.cancel_at_period_end && sub.current_period_end) {
    return { tone: "info", title: "Your subscription is cancelled", body: `You keep full access until ${new Date(sub.current_period_end).toDateString()}.` };
  }
  return null;
}

export function usagePercent(used: number, limit: number | null | undefined): number | null {
  if (limit === null || limit === undefined) return null;
  if (limit === 0) return 100;
  return Math.min(100, Math.round((used / limit) * 100));
}

/** Converts a major-unit amount (e.g. 7500.00 NGN) to the smallest unit Paystack expects (kobo). */
export function toMinorUnits(amount: number | string): number {
  const [whole, frac = ""] = String(amount).split(".");
  const kobo = Number(whole) * 100 + Number((frac + "00").slice(0, 2)) * (String(amount).startsWith("-") ? -1 : 1);
  if (!Number.isSafeInteger(kobo)) throw new Error("Invalid amount");
  return kobo;
}

export function fromMinorUnits(kobo: number): number {
  return Math.round(kobo) / 100;
}

export function newPaymentReference(prefix = "GOS"): string {
  const rand = crypto.getRandomValues(new Uint8Array(8));
  return `${prefix}-${Date.now().toString(36)}-${Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
