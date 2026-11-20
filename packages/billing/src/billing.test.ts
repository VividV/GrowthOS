import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { daysLeft, newPaymentReference, subscriptionBanner, toMinorUnits, usagePercent } from "./index";
import { eventKey, verifyWebhookSignature, initializeTransaction, verifyTransaction } from "./paystack";

const SECRET = "sk_test_abc123";
const sign = (body: string, key = SECRET) => createHmac("sha512", key).update(body).digest("hex");

describe("webhook signature", () => {
  const body = JSON.stringify({ event: "charge.success", data: { id: 1, reference: "R1", amount: 750000 } });
  it("accepts a correct signature", () => expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true));
  it("rejects a tampered body", () => expect(verifyWebhookSignature(body.replace("750000", "1"), sign(body), SECRET)).toBe(false));
  it("rejects the wrong key", () => expect(verifyWebhookSignature(body, sign(body, "sk_test_other"), SECRET)).toBe(false));
  it("rejects missing / malformed signatures", () => {
    expect(verifyWebhookSignature(body, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "abc", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "z".repeat(128), SECRET)).toBe(false);
  });
});

describe("event idempotency key", () => {
  it("is identical for retried deliveries and distinct across events", () => {
    const raw = '{"event":"charge.success","data":{"id":9,"reference":"R"}}';
    const e = JSON.parse(raw);
    expect(eventKey(e, raw)).toBe(eventKey(JSON.parse(raw), raw));
    expect(eventKey({ ...e, event: "invoice.update" }, raw)).not.toBe(eventKey(e, raw));
  });
  it("falls back to a body hash", () => {
    const raw = '{"event":"x","data":{}}';
    expect(eventKey(JSON.parse(raw), raw)).toMatch(/^x:sha256:[0-9a-f]{64}$/);
  });
});

describe("amounts", () => {
  it("converts to kobo without floating point error", () => {
    expect(toMinorUnits("7500.00")).toBe(750000);
    expect(toMinorUnits(15000)).toBe(1500000);
    expect(toMinorUnits("0.1")).toBe(10);
    expect(toMinorUnits("19.99")).toBe(1999);
  });
  it("generates unique references", () => {
    const refs = new Set(Array.from({ length: 200 }, () => newPaymentReference()));
    expect(refs.size).toBe(200);
  });
});

describe("subscription display", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  it("counts trial days", () => {
    expect(daysLeft("2026-11-27T10:00:00Z", now)).toBe(7);
    expect(daysLeft("2026-11-19T10:00:00Z", now)).toBe(0);
  });
  it("produces the right banner", () => {
    expect(subscriptionBanner({ state: "trialing", trial_ends_at: "2026-11-27T10:00:00Z" }, now)?.title).toBe("7 days left in your free trial");
    expect(subscriptionBanner({ state: "trialing", trial_ends_at: "2026-11-21T09:00:00Z" }, now)?.tone).toBe("warning");
    expect(subscriptionBanner({ state: "expired" }, now)?.tone).toBe("danger");
    expect(subscriptionBanner({ state: "active" }, now)).toBeNull();
    expect(subscriptionBanner({ state: "demo" }, now)).toBeNull();
  });
  it("usage percent handles unlimited", () => {
    expect(usagePercent(5, null)).toBeNull();
    expect(usagePercent(50, 100)).toBe(50);
    expect(usagePercent(150, 100)).toBe(100);
  });
});

describe("Paystack client", () => {
  it("never calls Paystack without a configured key", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    await expect(verifyTransaction("R")).rejects.toThrow(/not configured/);
  });
  it("sends amount in kobo and the plan code to initialize", async () => {
    process.env.PAYSTACK_SECRET_KEY = SECRET;
    let sent: { url: string; body: Record<string, unknown>; auth: string } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).Authorization! };
      return new Response(JSON.stringify({ status: true, data: { authorization_url: "https://checkout.paystack.com/x", access_code: "a", reference: "R" } }));
    }) as unknown as typeof fetch;
    const r = await initializeTransaction({ email: "a@b.co", amountKobo: 750000, reference: "R", callbackUrl: "https://app/cb", planCode: "PLN_1", metadata: { org: "o" } }, fake);
    expect(r.authorization_url).toContain("paystack");
    expect(sent?.url).toBe("https://api.paystack.co/transaction/initialize");
    expect(sent?.body).toMatchObject({ amount: 750000, plan: "PLN_1", currency: "NGN" });
    expect(sent?.auth).toBe(`Bearer ${SECRET}`);
    delete process.env.PAYSTACK_SECRET_KEY;
  });
});
