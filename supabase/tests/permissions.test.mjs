import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, as, closeDb, expectCode, newWorkspace, order, product, rpc, rpcRows, sql, variantsOf } from "./helpers.mjs";

let W, staff, viewer, manager, admin, orderId, customerId;
const range = () => ({ p_org: W.org, p_from: "2024-01-01", p_to: "2030-12-31" });

beforeAll(async () => {
  W = await newWorkspace("Owner", "Perm Biz");
  // Growth trial = 3 seats incl. owner, so lift the seat limit for this test workspace (Pro).
  await sql(`update subscriptions set plan_id = (select id from subscription_plans where code = 'pro') where organization_id = $1`, [W.org]);
  staff = await addMember(W.user, W.org, "staff", "Staff");
  viewer = await addMember(W.user, W.org, "viewer", "Viewer");
  manager = await addMember(W.user, W.org, "manager", "Manager");
  admin = await addMember(W.user, W.org, "admin", "Admin");
  const p = await product(W.user, W.org);
  const [v] = await variantsOf(p);
  customerId = await as(W.user, async (q) => (await q(`insert into customers (organization_id, full_name) values ($1, 'C') returning id`, [W.org]))[0].id);
  orderId = await order(W.user, W.org, [{ variant_id: v.id, quantity: 2 }], { confirm: true, customer_id: customerId });
});
afterAll(closeDb);

describe("staff", () => {
  it("can create customers and orders and record payments", async () => {
    await as(staff, (q) => q(`insert into customers (organization_id, full_name) values ($1, 'Staff Lead')`, [W.org]));
    await rpc(staff, "record_payment", { p_order: orderId, p_amount: 100, p_method: "cash" });
  });
  it("cannot see expenses or financial reports", async () => {
    expect(await as(staff, (q) => q(`select * from expenses where organization_id = $1`, [W.org]))).toHaveLength(0);
    await expectCode(rpc(staff, "report_financial_summary", range()), "GO403");
    await expectCode(rpc(staff, "report_sales_summary", range()), "GO403");
  });
  it("cannot delete customers, refund, cancel orders, or manage team", async () => {
    const del = await as(staff, (q) => q(`delete from customers where id = $1 returning id`, [customerId]));
    expect(del).toHaveLength(0);
    await expectCode(rpc(staff, "record_refund", { p_order: orderId, p_amount: 50, p_method: "cash", p_reason: "x" }), "GO403");
    await expectCode(rpc(staff, "cancel_order", { p_order: orderId, p_reason: "x" }), "GO403");
    await expectCode(rpc(staff, "create_invitation", { p_org: W.org, p_email: "x@y.co", p_role: "staff", p_token_hash: "h1" }), "GO403");
  });
  it("cannot create products but can adjust stock", async () => {
    await expectCode(rpc(staff, "create_product", { p_org: W.org, p: { name: "Nope" } }), "GO403");
    const [v] = await sql(`select id from product_variants where organization_id = $1 limit 1`, [W.org]);
    await rpc(staff, "adjust_stock", { p_variant: v.id, p_type: "purchase", p_quantity: 3, p_reason: "delivery" });
  });
  it("can only assign tasks to themselves", async () => {
    await as(staff, (q) => q(`insert into follow_up_tasks (organization_id, title, due_date, assigned_to) values ($1, 'mine', current_date, $2)`, [W.org, staff.id]));
    await expect(as(staff, (q) => q(`insert into follow_up_tasks (organization_id, title, due_date, assigned_to) values ($1, 'theirs', current_date, $2)`, [W.org, manager.id])))
      .rejects.toThrow(/row-level security/);
  });
});

describe("viewer", () => {
  it("can read finance and reports but cannot write anything", async () => {
    const s = await rpc(viewer, "report_financial_summary", range());
    expect(s).toHaveProperty("net_profit");
    await expect(as(viewer, (q) => q(`insert into customers (organization_id, full_name) values ($1, 'x')`, [W.org]))).rejects.toThrow(/row-level security/);
    await expectCode(rpc(viewer, "record_payment", { p_order: orderId, p_amount: 1, p_method: "cash" }), "GO403");
    await expectCode(rpc(viewer, "ai_quota", { p_org: W.org }), "GO403");
  });
});

describe("manager & admin", () => {
  it("manager can see profit-ranked products; staff cannot", async () => {
    const rows = await rpcRows(manager, "report_top_products", { ...range(), p_limit: 5, p_sort: "profit" });
    expect(rows.length).toBeGreaterThan(0);
    await expectCode(rpcRows(staff, "report_top_products", { ...range(), p_limit: 5, p_sort: "profit" }), "GO403");
  });
  it("manager cannot manage team or billing settings", async () => {
    await expectCode(rpc(manager, "create_invitation", { p_org: W.org, p_email: "x@y.co", p_role: "staff", p_token_hash: "h2" }), "GO403");
  });
  it("admin can invite staff but cannot touch the owner or other admins", async () => {
    await rpc(admin, "create_invitation", { p_org: W.org, p_email: "new.staff@y.co", p_role: "staff", p_token_hash: "h3" });
    await expectCode(rpc(admin, "create_invitation", { p_org: W.org, p_email: "new.admin@y.co", p_role: "admin", p_token_hash: "h4" }), "GO403");
    const [owner] = await sql(`select id from organization_members where organization_id = $1 and role = 'owner'`, [W.org]);
    await expectCode(rpc(admin, "remove_member", { p_member: owner.id }), "GO403");
  });
  it("only the owner sees payment history (billing.manage)", async () => {
    await sql(`insert into payment_transactions (organization_id, reference, amount) values ($1, 'perm-ref', 7500)`, [W.org]);
    expect(await as(admin, (q) => q(`select * from payment_transactions where organization_id = $1`, [W.org]))).toHaveLength(0);
    expect(await as(W.user, (q) => q(`select * from payment_transactions where organization_id = $1`, [W.org]))).toHaveLength(1);
  });
});

describe("membership changes", () => {
  it("a removed member loses access immediately", async () => {
    const temp = await addMember(W.user, W.org, "staff", "Temp");
    expect(await as(temp, (q) => q(`select id from customers where organization_id = $1`, [W.org]))).not.toHaveLength(0);
    const [m] = await sql(`select id from organization_members where user_id = $1`, [temp.id]);
    await rpc(W.user, "remove_member", { p_member: m.id });
    expect(await as(temp, (q) => q(`select id from customers where organization_id = $1`, [W.org]))).toHaveLength(0);
  });
  it("an invitation can only be accepted by the invited email", async () => {
    await rpc(W.user, "create_invitation", { p_org: W.org, p_email: "someone@else.com", p_role: "staff", p_token_hash: "h-wrong" });
    await expectCode(rpc(staff, "accept_invitation", { p_token_hash: "h-wrong" }), "GO403");
  });
});

describe("permission matrix parity", () => {
  it("SQL role_permissions matches packages/permissions", async () => {
    const { ROLE_PERMISSIONS } = await import("../../packages/permissions/src/matrix.ts");
    const rows = await sql(`select role, permission from role_permissions order by role, permission`);
    const fromDb = {};
    for (const r of rows) (fromDb[r.role] ??= []).push(r.permission);
    const fromTs = Object.fromEntries(Object.entries(ROLE_PERMISSIONS).map(([k, v]) => [k, [...v].sort()]));
    expect(fromDb).toEqual(fromTs);
  });
});
