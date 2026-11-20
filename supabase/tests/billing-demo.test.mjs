import { afterAll, describe, expect, it } from "vitest";
import { as, closeDb, createUser, expectCode, newWorkspace, num, product, rpc, rpcRows, sql } from "./helpers.mjs";

afterAll(closeDb);

const svc = (fn, args) => rpc("service", fn, args);

describe("trial lifecycle", () => {
  it("a new workspace gets a 7-day Growth trial with the product entitlement", async () => {
    const W = await newWorkspace();
    const [s] = await sql(`select status, extract(epoch from trial_ends_at - trial_started_at)/86400 as days from subscriptions where organization_id = $1`, [W.org]);
    expect(s.status).toBe("trialing");
    expect(Math.round(num(s.days))).toBe(7);
    const ctx = await rpc(W.user, "workspace_context", { p_org: W.org });
    expect(ctx.subscription.state).toBe("trialing");
    expect(ctx.subscription.plan_code).toBe("growth");
    expect(ctx.role).toBe("owner");
    expect(ctx.writable).toBe(true);
    expect(ctx.has_growth_os).toBe(true);
    expect(ctx.permissions).toContain("billing.manage");
  });

  it("an expired trial becomes read-only but keeps every record", async () => {
    const W = await newWorkspace();
    await as(W.user, (q) => q(`insert into customers (organization_id, full_name) values ($1, 'Kept')`, [W.org]));
    await sql(`update subscriptions set trial_ends_at = now() - interval '1 minute' where organization_id = $1`, [W.org]);
    const ctx = await rpc(W.user, "workspace_context", { p_org: W.org });
    expect([ctx.subscription.state, ctx.writable]).toEqual(["expired", false]);
    expect(await as(W.user, (q) => q(`select full_name from customers where organization_id = $1`, [W.org]))).toEqual([{ full_name: "Kept" }]);
    await expect(as(W.user, (q) => q(`insert into customers (organization_id, full_name) values ($1, 'New')`, [W.org]))).rejects.toThrow(/row-level security/);
    await expectCode(product(W.user, W.org), "GO402");
    const n = await svc("billing_sweep_expired", {});
    expect(n).toBeGreaterThanOrEqual(1);
    const [s] = await sql(`select status from subscriptions where organization_id = $1`, [W.org]);
    expect(s.status).toBe("expired");
  });
});

describe("plan limits", () => {
  it("Starter enforces 1 user, 100 customers and 50 products on the server", async () => {
    const W = await newWorkspace();
    await sql(`update subscriptions set status = 'active', current_period_end = now() + interval '30 days',
               plan_id = (select id from subscription_plans where code = 'starter') where organization_id = $1`, [W.org]);
    await sql(`insert into customers (organization_id, full_name) select $1, 'C' || g from generate_series(1, 100) g`, [W.org]);
    await expectCode(as(W.user, (q) => q(`insert into customers (organization_id, full_name) values ($1, 'one too many')`, [W.org])), "GO402");
    for (let i = 0; i < 50; i++) await product(W.user, W.org, { name: `P${i}`, opening_quantity: 0 });
    await expectCode(product(W.user, W.org, { name: "P51" }), "GO402");
    const invitee = await createUser("Seat");
    await expectCode(rpc(W.user, "create_invitation", { p_org: W.org, p_email: invitee.email, p_role: "staff", p_token_hash: "seat" }), "GO402");
    const usage = await rpc(W.user, "workspace_usage", { p_org: W.org });
    expect([usage.customers, usage.products, usage.users]).toEqual([100, 50, 1]);
  });

  it("AI quota reflects the plan allowance and logged usage", async () => {
    const W = await newWorkspace();
    await sql(`update subscriptions set plan_id = (select id from subscription_plans where code = 'starter') where organization_id = $1`, [W.org]);
    await sql(`insert into ai_usage_logs (organization_id, user_id, provider, model) select $1, $2, 'test', 'm' from generate_series(1, 20)`, [W.org, W.user.id]);
    const q = await rpc(W.user, "ai_quota", { p_org: W.org });
    expect([q.limit, q.used, q.remaining, q.allowed]).toEqual([20, 20, 0, false]);
  });
});

describe("Paystack payment application (service role)", () => {
  it("activates on a verified charge, is idempotent, and rejects short payments", async () => {
    const W = await newWorkspace();
    const ck = await svc("billing_create_checkout", { p_org: W.org, p_plan_code: "pro", p_reference: `ref-${W.org}`, p_user: W.user.id });
    expect(num(ck.amount)).toBe(15000);

    const args = { p_reference: `ref-${W.org}`, p_amount: 15000, p_currency: "NGN", p_paid_at: new Date().toISOString(),
      p_channel: "card", p_customer_code: `CUS_${W.org.slice(0, 8)}`, p_subscription_code: null, p_paystack_plan_code: null, p_raw: {} };
    expect(await svc("billing_apply_charge_success", args)).toBe("activated");
    expect(await svc("billing_apply_charge_success", args)).toBe("already_processed");

    const ctx = await rpc(W.user, "workspace_context", { p_org: W.org });
    expect([ctx.subscription.state, ctx.subscription.plan_code]).toEqual(["active", "pro"]);
    const tx = await sql(`select status from payment_transactions where reference = $1`, [`ref-${W.org}`]);
    expect(tx).toEqual([{ status: "success" }]);

    await svc("billing_create_checkout", { p_org: W.org, p_plan_code: "growth", p_reference: `short-${W.org}`, p_user: W.user.id });
    expect(await svc("billing_apply_charge_success", { ...args, p_reference: `short-${W.org}`, p_amount: 100 })).toBe("amount_mismatch");
  });

  it("renewal charges with an unknown reference extend the period via the subscription code", async () => {
    const W = await newWorkspace();
    await svc("billing_create_checkout", { p_org: W.org, p_plan_code: "growth", p_reference: `r1-${W.org}`, p_user: W.user.id });
    await svc("billing_apply_charge_success", { p_reference: `r1-${W.org}`, p_amount: 7500, p_currency: "NGN", p_paid_at: null,
      p_channel: "card", p_customer_code: `C-${W.org}`, p_subscription_code: `SUB-${W.org}`, p_paystack_plan_code: null, p_raw: {} });
    const [before] = await sql(`select current_period_end from subscriptions where organization_id = $1`, [W.org]);
    expect(await svc("billing_apply_charge_success", { p_reference: `renew-${W.org}`, p_amount: 7500, p_currency: "NGN", p_paid_at: null,
      p_channel: "card", p_customer_code: null, p_subscription_code: `SUB-${W.org}`, p_paystack_plan_code: null, p_raw: {} })).toBe("renewed");
    const [after] = await sql(`select current_period_end from subscriptions where organization_id = $1`, [W.org]);
    const days = (after.current_period_end - before.current_period_end) / 86400000;
    expect(days).toBeGreaterThanOrEqual(28);
  });

  it("failed renewals go past_due (grace) and cancellations keep access until period end", async () => {
    const W = await newWorkspace();
    await sql(`update subscriptions set status = 'active', paystack_subscription_code = $2, current_period_end = now() + interval '10 days' where organization_id = $1`, [W.org, `S-${W.org}`]);
    expect(await svc("billing_mark_failed", { p_subscription_code: `S-${W.org}`, p_customer_code: null, p_reason: "insufficient funds" })).toBe("marked_past_due");
    expect((await rpc(W.user, "workspace_context", { p_org: W.org })).subscription.state).toBe("past_due");
    expect(await svc("billing_mark_canceled", { p_subscription_code: `S-${W.org}` })).toBe("canceled");
    const ctx = await rpc(W.user, "workspace_context", { p_org: W.org });
    expect([ctx.subscription.state, ctx.writable]).toEqual(["active", true]);
  });

  it("refuses a downgrade the workspace no longer fits into", async () => {
    const W = await newWorkspace();
    await sql(`insert into customers (organization_id, full_name) select $1, 'C' || g from generate_series(1, 101) g`, [W.org]);
    await expectCode(svc("billing_create_checkout", { p_org: W.org, p_plan_code: "starter", p_reference: `dg-${W.org}`, p_user: W.user.id }), "GO409");
  });
});

describe("demo workspace", () => {
  it("seeds a realistic, consistent business and can be reset", async () => {
    const u = await createUser("Prospect");
    const org = await rpc(u, "create_demo_workspace", {});
    expect(await rpc(u, "create_demo_workspace", {})).toBe(org); // one demo per user

    const counts = async () => (await sql(`select
      (select count(*)::int from customers where organization_id = $1) as customers,
      (select count(*)::int from products where organization_id = $1) as products,
      (select count(*)::int from product_variants where organization_id = $1 and not is_default) as variants,
      (select count(*)::int from orders where organization_id = $1) as orders,
      (select count(*)::int from payments where organization_id = $1) as payments,
      (select count(*)::int from expenses where organization_id = $1) as expenses,
      (select count(*)::int from follow_up_tasks where organization_id = $1) as tasks,
      (select count(*)::int from inventory_movements where organization_id = $1) as movements`, [org]))[0];
    const c = await counts();
    expect(c.customers).toBe(20);
    expect(c.products).toBe(15);
    expect(c.variants).toBeGreaterThanOrEqual(10);
    expect(c.orders).toBeGreaterThanOrEqual(25);
    expect(c.payments).toBeGreaterThan(10);
    expect(c.expenses).toBe(12);
    expect(c.tasks).toBe(6);

    const ctx = await rpc(u, "workspace_context", { p_org: org });
    expect([ctx.organization.is_demo, ctx.subscription, ctx.writable]).toEqual([true, null, true]);

    // stock ledger is consistent
    const bad = await sql(`select v.id from product_variants v left join inventory_movements m on m.variant_id = v.id
      where v.organization_id = $1 group by v.id having v.quantity_on_hand <> coalesce(sum(m.quantity_change), 0)
      or v.quantity_reserved <> coalesce(sum(m.reserved_change), 0)`, [org]);
    expect(bad).toEqual([]);

    const today = (await sql(`select app.org_today($1)::text as d`, [org]))[0].d;
    const s = await rpc(u, "report_financial_summary", { p_org: org, p_from: "2026-01-01", p_to: today });
    expect(num(s.gross_sales)).toBeGreaterThan(0);
    const suggestions = await rpcRows(u, "suggest_follow_ups", { p_org: org });
    expect(suggestions.length).toBeGreaterThan(0);

    await rpc(u, "reset_demo_workspace", { p_org: org });
    expect(await counts()).toEqual(c);
  });

  it("real workspaces cannot be reset", async () => {
    const W = await newWorkspace();
    await expectCode(rpc(W.user, "reset_demo_workspace", { p_org: W.org }), "GO403");
  });
});

describe("follow-up suggestions", () => {
  it("are not repeated once accepted as a task", async () => {
    const u = await createUser("Sugg");
    const org = await rpc(u, "create_demo_workspace", {});
    const before = await rpcRows(u, "suggest_follow_ups", { p_org: org });
    const first = before[0];
    await as(u, (q) => q(`insert into follow_up_tasks (organization_id, title, due_date, source, suggestion_key, customer_id, order_id)
      values ($1, $2, current_date, 'suggested', $3, $4, $5)`, [org, first.title, first.suggestion_key, first.customer_id, first.order_id]));
    const after = await rpcRows(u, "suggest_follow_ups", { p_org: org });
    expect(after.find((s) => s.suggestion_key === first.suggestion_key)).toBeUndefined();
  });
});
