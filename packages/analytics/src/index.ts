/**
 * Product analytics (PostHog). Server-side capture via the public capture API.
 * No-op when NEXT_PUBLIC_POSTHOG_KEY is unset. Never send business record
 * contents (customer names, amounts) — only event names and coarse properties.
 */
export type AnalyticsEvent =
  | "user_signed_up" | "workspace_created" | "demo_started" | "demo_reset"
  | "customer_created" | "customers_imported" | "product_created" | "order_created" | "payment_recorded"
  | "expense_recorded" | "task_created" | "ai_question_asked" | "checkout_started" | "subscription_activated";

export function analyticsEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
}

export async function capture(
  distinctId: string,
  event: AnalyticsEvent,
  properties: Record<string, string | number | boolean | null> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
  try {
    await fetchImpl(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, event, distinct_id: distinctId, properties: { ...properties, $lib: "platform-server" } }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // Analytics must never break a user action.
  }
}
