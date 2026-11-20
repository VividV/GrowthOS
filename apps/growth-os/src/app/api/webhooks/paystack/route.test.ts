import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SECRET = "sk_test_webhook";
const store = { events: new Map<string, string>(), deleted: [] as string[] };
const verifyAndApply = vi.fn(async () => "activated");

vi.mock("@/server/billing-apply", () => ({ verifyAndApply: (...a: unknown[]) => verifyAndApply(...(a as [])) }));
vi.mock("@/server/errors", () => ({ reportError: vi.fn() }));
vi.mock("@platform/notifications", () => ({ sendEmail: vi.fn(async () => ({ sent: false, reason: "test" })), templates: { paymentFailed: () => ({ subject: "", html: "", text: "" }) } }));
vi.mock("@platform/database/service", () => ({
  getServiceClient: () => ({
    from: () => ({
      insert: (row: { event_key: string }) => ({
        select: () => ({
          maybeSingle: async () => {
            if (store.events.has(row.event_key)) return { data: null, error: { code: "23505", message: "duplicate" } };
            const id = `ev-${store.events.size + 1}`;
            store.events.set(row.event_key, id);
            return { data: { id }, error: null };
          },
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({ eq: async (_c: string, id: string) => { store.deleted.push(id); for (const [k, v] of store.events) if (v === id) store.events.delete(k); return { error: null }; } }),
    }),
    rpc: vi.fn(async () => ({ data: "ok", error: null })),
  }),
}));

const { POST } = await import("./route");

const sign = (body: string) => createHmac("sha512", SECRET).update(body).digest("hex");
const req = (body: string, sig: string | null) =>
  new NextRequest("http://localhost/api/webhooks/paystack", { method: "POST", body, headers: sig ? { "x-paystack-signature": sig } : {} });
const charge = JSON.stringify({ event: "charge.success", data: { id: 101, reference: "GOS-REF-1", amount: 750000 } });

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;
  store.events.clear();
  store.deleted = [];
  verifyAndApply.mockReset().mockResolvedValue("activated");
});

describe("Paystack webhook", () => {
  it("rejects unsigned or tampered requests without touching billing", async () => {
    expect((await POST(req(charge, null))).status).toBe(401);
    expect((await POST(req(charge.replace("750000", "1"), sign(charge)))).status).toBe(401);
    expect(verifyAndApply).not.toHaveBeenCalled();
  });

  it("processes a verified charge by re-verifying with Paystack", async () => {
    const res = await POST(req(charge, sign(charge)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, outcome: "activated" });
    expect(verifyAndApply).toHaveBeenCalledWith("GOS-REF-1", { subscriptionCode: null });
  });

  it("is idempotent: a retried delivery is acknowledged but not processed again", async () => {
    await POST(req(charge, sign(charge)));
    const second = await POST(req(charge, sign(charge)));
    expect(await second.json()).toMatchObject({ ok: true, duplicate: true });
    expect(verifyAndApply).toHaveBeenCalledTimes(1);
  });

  it("lets Paystack retry when processing fails", async () => {
    verifyAndApply.mockRejectedValueOnce(new Error("paystack down"));
    expect((await POST(req(charge, sign(charge)))).status).toBe(500);
    expect(store.events.size).toBe(0); // idempotency record removed so the retry is processed
    expect((await POST(req(charge, sign(charge)))).status).toBe(200);
    expect(verifyAndApply).toHaveBeenCalledTimes(2);
  });

  it("refuses to run when Paystack isn't configured", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    expect((await POST(req(charge, sign(charge)))).status).toBe(503);
  });
});
