import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember, as, closeDb, createUser, expectCode, newWorkspace, order, product, rpc, rpcRows, sql, variantsOf,
} from "./helpers.mjs";

/**
 * Proves that one workspace can never read or modify another workspace's records,
 * whether through direct table access (RLS) or through RPC functions.
 */
let A, B, aCustomer, aProduct, aOrder, aExpense, aConversation;

beforeAll(async () => {
  A = await newWorkspace("Alice", "Alice Fashion");
  B = await newWorkspace("Bola", "Bola Beauty");

  aCustomer = await as(A.user, async (q) =>
    (await q(`insert into customers (organization_id, full_name, phone) values ($1, 'Secret Customer', '08030000000') returning id`, [A.org]))[0].id);
  aProduct = await product(A.user, A.org, { name: "Secret Dress" });
  const [v] = await variantsOf(aProduct);
  aOrder = await order(A.user, A.org, [{ variant_id: v.id, quantity: 1 }], { customer_id: aCustomer, confirm: true, payment: { amount: 500 } });
  const [cat] = await sql(`select id from expense_categories where organization_id = $1 and name = 'Rent'`, [A.org]);
  aExpense = await as(A.user, async (q) =>
    (await q(`insert into expenses (organization_id, category_id, amount, expense_date, description) values ($1, $2, 5000, current_date, 'Rent') returning id`, [A.org, cat.id]))[0].id);
  aConversation = await as(A.user, async (q) =>
    (await q(`insert into ai_conversations (organization_id, user_id, title) values ($1, $2, 'Private chat') returning id`, [A.org, A.user.id]))[0].id);
});
afterAll(closeDb);

const tenantTables = [
  "customers", "products", "product_variants", "inventory_movements", "orders", "order_items", "payments",
  "expenses", "expense_categories", "income_records", "follow_up_tasks", "ai_conversations", "ai_messages",
  "business_profiles", "product_categories", "order_returns", "subscriptions", "organization_members", "audit_logs",
];

describe("read isolation", () => {
  it.each(tenantTables)("workspace B sees none of workspace A's %s", async (table) => {
    const rows = await as(B.user, (q) => q(`select * from ${table} where organization_id = $1`, [A.org]));
    expect(rows).toHaveLength(0);
  });

  it("A can see its own data (sanity check)", async () => {
    const rows = await as(A.user, (q) => q(`select id from customers where organization_id = $1`, [A.org]));
    expect(rows.map((r) => r.id)).toContain(aCustomer);
  });

  it("B cannot see A's organization row or derived views", async () => {
    expect(await as(B.user, (q) => q(`select * from organizations where id = $1`, [A.org]))).toHaveLength(0);
    expect(await as(B.user, (q) => q(`select * from customer_summaries where organization_id = $1`, [A.org]))).toHaveLength(0);
    expect(await as(B.user, (q) => q(`select * from variant_stock where organization_id = $1`, [A.org]))).toHaveLength(0);
  });

  it("B cannot see A's profile", async () => {
    expect(await as(B.user, (q) => q(`select * from profiles where id = $1`, [A.user.id]))).toHaveLength(0);
  });

  it("anonymous visitors see no tenant data at all", async () => {
    for (const t of ["customers", "orders", "organizations", "profiles"]) {
      await expect(as("anon", (q) => q(`select * from ${t}`))).rejects.toThrow(/permission denied/);
    }
    const plans = await as("anon", (q) => q(`select code from subscription_plans order by sort_order`));
    expect(plans.map((p) => p.code)).toEqual(["starter", "growth", "pro"]);
  });
});

describe("write isolation", () => {
  it("B cannot insert records into A's workspace", async () => {
    await expect(as(B.user, (q) => q(`insert into customers (organization_id, full_name) values ($1, 'Intruder')`, [A.org])))
      .rejects.toThrow(/row-level security/);
  });

  it("B cannot update or delete A's records (0 rows affected)", async () => {
    const upd = await as(B.user, (q) => q(`update customers set full_name = 'Hacked' where id = $1 returning id`, [aCustomer]));
    const del = await as(B.user, (q) => q(`delete from customers where id = $1 returning id`, [aCustomer]));
    expect(upd).toHaveLength(0);
    expect(del).toHaveLength(0);
    const [c] = await sql(`select full_name from customers where id = $1`, [aCustomer]);
    expect(c.full_name).toBe("Secret Customer");
  });

  it("records cannot be moved into another workspace", async () => {
    // A user who legitimately belongs to BOTH workspaces still cannot move rows between them.
    const both = await createUser("Both");
    for (const ws of [A, B]) {
      const hash = `move-${ws.org}`;
      await rpc(ws.user, "create_invitation", { p_org: ws.org, p_email: both.email, p_role: "manager", p_token_hash: hash });
      await rpc(both, "accept_invitation", { p_token_hash: hash });
    }
    await expectCode(as(both, (q) => q(`update products set organization_id = $1 where id = $2`, [B.org, aProduct])), "GO403");
    await expect(as(both, (q) => q(`update customers set organization_id = $1 where id = $2`, [B.org, aCustomer])))
      .rejects.toThrow(/permission denied/);
    const [p] = await sql(`select organization_id from products where id = $1`, [aProduct]);
    expect(p.organization_id).toBe(A.org);
  });

  it("B cannot link a task to A's customer", async () => {
    await expect(as(B.user, (q) => q(
      `insert into follow_up_tasks (organization_id, title, due_date, customer_id) values ($1, 'x', current_date, $2)`,
      [B.org, aCustomer]))).rejects.toThrow(/row-level security/);
  });

  it("B cannot create an order in its workspace using A's product variant or customer", async () => {
    const [v] = await variantsOf(aProduct);
    await expectCode(order(B.user, B.org, [{ variant_id: v.id, quantity: 1 }]), "GO400");
    const bp = await product(B.user, B.org);
    const [bv] = await variantsOf(bp);
    await expectCode(order(B.user, B.org, [{ variant_id: bv.id, quantity: 1 }], { customer_id: aCustomer }), "GO400");
  });

  it("direct writes to ledger tables are impossible even for the owner", async () => {
    await expect(as(A.user, (q) => q(`update orders set total = 1 where id = $1`, [aOrder]))).rejects.toThrow(/permission denied/);
    await expect(as(A.user, (q) => q(`insert into payments (organization_id, order_id, amount) values ($1, $2, 99)`, [A.org, aOrder])))
      .rejects.toThrow(/permission denied/);
    const [v] = await variantsOf(aProduct);
    await expect(as(A.user, (q) => q(`update product_variants set quantity_on_hand = 999 where id = $1`, [v.id])))
      .rejects.toThrow(/permission denied/);
    await expect(as(A.user, (q) => q(`delete from inventory_movements where organization_id = $1`, [A.org])))
      .rejects.toThrow(/permission denied/);
  });
});

describe("RPC isolation", () => {
  it("every business RPC rejects a non-member", async () => {
    const [v] = await variantsOf(aProduct);
    await expectCode(rpc(B.user, "create_product", { p_org: A.org, p: { name: "x" } }), "GO403");
    await expectCode(rpc(B.user, "adjust_stock", { p_variant: v.id, p_type: "purchase", p_quantity: 5, p_reason: null }), "GO403");
    await expectCode(rpc(B.user, "confirm_order", { p_order: aOrder }), "GO403");
    await expectCode(rpc(B.user, "record_payment", { p_order: aOrder, p_amount: 1, p_method: "cash" }), "GO403");
    await expectCode(rpc(B.user, "cancel_order", { p_order: aOrder, p_reason: "x" }), "GO403");
    await expectCode(rpc(B.user, "save_draft_order", { p_org: A.org, p_order: null, p: { items: [] } }), "GO403");
    await expectCode(rpc(B.user, "void_financial_record", { p_table: "expenses", p_id: aExpense }), "GO403");
  });

  it("every report RPC rejects a non-member", async () => {
    const range = { p_org: A.org, p_from: "2020-01-01", p_to: "2030-01-01" };
    await expectCode(rpc(B.user, "report_sales_summary", range), "GO403");
    await expectCode(rpc(B.user, "report_financial_summary", range), "GO403");
    await expectCode(rpcRows(B.user, "report_timeseries", range), "GO403");
    await expectCode(rpcRows(B.user, "report_top_products", range), "GO403");
    await expectCode(rpcRows(B.user, "report_low_stock", { p_org: A.org }), "GO403");
    await expectCode(rpcRows(B.user, "report_customer_balances", { p_org: A.org }), "GO403");
    await expectCode(rpcRows(B.user, "report_expense_breakdown", range), "GO403");
    await expectCode(rpcRows(B.user, "report_inactive_customers", { p_org: A.org }), "GO403");
    await expectCode(rpc(B.user, "report_customer_history", { p_org: A.org, p_customer: aCustomer }), "GO403");
    await expectCode(rpcRows(B.user, "report_recent_activity", { p_org: A.org }), "GO403");
    await expectCode(rpcRows(B.user, "suggest_follow_ups", { p_org: A.org }), "GO403");
    await expectCode(rpc(B.user, "workspace_context", { p_org: A.org }), "GO403");
    await expectCode(rpc(B.user, "workspace_usage", { p_org: A.org }), "GO403");
    await expectCode(rpc(B.user, "ai_quota", { p_org: A.org }), "GO403");
  });

  it("a member of B cannot read A's customer history by passing B's org id", async () => {
    await expectCode(rpc(B.user, "report_customer_history", { p_org: B.org, p_customer: aCustomer }), "GO404");
  });

  it("signed-in users cannot call internal or service-only functions", async () => {
    await expect(as(A.user, (q) => q(`select app.do_cancel_order($1, 'x', $2)`, [aOrder, A.user.id]))).rejects.toThrow(/permission denied/);
    await expect(as(A.user, (q) => q(`select public.billing_apply_charge_success('r', 1, 'NGN', now(), null, null, null, null, '{}')`)))
      .rejects.toThrow(/permission denied/);
    await expect(as(A.user, (q) => q(`select public.admin_platform_metrics()`))).rejects.toThrow(/permission denied/);
    await expect(as(A.user, (q) => q(`select * from admin_workspace_overview`))).rejects.toThrow(/permission denied/);
  });
});

describe("AI conversation privacy", () => {
  it("conversations are private even from teammates", async () => {
    const mate = await addMember(A.user, A.org, "manager", "Mate");
    expect(await as(mate, (q) => q(`select * from ai_conversations where id = $1`, [aConversation]))).toHaveLength(0);
    expect(await as(A.user, (q) => q(`select * from ai_conversations where id = $1`, [aConversation]))).toHaveLength(1);
  });
});

describe("product entitlement", () => {
  it("a workspace without the Growth OS entitlement cannot read Growth OS data, even as owner", async () => {
    const W = await newWorkspace("Ent", "Entitlement Co");
    await as(W.user, (q) => q(`insert into customers (organization_id, full_name) values ($1, 'X')`, [W.org]));
    await sql(`update organization_products set status = 'suspended' where organization_id = $1`, [W.org]);
    expect(await as(W.user, (q) => q(`select * from customers where organization_id = $1`, [W.org]))).toHaveLength(0);
    await expectCode(rpc(W.user, "report_sales_summary", { p_org: W.org, p_from: "2020-01-01", p_to: "2030-01-01" }), "GO403");
  });
});
