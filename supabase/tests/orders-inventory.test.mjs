import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, closeDb, expectCode, newWorkspace, num, order, orderRow, product, rpc, sql, variantsOf } from "./helpers.mjs";

let W;
beforeAll(async () => { W = await newWorkspace("Inv", "Inventory Biz"); });
afterAll(closeDb);

const stock = async (variantId) => {
  const [v] = await sql(`select quantity_on_hand::int as on_hand, quantity_reserved::int as reserved from product_variants where id = $1`, [variantId]);
  return v;
};

/** Invariant: the ledger always explains current stock exactly. */
async function assertLedgerMatches(org) {
  const rows = await sql(`
    select v.id, v.quantity_on_hand, v.quantity_reserved,
           coalesce(sum(m.quantity_change), 0) as ledger_on_hand, coalesce(sum(m.reserved_change), 0) as ledger_reserved
    from product_variants v left join inventory_movements m on m.variant_id = v.id
    where v.organization_id = $1 group by v.id`, [org]);
  for (const r of rows) {
    expect(num(r.ledger_on_hand)).toBe(num(r.quantity_on_hand));
    expect(num(r.ledger_reserved)).toBe(num(r.quantity_reserved));
  }
  return rows.length;
}

describe("products & variants", () => {
  it("creates a product with variants, each with its own SKU and opening stock", async () => {
    const id = await product(W.user, W.org, {
      name: "Ankara Shirt", cost_price: 6000, selling_price: 12000,
      variants: [
        { options: { Colour: "Blue", Size: "S" }, sku: "ANK-B-S", opening_quantity: 5 },
        { options: { Colour: "Blue", Size: "M" }, sku: "ANK-B-M", opening_quantity: 3, selling_price: 12500 },
      ],
    });
    const vs = await variantsOf(id);
    expect(vs.map((v) => [v.sku, v.name, v.quantity_on_hand])).toEqual([["ANK-B-M", "Blue / M", 3], ["ANK-B-S", "Blue / S", 5]]);
    const [p] = await sql(`select has_variants from products where id = $1`, [id]);
    expect(p.has_variants).toBe(true);
    const mv = await sql(`select movement_type, quantity_change from inventory_movements where product_id = $1`, [id]);
    expect(mv.every((m) => m.movement_type === "opening")).toBe(true);
  });

  it("rejects duplicate SKUs within a workspace (case-insensitive)", async () => {
    await product(W.user, W.org, { name: "A", sku: "DUP-1" });
    await expectCode(product(W.user, W.org, { name: "B", sku: "dup-1" }), "GO409");
  });

  it("does not allow stock to be set directly, only through movements", async () => {
    const id = await product(W.user, W.org, { name: "Guarded" });
    const [v] = await variantsOf(id);
    await expect(sql(`update product_variants set quantity_on_hand = 50 where id = $1`, [v.id])).rejects.toThrow(/stock movements/);
  });
});

describe("stock adjustments", () => {
  it("records purchases, damage and adjustments as traceable movements", async () => {
    const id = await product(W.user, W.org, { name: "Soap", opening_quantity: 10 });
    const [v] = await variantsOf(id);
    await rpc(W.user, "adjust_stock", { p_variant: v.id, p_type: "purchase", p_quantity: 5, p_reason: "Supplier" });
    await rpc(W.user, "adjust_stock", { p_variant: v.id, p_type: "damage", p_quantity: 2, p_reason: "Broken" });
    await rpc(W.user, "adjust_stock", { p_variant: v.id, p_type: "adjustment", p_quantity: -1, p_reason: "Count" });
    expect(await stock(v.id)).toEqual({ on_hand: 12, reserved: 0 });
    const mv = await sql(`select movement_type, quantity_change, quantity_after from inventory_movements where variant_id = $1 order by created_at, quantity_after desc`, [v.id]);
    expect(mv.map((m) => m.movement_type)).toEqual(["opening", "purchase", "damage", "adjustment"]);
  });

  it("requires a reason for adjustments and refuses negative stock", async () => {
    const id = await product(W.user, W.org, { name: "Cream", opening_quantity: 2 });
    const [v] = await variantsOf(id);
    await expectCode(rpc(W.user, "adjust_stock", { p_variant: v.id, p_type: "adjustment", p_quantity: -1, p_reason: "" }), "GO400");
    await expectCode(rpc(W.user, "adjust_stock", { p_variant: v.id, p_type: "damage", p_quantity: 3, p_reason: "x" }), "GO409");
    expect((await stock(v.id)).on_hand).toBe(2);
  });
});

describe("order lifecycle with reserve-on-confirm (default)", () => {
  let v, o;
  beforeAll(async () => {
    const id = await product(W.user, W.org, { name: "Kaftan", cost_price: 9000, selling_price: 18500, opening_quantity: 5 });
    [v] = await variantsOf(id);
  });

  it("draft orders do not touch stock and compute totals server-side", async () => {
    o = await order(W.user, W.org, [{ variant_id: v.id, quantity: 2, unit_price: 99999999 }], { delivery_fee: 2500, discount_amount: 1000 });
    // client-supplied unit_price is allowed (negotiated price) but totals are always recomputed
    await rpc(W.user, "save_draft_order", { p_org: W.org, p_order: o, p: { items: [{ variant_id: v.id, quantity: 2 }], delivery_fee: 2500, discount_amount: 1000 } });
    const r = await orderRow(o);
    expect([num(r.subtotal), num(r.total), num(r.cost_total), r.status]).toEqual([37000, 38500, 18000, "draft"]);
    expect(await stock(v.id)).toEqual({ on_hand: 5, reserved: 0 });
  });

  it("confirming reserves stock", async () => {
    await rpc(W.user, "confirm_order", { p_order: o });
    expect(await stock(v.id)).toEqual({ on_hand: 5, reserved: 2 });
    expect((await orderRow(o)).stock_state).toBe("reserved");
  });

  it("confirmed orders cannot be edited", async () => {
    await expectCode(rpc(W.user, "save_draft_order", { p_org: W.org, p_order: o, p: { items: [{ variant_id: v.id, quantity: 1 }] } }), "GO409");
  });

  it("cannot reserve more than is available", async () => {
    await expectCode(order(W.user, W.org, [{ variant_id: v.id, quantity: 4 }], { confirm: true }), "GO409");
    expect(await stock(v.id)).toEqual({ on_hand: 5, reserved: 2 }); // whole transaction rolled back
  });

  it("status moves forward only; dispatch deducts reserved stock", async () => {
    await rpc(W.user, "update_order_status", { p_order: o, p_status: "processing" });
    await expectCode(rpc(W.user, "update_order_status", { p_order: o, p_status: "processing" }), "GO409");
    await rpc(W.user, "update_order_status", { p_order: o, p_status: "dispatched" });
    expect(await stock(v.id)).toEqual({ on_hand: 3, reserved: 0 });
    await rpc(W.user, "update_order_status", { p_order: o, p_status: "delivered" });
    expect(await stock(v.id)).toEqual({ on_hand: 3, reserved: 0 }); // no double deduction
    const r = await orderRow(o);
    expect(r.status).toBe("delivered");
    expect(r.delivered_at).not.toBeNull();
  });

  it("delivered orders cannot be cancelled", async () => {
    await expectCode(rpc(W.user, "cancel_order", { p_order: o, p_reason: "x" }), "GO409");
  });

  it("cancelling a reserved order releases the reservation", async () => {
    const o2 = await order(W.user, W.org, [{ variant_id: v.id, quantity: 1 }], { confirm: true });
    expect(await stock(v.id)).toEqual({ on_hand: 3, reserved: 1 });
    await rpc(W.user, "cancel_order", { p_order: o2, p_reason: "Changed mind" });
    expect(await stock(v.id)).toEqual({ on_hand: 3, reserved: 0 });
    expect((await orderRow(o2)).status).toBe("cancelled");
  });

  it("cancelling a dispatched order restocks the goods", async () => {
    const o3 = await order(W.user, W.org, [{ variant_id: v.id, quantity: 1 }], { confirm: true });
    await rpc(W.user, "update_order_status", { p_order: o3, p_status: "dispatched" });
    expect(await stock(v.id)).toEqual({ on_hand: 2, reserved: 0 });
    await rpc(W.user, "cancel_order", { p_order: o3, p_reason: "Returned by rider" });
    expect(await stock(v.id)).toEqual({ on_hand: 3, reserved: 0 });
  });

  it("generates unique sequential order numbers", async () => {
    const nums = await sql(`select order_number from orders where organization_id = $1 order by created_at`, [W.org]);
    expect(new Set(nums.map((n) => n.order_number)).size).toBe(nums.length);
    expect(nums[0].order_number).toMatch(/^ORD-\d{4}$/);
  });

  it("the stock ledger reconciles with variant quantities", async () => {
    expect(await assertLedgerMatches(W.org)).toBeGreaterThan(3);
  });
});

describe("deduct-on-confirm policy and negative stock setting", () => {
  it("deducts at confirmation when configured", async () => {
    const X = await newWorkspace("Ded", "Deduct Biz");
    await as(X.user, (q) => q(`update business_profiles set stock_policy = 'deduct_on_confirm' where organization_id = $1`, [X.org]));
    const id = await product(X.user, X.org, { opening_quantity: 3 });
    const [v] = await variantsOf(id);
    const o = await order(X.user, X.org, [{ variant_id: v.id, quantity: 2 }], { confirm: true });
    expect(await stock(v.id)).toEqual({ on_hand: 1, reserved: 0 });
    await rpc(X.user, "cancel_order", { p_order: o, p_reason: "x" });
    expect(await stock(v.id)).toEqual({ on_hand: 3, reserved: 0 });
    await assertLedgerMatches(X.org);
  });

  it("allows overselling only when the business explicitly permits negative stock", async () => {
    const X = await newWorkspace("Neg", "Negative Biz");
    const id = await product(X.user, X.org, { opening_quantity: 1 });
    const [v] = await variantsOf(id);
    await expectCode(order(X.user, X.org, [{ variant_id: v.id, quantity: 2 }], { confirm: true }), "GO409");
    await as(X.user, (q) => q(`update business_profiles set allow_negative_stock = true where organization_id = $1`, [X.org]));
    const o = await order(X.user, X.org, [{ variant_id: v.id, quantity: 2 }], { confirm: true });
    await rpc(X.user, "update_order_status", { p_order: o, p_status: "delivered" });
    expect(await stock(v.id)).toEqual({ on_hand: -1, reserved: 0 });
  });
});

describe("payments, balances and returns", () => {
  let v, o;
  beforeAll(async () => {
    const id = await product(W.user, W.org, { name: "Lace", cost_price: 20000, selling_price: 38000, opening_quantity: 10 });
    [v] = await variantsOf(id);
    // 2 × 38,000 = 76,000; order discount 6,000; delivery 3,000 → total 73,000
    o = await order(W.user, W.org, [{ variant_id: v.id, quantity: 2 }], { confirm: true, discount_amount: 6000, delivery_fee: 3000 });
  });

  it("starts unpaid with the full balance due", async () => {
    const r = await orderRow(o);
    expect([num(r.total), num(r.amount_paid), num(r.balance_due), r.payment_status]).toEqual([73000, 0, 73000, "unpaid"]);
  });

  it("tracks partial payments", async () => {
    await rpc(W.user, "record_payment", { p_order: o, p_amount: 30000, p_method: "bank_transfer", p_reference: "TRF1" });
    const r = await orderRow(o);
    expect([num(r.amount_paid), num(r.balance_due), r.payment_status]).toEqual([30000, 43000, "partially_paid"]);
  });

  it("rejects overpayment, zero and fractional-kobo amounts", async () => {
    await expectCode(rpc(W.user, "record_payment", { p_order: o, p_amount: 43000.01, p_method: "cash" }), "GO400");
    await expectCode(rpc(W.user, "record_payment", { p_order: o, p_amount: 0, p_method: "cash" }), "GO400");
    await expectCode(rpc(W.user, "record_payment", { p_order: o, p_amount: 10.005, p_method: "cash" }), "GO400");
  });

  it("marks paid when the balance reaches zero", async () => {
    await rpc(W.user, "record_payment", { p_order: o, p_amount: 43000, p_method: "pos" });
    const r = await orderRow(o);
    expect([num(r.balance_due), r.payment_status]).toEqual([0, "paid"]);
  });

  it("a return credits the pro-rated value and restocks", async () => {
    await rpc(W.user, "update_order_status", { p_order: o, p_status: "delivered" });
    const [item] = await sql(`select id from order_items where order_id = $1`, [o]);
    const before = await stock(v.id);
    await rpc(W.user, "record_return", { p_order: o, p: { restock: true, reason: "Wrong colour", items: [{ order_item_id: item.id, quantity: 1 }] } });
    // 38,000 × (70,000 / 76,000) = 35,000 credit
    const r = await orderRow(o);
    expect([num(r.returns_total), num(r.balance_due)]).toEqual([35000, -35000]); // customer is owed 35,000
    expect((await stock(v.id)).on_hand).toBe(before.on_hand + 1);
    const [ret] = await sql(`select credit_amount, cost_reversed from order_returns where order_id = $1`, [o]);
    expect([num(ret.credit_amount), num(ret.cost_reversed)]).toEqual([35000, 20000]);
  });

  it("cannot return more than was sold", async () => {
    const [item] = await sql(`select id from order_items where order_id = $1`, [o]);
    await expectCode(rpc(W.user, "record_return", { p_order: o, p: { items: [{ order_item_id: item.id, quantity: 2 }] } }), "GO400");
  });

  it("refund settles the credit; refunds cannot exceed the amount paid", async () => {
    await expectCode(rpc(W.user, "record_refund", { p_order: o, p_amount: 80000, p_method: "bank_transfer", p_reason: "x" }), "GO400");
    await rpc(W.user, "record_refund", { p_order: o, p_amount: 35000, p_method: "bank_transfer", p_reason: "Return" });
    const r = await orderRow(o);
    expect([num(r.amount_paid), num(r.amount_refunded), num(r.balance_due), r.payment_status]).toEqual([38000, 35000, 0, "paid"]);
  });

  it("voiding a payment restores the balance and is audited", async () => {
    const o2 = await order(W.user, W.org, [{ variant_id: v.id, quantity: 1 }], { confirm: true });
    const pay = await rpc(W.user, "record_payment", { p_order: o2, p_amount: 38000, p_method: "cash" });
    await expectCode(rpc(W.user, "void_payment", { p_payment: pay, p_reason: "" }), "GO400");
    await rpc(W.user, "void_payment", { p_payment: pay, p_reason: "Entered on wrong order" });
    const r = await orderRow(o2);
    expect([num(r.amount_paid), num(r.balance_due), r.payment_status]).toEqual([0, 38000, "unpaid"]);
    const audit = await sql(`select action from audit_logs where entity_id = $1`, [pay]);
    expect(audit.map((a) => a.action)).toContain("payment.voided");
  });

  it("payments cannot be recorded on draft or cancelled orders", async () => {
    const d = await order(W.user, W.org, [{ variant_id: v.id, quantity: 1 }]);
    await expectCode(rpc(W.user, "record_payment", { p_order: d, p_amount: 100, p_method: "cash" }), "GO409");
  });

  it("customer summaries reflect orders, spend and balances", async () => {
    const cust = await as(W.user, async (q) => (await q(`insert into customers (organization_id, full_name, phone) values ($1, 'Ngozi', '0803 123 4567') returning id, phone_normalized, customer_code`, [W.org]))[0]);
    expect(cust.phone_normalized).toBe("2348031234567");
    expect(cust.customer_code).toMatch(/^CUS-\d{4}$/);
    const o3 = await order(W.user, W.org, [{ variant_id: v.id, quantity: 1 }], { confirm: true, customer_id: cust.id, payment: { amount: 8000 } });
    expect(o3).toBeTruthy();
    const [s] = await as(W.user, (q) => q(`select * from customer_summaries where id = $1`, [cust.id]));
    expect([s.total_orders, num(s.total_spent), num(s.outstanding_balance)]).toEqual([1, 38000, 30000]);
  });
});
