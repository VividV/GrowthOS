import { createHmac, createHash, timingSafeEqual } from "node:crypto";

/**
 * Minimal Paystack REST client (server-only). Docs: https://paystack.com/docs/api/
 * The secret key is read lazily so an unconfigured deployment fails loudly at
 * the point of use instead of pretending payments work.
 */
const BASE = "https://api.paystack.co";

export class PaystackNotConfiguredError extends Error {
  constructor() {
    super("Paystack is not configured: set PAYSTACK_SECRET_KEY");
  }
}

export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

function secret(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new PaystackNotConfiguredError();
  return key;
}

async function call<T>(path: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<T> {
  const res = await fetchImpl(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || !body.status) throw new Error(`Paystack ${path} failed: ${body.message ?? res.status}`);
  return body.data as T;
}

export interface InitializeInput {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  planCode?: string | null;
  metadata: Record<string, unknown>;
}

export async function initializeTransaction(input: InitializeInput, fetchImpl?: typeof fetch) {
  return call<{ authorization_url: string; access_code: string; reference: string }>(
    "/transaction/initialize",
    {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        reference: input.reference,
        callback_url: input.callbackUrl,
        currency: "NGN",
        // With a plan code Paystack creates a recurring subscription the customer explicitly consents to at checkout.
        ...(input.planCode ? { plan: input.planCode } : {}),
        metadata: input.metadata,
      }),
    },
    fetchImpl,
  );
}

export interface VerifiedTransaction {
  status: string; reference: string; amount: number; currency: string; paid_at: string | null; channel: string | null;
  customer: { customer_code: string; email: string } | null;
  plan: string | { plan_code?: string } | null;
  metadata: Record<string, unknown> | null;
}

/** Server-to-server verification — the only thing we trust as proof of payment (with the signed webhook). */
export async function verifyTransaction(reference: string, fetchImpl?: typeof fetch): Promise<VerifiedTransaction> {
  return call<VerifiedTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`, {}, fetchImpl);
}

export async function disableSubscription(code: string, emailToken: string, fetchImpl?: typeof fetch) {
  return call<unknown>("/subscription/disable", { method: "POST", body: JSON.stringify({ code, token: emailToken }) }, fetchImpl);
}

export async function subscriptionManageLink(code: string, fetchImpl?: typeof fetch) {
  return call<{ link: string }>(`/subscription/${encodeURIComponent(code)}/manage/link`, {}, fetchImpl);
}

/* ------------------------------------------------------------------ Webhooks */

/** Verifies x-paystack-signature: HMAC-SHA512 of the raw body with the secret key. Constant-time compare. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secretKey: string = secret()): boolean {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody, "utf8").digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface PaystackEvent {
  event: string;
  data: Record<string, unknown> & { id?: number | string; reference?: string };
}

/**
 * Stable idempotency key. Paystack retries deliver the identical body, so a
 * hash of event type + object id (+ reference) dedupes retries without
 * collapsing genuinely different events.
 */
export function eventKey(evt: PaystackEvent, rawBody: string): string {
  const id = evt.data?.id ?? evt.data?.reference;
  if (id !== undefined && id !== null) return `${evt.event}:${String(id)}:${String(evt.data?.reference ?? "")}`;
  return `${evt.event}:sha256:${createHash("sha256").update(rawBody).digest("hex")}`;
}

/** Paystack documents these source IPs for webhooks; used as an extra (optional) check. */
export const PAYSTACK_WEBHOOK_IPS = ["52.31.139.75", "52.49.173.169", "52.214.14.220"];
