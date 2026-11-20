import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, closeDb, newWorkspace, num, order, product, rpc, rpcRows, sql, variantsOf } from "./helpers.mjs";

/**
 * Builds a fully-known ledger and checks every reported figure by hand,
 * then cross-checks summaries against raw-table sums and the time series.
 */
let W, today, from, to;
const day = (offset) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  W = await newWorkspace("Fin", "Finance Biz");
  [{ today }] = await sql(`select to_char(app.org_today($1), 'YYYY-MM-DD') as today`, [W.org]);
  from = day(-10);
  to = today;

  const pA = await product(W.user, W.org, { name: "Shirt", cost_price: 5000, selling_price: 10000, opening_quantity: 50 });
  const pB = await product(W.user, W.org, { name: "Cream", cost_price: 1000, selling_price: 4000, opening_quantity: 50 });
  const [a] = await variantsOf(pA);
  const [b] = await variantsOf(pB);

  // O1: 2 shirts, fully paid, delivered. total 20,000, cogs 10,000
  const o1 = await order(W.user, W.org, [{ variant_id: a.id, quantity: 2 }], { confirm: true, order_date: day(-5), payment: { amount: 20000 } });
  await rpc(W.user, "update_order_status", { p_order: o1, p_status: "delivered" });
  // O2: 1 shirt + 3 creams, discount 2,000, delivery 1,500 → 22,000 - 2,000 + 1,500 = 21,500; part-paid 10,000; cogs 8,000
  await order(W.user, W.org, [{ variant_id: a.id, quantity: 1 }, { variant_id: b.id, quantity: 3 }],
    { confirm: true, order_date: day(-3), discount_amount: 2000, delivery_fee: 1500, payment: { amount: 10000 } });
  // O3: unpaid, 5 creams = 20,000; cogs 5,000
  await order(W.user, W.org, [{ variant_id: b.id, quantity: 5 }], { confirm: true, order_date: day(-1) });
  // O4: cancelled after a payment that was refunded → contributes nothing to sales; cash +5,000 −5,000
  const o4 = await order(W.user, W.org, [{ variant_id: a.id, quantity: 1 }], { confirm: true, order_date: day(-2), payment: { amount: 5000 } });
  await rpc(W.user, "cancel_order", { p_order: o4, p_reason: "x" });
  await rpc(W.user, "record_refund", { p_order: o4, p_amount: 5000, p_method: "cash", p_reason: "Cancelled" });
  // O5: draft — never counted
  await order(W.user, W.org, [{ variant_id: a.id, quantity: 4 }], { order_date: day(-1) });
  // O6: outside the period (20 days ago), unpaid 10,000 → only in all-time outstanding
  await order(W.user, W.org, [{ variant_id: a.id, quantity: 1 }], { confirm: true, order_date: day(-20) });
  // Return 1 shirt from O1 (restocked): credit 10,000, cost reversed 5,000
  const [it1] = await sql(`select id from order_items where order_id = $1`, [o1]);
  await rpc(W.user, "record_return", { p_order: o1, p: { restock: true, return_date: day(-1), items: [{ order_item_id: it1.id, quantity: 1 }] } });

  const cats = Object.fromEntries((await sql(`select name, id from expense_categories where organization_id = $1`, [W.org])).map((c) => [c.name, c.id]));
  await as(W.user, async (q) => {
    await q(`insert into expenses (organization_id, category_id, amount, expense_date, description) values ($1, $2, 7000, $3, 'Rent part')`, [W.org, cats.Rent, day(-4)]);
    await q(`insert into expenses (organization_id, category_id, amount, expense_date, description) values ($1, $2, 1500, $3, 'Rider')`, [W.org, cats.Transport, day(-2)]);
    await q(`insert into expenses (organization_id, category_id, amount, expense_date, description) values ($1, $2, 999, $3, 'Old')`, [W.org, cats.Transport, day(-30)]);
    const [v] = await q(`insert into expenses (organization_id, category_id, amount, expense_date, description) values ($1, $2, 5000, $3, 'Mistake') returning id`, [W.org, cats.Marketing, day(-2)]);
    await q(`select public.void_financial_record('expenses', $1)`, [v.id]);
    await q(`insert into income_records (organization_id, amount, income_date, description) values ($1, 3000, $2, 'Consulting')`, [W.org, day(-6)]);
  });
});
afterAll(closeDb);

describe("financial summary", () => {
  let s;
  beforeAll(async () => { s = await rpc(W.user, "report_financial_summary", { p_org: W.org, p_from: from, p_to: to }); });

  it("counts only confirmed, non-cancelled orders as sales", () => {
    expect(s.order_count).toBe(3);
    expect(num(s.gross_sales)).toBe(20000 + 21500 + 20000);
  });
  it("subtracts returns to get net sales (revenue)", () => {
    expect(num(s.returns)).toBe(10000);
    expect(num(s.net_sales)).toBe(51500);
  });
  it("cash received = payments − refunds, never unpaid orders", () => {
    expect(num(s.payments_received)).toBe(20000 + 10000 + 5000);
    expect(num(s.refunds)).toBe(5000);
    expect(num(s.cash_received)).toBe(30000);
  });
  it("outstanding balances", () => {
    // O1 is fully paid but has a 10,000 credit (balance −10,000) — credits are not 'outstanding'
    expect(num(s.outstanding_on_period_orders)).toBe(11500 + 20000);
    expect(num(s.outstanding_total)).toBe(11500 + 20000 + 10000);
  });
  it("COGS uses cost snapshots and reverses restocked returns", () => {
    expect(num(s.cogs)).toBe(10000 + 8000 + 5000 - 5000);
  });
  it("gross and net profit", () => {
    expect(num(s.gross_profit)).toBe(51500 - 18000);
    expect(num(s.operating_expenses)).toBe(8500); // voided and out-of-period expenses excluded
    expect(num(s.other_income)).toBe(3000);
    expect(num(s.net_profit)).toBe(33500 + 3000 - 8500);
    expect(num(s.gross_margin_pct)).toBeCloseTo(65.0, 1);
  });
  it("discounts and delivery fees are reported", () => {
    expect(num(s.discounts)).toBe(2000);
    expect(num(s.delivery_fees)).toBe(1500);
  });
});

describe("cross-checks against raw records", () => {
  it("cash received equals the payments ledger", async () => {
    const [r] = await sql(`select sum(case when kind = 'payment' then amount else -amount end) as net from payments
                           where organization_id = $1 and voided_at is null and (paid_at at time zone 'Africa/Lagos')::date between $2 and $3`, [W.org, from, to]);
    const s = await rpc(W.user, "report_financial_summary", { p_org: W.org, p_from: from, p_to: to });
    expect(num(s.cash_received)).toBe(num(r.net));
  });

  it("time series totals equal the summary totals", async () => {
    const rows = await rpcRows(W.user, "report_timeseries", { p_org: W.org, p_from: from, p_to: to, p_bucket: "day" });
    const s = await rpc(W.user, "report_financial_summary", { p_org: W.org, p_from: from, p_to: to });
    const sum = (k) => rows.reduce((a, r) => a + num(r[k]), 0);
    expect(rows).toHaveLength(11);
    expect(sum("sales")).toBe(num(s.net_sales));
    expect(sum("cash_received")).toBe(num(s.cash_received));
    expect(sum("expenses")).toBe(num(s.operating_expenses));
  });

  it("sales summary agrees with the financial summary on shared figures", async () => {
    const a = await rpc(W.user, "report_sales_summary", { p_org: W.org, p_from: from, p_to: to });
    const b = await rpc(W.user, "report_financial_summary", { p_org: W.org, p_from: from, p_to: to });
    for (const k of ["gross_sales", "net_sales", "cash_received", "outstanding_total", "order_count"]) {
      expect(num(a[k])).toBe(num(b[k]));
    }
    expect(a).not.toHaveProperty("cogs"); // sales summary never leaks cost data
  });

  it("top products by revenue sum to net item revenue", async () => {
    const rows = await rpcRows(W.user, "report_top_products", { p_org: W.org, p_from: from, p_to: to, p_limit: 10, p_sort: "revenue" });
    expect(rows[0].product_name).toBe("Cream");
    const total = rows.reduce((a, r) => a + num(r.revenue), 0);
    // net_sales (51,500) − delivery fees (1,500) = item revenue net of discounts and returns
    expect(total).toBe(50000);
  });

  it("expense breakdown sums to operating expenses", async () => {
    const rows = await rpcRows(W.user, "report_expense_breakdown", { p_org: W.org, p_from: from, p_to: to });
    expect(rows.map((r) => [r.category_name, num(r.total)])).toEqual([["Rent", 7000], ["Transport", 1500]]);
  });

  it("customer balances list only positive balances", async () => {
    const rows = await rpcRows(W.user, "report_customer_balances", { p_org: W.org });
    expect(rows).toEqual([]); // these orders had no customer attached
  });

  it("validates date ranges", async () => {
    await expect(rpc(W.user, "report_financial_summary", { p_org: W.org, p_from: to, p_to: from })).rejects.toMatchObject({ code: "GO400" });
  });
});
