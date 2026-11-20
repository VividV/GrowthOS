import { describe, expect, it, vi } from "vitest";
import { ROLE_PERMISSIONS } from "@platform/permissions";
import { buildTools, resolvePeriod, type ToolContext } from "./tools";

const NOW = new Date("2026-11-20T10:00:00Z");

function ctx(role: keyof typeof ROLE_PERMISSIONS, rpc: ToolContext["db"]["rpc"]): ToolContext {
  return {
    orgId: "org-1", timezone: "Africa/Lagos", currency: "NGN", now: NOW,
    can: (p) => ROLE_PERMISSIONS[role].includes(p),
    db: {
      rpc,
      customersByName: async (n) => (n.toLowerCase().startsWith("ad") ? [{ id: "c1", full_name: "Adaeze Okafor", phone: null }, { id: "c2", full_name: "Adamu Bello", phone: null }] : n === "Ngozi Eze" ? [{ id: "c3", full_name: "Ngozi Eze", phone: "0803" }] : []),
      openOrders: async () => [{ order_number: "ORD-1", status: "confirmed", order_date: "2026-11-01", expected_delivery_date: "2026-11-05", total: 1000, balance_due: 500, customer: "X" }],
    },
  };
}
const tool = (tools: ReturnType<typeof buildTools>, name: string) => tools.find((t) => t.name === name)!;

describe("period resolution", () => {
  it("resolves named periods in the business timezone", () => {
    expect(resolvePeriod({ period: "this_month" }, "Africa/Lagos", NOW)).toMatchObject({ from: "2026-11-01", to: "2026-11-20" });
    expect(resolvePeriod({ period: "last_month" }, "Africa/Lagos", NOW)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolvePeriod({ period: "last_week" }, "Africa/Lagos", NOW)).toMatchObject({ from: "2026-11-09", to: "2026-11-15" });
    expect(resolvePeriod({ period: "this_year" }, "Africa/Lagos", NOW)).toMatchObject({ from: "2026-01-01", to: "2026-11-20" });
    expect(() => resolvePeriod({ period: "custom", from: "2026-02-01", to: "2026-01-01" }, "UTC", NOW)).toThrow();
  });
});

describe("tool authorisation and validation", () => {
  it("scopes every query to the caller's workspace and passes resolved dates", async () => {
    const rpc = vi.fn(async () => ({ data: { order_count: 3, net_sales: 30000, payments_received: 10000 }, error: null }));
    await tool(buildTools(ctx("owner", rpc)), "get_sales_summary").run({ period: "last_month" });
    expect(rpc).toHaveBeenCalledWith("report_sales_summary", { p_org: "org-1", p_from: "2026-10-01", p_to: "2026-10-31" });
  });

  it("refuses finance tools for staff before touching the database", async () => {
    const rpc = vi.fn();
    const tools = buildTools(ctx("staff", rpc as never));
    await expect(tool(tools, "get_profit_summary").run({})).rejects.toThrow(/finance.read/);
    await expect(tool(tools, "get_expense_summary").run({})).rejects.toThrow(/finance.read/);
    await expect(tool(tools, "get_sales_summary").run({})).rejects.toThrow(/reports.read/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires finance access to rank by profit", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    await expect(tool(buildTools(ctx("staff", rpc)), "get_top_products").run({ sort_by: "profit" })).rejects.toThrow();
    await expect(tool(buildTools(ctx("manager", rpc)), "get_top_products").run({ sort_by: "profit" })).resolves.toBeTruthy();
  });

  it("rejects invalid or unexpected parameters (no injection of extra fields such as another org id)", async () => {
    const rpc = vi.fn(async () => ({ data: {}, error: null }));
    const tools = buildTools(ctx("owner", rpc));
    await expect(tool(tools, "get_sales_summary").run({ period: "forever" })).rejects.toThrow(/Invalid parameters/);
    await expect(tool(tools, "get_sales_summary").run({ period: "today", p_org: "someone-else" })).rejects.toThrow(/Invalid parameters/);
    await expect(tool(tools, "get_top_products").run({ limit: 1000 })).rejects.toThrow(/Invalid parameters/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps database permission errors to a safe message", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "secret detail", code: "GO403" } }));
    await expect(tool(buildTools(ctx("owner", rpc)), "get_sales_summary").run({})).rejects.toThrow("Access denied for this data.");
  });
});

describe("tool results", () => {
  it("marks a true zero explicitly so the model doesn't confuse it with missing data", async () => {
    const rpc = vi.fn(async () => ({ data: { order_count: 0, net_sales: 0, payments_received: 0 }, error: null }));
    const r = await tool(buildTools(ctx("owner", rpc)), "get_sales_summary").run({ period: "today" });
    expect((r.data as { data_notes: string[] }).data_notes[0]).toMatch(/true zero/);
  });

  it("computes comparisons in code, including n/a for growth from zero", async () => {
    const rpc = vi.fn(async (_fn: string, a: Record<string, unknown>) => ({
      data: a.p_from === "2026-11-01" ? { net_sales: 150000, order_count: 10, cash_received: 0 } : { net_sales: 100000, order_count: 8, cash_received: 0 },
      error: null,
    }));
    const r = await tool(buildTools(ctx("owner", rpc)), "get_sales_comparison").run({ current: { period: "this_month" }, previous: { period: "last_month" } });
    const c = (r.data as { comparison: Record<string, { difference: number; percent_change: number | string }> }).comparison;
    expect(c.net_sales).toEqual({ current: 150000, previous: 100000, difference: 50000, percent_change: 50 });
    expect(c.cash_received?.percent_change).toBe(0);
    expect((r.data as { data_notes: string[] }).data_notes[0]).toMatch(/differ in length/);
  });

  it("asks for clarification when a customer name is ambiguous", async () => {
    const rpc = vi.fn(async () => ({ data: { customer: {} }, error: null }));
    const tools = buildTools(ctx("owner", rpc));
    const amb = await tool(tools, "get_customer_purchase_history").run({ customer_name: "Ad" });
    expect(amb.data).toMatchObject({ found: false, ambiguous: true });
    await tool(tools, "get_customer_purchase_history").run({ customer_name: "Ngozi Eze" });
    expect(rpc).toHaveBeenCalledWith("report_customer_history", { p_org: "org-1", p_customer: "c3" });
  });

  it("flags late orders", async () => {
    const rpc = vi.fn(async () => ({ data: { orders_by_status: { confirmed: 1 } }, error: null }));
    const r = await tool(buildTools(ctx("owner", rpc)), "get_order_summary").run({});
    expect((r.data as { late_orders: unknown[] }).late_orders).toHaveLength(1);
  });
});
