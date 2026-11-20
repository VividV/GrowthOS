import { z } from "zod";
import type { AITool } from "@platform/ai-core";
import type { Permission } from "@platform/permissions";
import { addDays, percentChange, resolveRange, todayIn } from "@/lib/dates";

/**
 * Controlled business-data tool layer for the AI assistant.
 *
 * Guarantees for every tool:
 *  1. Authentication — the context is built from a verified session (requireWorkspace).
 *  2. Membership     — every query is scoped to ctx.orgId; SQL functions re-check membership.
 *  3. Permission     — checked here (ctx.can) AND inside the SQL function (defence in depth).
 *  4. Authorised rows only — the user's own RLS-scoped client is used, never the service key.
 *  5. Validation     — inputs are parsed with Zod; invalid input throws, never queries.
 *  6. Structured results — JSON with explicit periods, counts and data-quality notes.
 * All arithmetic is done in SQL or in this file — never by the model.
 */
export interface ToolContext {
  orgId: string;
  timezone: string;
  currency: string;
  can: (p: Permission) => boolean;
  db: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
    customersByName: (name: string) => Promise<{ id: string; full_name: string; phone: string | null }[]>;
    openOrders: () => Promise<{ order_number: string; status: string; order_date: string; expected_delivery_date: string | null; total: number; balance_due: number; customer: string | null }[]>;
  };
  now?: Date;
}

export const PERIODS = ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "last_7_days", "last_30_days", "last_90_days", "this_year", "custom"] as const;
const periodInput = {
  period: z.enum(PERIODS).default("this_month"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
};
const periodSchema = z.object(periodInput).strict();
const periodJson = {
  period: { type: "string", enum: [...PERIODS], description: "Reporting period, in the business's timezone. Use 'custom' with from/to for specific dates." },
  from: { type: "string", description: "YYYY-MM-DD, only with period=custom" },
  to: { type: "string", description: "YYYY-MM-DD, only with period=custom" },
};

export function resolvePeriod(p: z.infer<typeof periodSchema>, tz: string, now = new Date()): { from: string; to: string; label: string } {
  const today = todayIn(tz, now);
  switch (p.period) {
    case "today": return { from: today, to: today, label: "today" };
    case "yesterday": { const y = addDays(today, -1); return { from: y, to: y, label: "yesterday" }; }
    case "this_week": { const r = resolveRange({ range: "week" }, tz, now); return { from: r.from, to: r.to, label: "this week" }; }
    case "last_week": { const r = resolveRange({ range: "week" }, tz, now); return { from: addDays(r.from, -7), to: addDays(r.from, -1), label: "last week" }; }
    case "this_month": { const r = resolveRange({ range: "month" }, tz, now); return { from: r.from, to: r.to, label: "this month (to date)" }; }
    case "last_month": { const r = resolveRange({ range: "last_month" }, tz, now); return { from: r.from, to: r.to, label: r.label }; }
    case "last_7_days": return { from: addDays(today, -6), to: today, label: "the last 7 days" };
    case "last_30_days": return { from: addDays(today, -29), to: today, label: "the last 30 days" };
    case "last_90_days": return { from: addDays(today, -89), to: today, label: "the last 90 days" };
    case "this_year": return { from: `${today.slice(0, 4)}-01-01`, to: today, label: "this year (to date)" };
    case "custom":
      if (!p.from || !p.to || p.from > p.to) throw new Error("A custom period needs valid 'from' and 'to' dates (YYYY-MM-DD, from ≤ to).");
      return { from: p.from, to: p.to, label: `${p.from} to ${p.to}` };
  }
}

function requirePerm(ctx: ToolContext, ...perms: Permission[]) {
  for (const p of perms) if (!ctx.can(p)) throw new Error(`Your role does not allow access to this data (${p}). Tell the user to ask the workspace owner.`);
}

async function call<T>(ctx: ToolContext, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await ctx.db.rpc(fn, { p_org: ctx.orgId, ...args });
  if (error) throw new Error(error.code === "GO403" ? "Access denied for this data." : `Could not load data (${fn}).`);
  return data as T;
}

const num = (v: unknown) => Number(v ?? 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

function salesNotes(s: Record<string, unknown>): string[] {
  const notes: string[] = [];
  if (num(s.order_count) === 0) notes.push("No confirmed orders were recorded in this period (this is a true zero from the records, not missing data).");
  if (num(s.payments_received) === 0 && num(s.order_count) > 0) notes.push("Orders exist but no payments were recorded in this period — cash received is zero.");
  return notes;
}

type Def<S extends z.ZodTypeAny> = {
  name: string; description: string; schema: S; json: AITool["inputSchema"];
  run: (ctx: ToolContext, input: z.infer<S>) => Promise<{ data: unknown; summary: string }>;
};
const def = <S extends z.ZodTypeAny>(d: Def<S>) => d;

export const TOOL_DEFS = [
  def({
    name: "get_sales_summary",
    description: "Sales recorded, money received, refunds, returns, outstanding balances, order counts, average order value and new customers for a period.",
    schema: periodSchema, json: { type: "object", properties: periodJson, additionalProperties: false },
    async run(ctx, input) {
      requirePerm(ctx, "reports.read");
      const r = resolvePeriod(input, ctx.timezone, ctx.now);
      const s = await call<Record<string, unknown>>(ctx, "report_sales_summary", { p_from: r.from, p_to: r.to });
      return { data: { period: r, currency: ctx.currency, ...s, data_notes: salesNotes(s) }, summary: `Sales summary · ${r.label}` };
    },
  }),
  def({
    name: "get_expense_summary",
    description: "Operating expenses for a period: total and breakdown by category (largest first).",
    schema: periodSchema, json: { type: "object", properties: periodJson, additionalProperties: false },
    async run(ctx, input) {
      requirePerm(ctx, "finance.read");
      const r = resolvePeriod(input, ctx.timezone, ctx.now);
      const rows = await call<{ category_name: string; total: number; entries: number }[]>(ctx, "report_expense_breakdown", { p_from: r.from, p_to: r.to });
      const total = round2(rows.reduce((a, x) => a + num(x.total), 0));
      return {
        data: { period: r, currency: ctx.currency, total_expenses: total, by_category: rows.map((x) => ({ category: x.category_name, total: num(x.total), entries: num(x.entries), share_pct: total ? round2((num(x.total) / total) * 100) : 0 })),
          data_notes: rows.length === 0 ? ["No expenses were recorded in this period. If the business had costs, they have not been entered yet."] : [] },
        summary: `Expenses · ${r.label}`,
      };
    },
  }),
  def({
    name: "get_profit_summary",
    description: "Profit and loss for a period: revenue (net sales), cost of goods sold, gross profit and margin, operating expenses, other income and estimated net profit.",
    schema: periodSchema, json: { type: "object", properties: periodJson, additionalProperties: false },
    async run(ctx, input) {
      requirePerm(ctx, "finance.read");
      const r = resolvePeriod(input, ctx.timezone, ctx.now);
      const s = await call<Record<string, unknown>>(ctx, "report_financial_summary", { p_from: r.from, p_to: r.to });
      const notes = salesNotes(s);
      if (num(s.items_missing_cost) > 0) notes.push(`${s.items_missing_cost} sold item(s) have no cost price, so COGS is understated and profit overstated.`);
      if (num(s.expense_count) === 0) notes.push("No operating expenses recorded in this period — net profit may be overstated if costs were not entered.");
      return { data: { period: r, currency: ctx.currency, ...s, definitions: "net_sales = sales − returns; gross_profit = net_sales − cogs; net_profit = gross_profit + other_income − operating_expenses", data_notes: notes }, summary: `Profit summary · ${r.label}` };
    },
  }),
  def({
    name: "get_top_products",
    description: "Best-performing products in a period ranked by revenue, quantity sold, or profit (profit requires finance access). Net of returns.",
    schema: z.object({ ...periodInput, sort_by: z.enum(["revenue", "quantity", "profit"]).default("revenue"), limit: z.number().int().min(1).max(20).default(5) }).strict(),
    json: { type: "object", properties: { ...periodJson, sort_by: { type: "string", enum: ["revenue", "quantity", "profit"] }, limit: { type: "integer", minimum: 1, maximum: 20 } }, additionalProperties: false },
    async run(ctx, input) {
      requirePerm(ctx, "reports.read");
      if (input.sort_by === "profit") requirePerm(ctx, "finance.read");
      const r = resolvePeriod(input, ctx.timezone, ctx.now);
      const rows = await call<Record<string, unknown>[]>(ctx, "report_top_products", { p_from: r.from, p_to: r.to, p_limit: input.limit, p_sort: input.sort_by });
      return { data: { period: r, currency: ctx.currency, sorted_by: input.sort_by, products: rows, data_notes: rows.length ? [] : ["No products were sold in this period."] }, summary: `Top products by ${input.sort_by} · ${r.label}` };
    },
  }),
  def({
    name: "get_low_stock_products",
    description: "Products/variants whose available stock (on hand minus reserved for orders) is at or below their restock threshold.",
    schema: z.object({ limit: z.number().int().min(1).max(50).default(20) }).strict(),
    json: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false },
    async run(ctx, input) {
      requirePerm(ctx, "products.read");
      const rows = await call<Record<string, unknown>[]>(ctx, "report_low_stock", { p_limit: input.limit });
      return { data: { as_of: todayIn(ctx.timezone, ctx.now), items: rows, out_of_stock: rows.filter((x) => num(x.quantity_available) <= 0).length }, summary: "Low-stock items" };
    },
  }),
  def({
    name: "get_customer_balances",
    description: "Customers who currently owe money (unpaid or part-paid confirmed orders), largest balance first, with how long it has been outstanding.",
    schema: z.object({ limit: z.number().int().min(1).max(50).default(10) }).strict(),
    json: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false },
    async run(ctx, input) {
      requirePerm(ctx, "customers.read", "orders.read");
      const rows = await call<Record<string, unknown>[]>(ctx, "report_customer_balances", { p_limit: input.limit });
      const total = round2(rows.reduce((a, x) => a + num(x.outstanding), 0));
      return { data: { as_of: todayIn(ctx.timezone, ctx.now), currency: ctx.currency, customers_listed: rows.length, total_outstanding_listed: total, customers: rows,
        data_notes: ["Walk-in orders without a customer are not included in this list."] }, summary: "Customer balances" };
    },
  }),
  def({
    name: "get_order_summary",
    description: "Order pipeline: counts by status for a period, plus the currently open orders (not yet delivered) with any that are past their expected delivery date.",
    schema: periodSchema, json: { type: "object", properties: periodJson, additionalProperties: false },
    async run(ctx, input) {
      requirePerm(ctx, "orders.read");
      const r = resolvePeriod(input, ctx.timezone, ctx.now);
      const today = todayIn(ctx.timezone, ctx.now);
      const [s, open] = await Promise.all([
        ctx.can("reports.read") ? call<Record<string, unknown>>(ctx, "report_sales_summary", { p_from: r.from, p_to: r.to }) : Promise.resolve(null),
        ctx.db.openOrders(),
      ]);
      const late = open.filter((o) => o.expected_delivery_date && o.expected_delivery_date < today);
      return { data: { period: r, orders_by_status_in_period: s?.orders_by_status ?? "not available for your role", open_orders_now: open.length,
        late_orders: late.slice(0, 15), open_orders_sample: open.slice(0, 15) }, summary: `Order summary · ${r.label}` };
    },
  }),
  def({
    name: "get_customer_purchase_history",
    description: "Purchase history for one customer, looked up by name: totals, balance, last purchase, recent orders and favourite products. Returns candidates if the name is ambiguous.",
    schema: z.object({ customer_name: z.string().trim().min(2).max(100) }).strict(),
    json: { type: "object", properties: { customer_name: { type: "string", description: "Full or partial customer name" } }, required: ["customer_name"], additionalProperties: false },
    async run(ctx, input) {
      requirePerm(ctx, "customers.read", "orders.read");
      const matches = await ctx.db.customersByName(input.customer_name);
      if (matches.length === 0) return { data: { found: false, message: `No customer matching "${input.customer_name}".` }, summary: `Customer lookup: ${input.customer_name}` };
      if (matches.length > 1) {
        const exact = matches.filter((m) => m.full_name.toLowerCase() === input.customer_name.toLowerCase());
        if (exact.length !== 1) return { data: { found: false, ambiguous: true, candidates: matches.slice(0, 8).map((m) => ({ name: m.full_name, phone: m.phone })), message: "Several customers match — ask the user which one." }, summary: `Customer lookup: ${input.customer_name}` };
        matches.splice(0, matches.length, exact[0]!);
      }
      const h = await call<Record<string, unknown>>(ctx, "report_customer_history", { p_customer: matches[0]!.id });
      return { data: { found: true, currency: ctx.currency, ...h }, summary: `History for ${matches[0]!.full_name}` };
    },
  }),
  def({
    name: "get_sales_comparison",
    description: "Compare sales (and profit, if permitted) between two periods, e.g. this_month vs last_month. Differences and percentages are calculated for you.",
    schema: z.object({ current: z.object(periodInput).strict(), previous: z.object(periodInput).strict() }).strict(),
    json: { type: "object", properties: { current: { type: "object", properties: periodJson }, previous: { type: "object", properties: periodJson } }, required: ["current", "previous"], additionalProperties: false },
    async run(ctx, input) {
      requirePerm(ctx, "reports.read");
      const a = resolvePeriod(input.current, ctx.timezone, ctx.now);
      const b = resolvePeriod(input.previous, ctx.timezone, ctx.now);
      const fn = ctx.can("finance.read") ? "report_financial_summary" : "report_sales_summary";
      const [sa, sb] = await Promise.all([call<Record<string, unknown>>(ctx, fn, { p_from: a.from, p_to: a.to }), call<Record<string, unknown>>(ctx, fn, { p_from: b.from, p_to: b.to })]);
      const metrics = ["net_sales", "cash_received", "order_count", "average_order_value", "gross_profit", "operating_expenses", "net_profit"].filter((k) => k in sa);
      const comparison = Object.fromEntries(metrics.map((k) => {
        const cur = num(sa[k]); const prev = num(sb[k]);
        const pct = percentChange(cur, prev);
        return [k, { current: cur, previous: prev, difference: round2(cur - prev), percent_change: pct === null ? "n/a (previous was zero)" : round2(pct) }];
      }));
      const notes: string[] = [];
      const daysA = (Date.parse(a.to) - Date.parse(a.from)) / 864e5 + 1; const daysB = (Date.parse(b.to) - Date.parse(b.from)) / 864e5 + 1;
      if (daysA !== daysB) notes.push(`Periods differ in length (${daysA} vs ${daysB} days); a month-to-date period is naturally smaller than a full month.`);
      return { data: { current_period: a, previous_period: b, currency: ctx.currency, comparison, data_notes: notes }, summary: `Comparison · ${a.label} vs ${b.label}` };
    },
  }),
  def({
    name: "get_inactive_customers",
    description: "Customers who have bought before but not within the last N days, highest lifetime spend first — good candidates for re-engagement.",
    schema: z.object({ days: z.number().int().min(7).max(365).default(60), limit: z.number().int().min(1).max(50).default(10) }).strict(),
    json: { type: "object", properties: { days: { type: "integer", minimum: 7, maximum: 365 }, limit: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false },
    async run(ctx, input) {
      requirePerm(ctx, "customers.read");
      const rows = await call<Record<string, unknown>[]>(ctx, "report_inactive_customers", { p_days: input.days, p_limit: input.limit });
      return { data: { as_of: todayIn(ctx.timezone, ctx.now), inactive_for_days: input.days, customers: rows }, summary: `Customers inactive > ${input.days} days` };
    },
  }),
  def({
    name: "get_business_activity",
    description: "Recent activity (orders, payments, new customers) plus suggested follow-ups: outstanding payments, stale enquiries, late orders, repeat-purchase and lapsed customers. Use for 'what should I focus on'.",
    schema: z.object({ limit: z.number().int().min(1).max(30).default(10) }).strict(),
    json: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 30 } }, additionalProperties: false },
    async run(ctx, input) {
      requirePerm(ctx, "orders.read");
      const [activity, suggestions] = await Promise.all([
        call<Record<string, unknown>[]>(ctx, "report_recent_activity", { p_limit: input.limit }),
        ctx.can("tasks.read") ? call<Record<string, unknown>[]>(ctx, "suggest_follow_ups", {}) : Promise.resolve([]),
      ]);
      return { data: { as_of: todayIn(ctx.timezone, ctx.now), currency: ctx.currency, recent_activity: activity, suggested_follow_ups: suggestions.slice(0, 15) }, summary: "Recent activity & suggestions" };
    },
  }),
];

/** Binds tool definitions to a request context, adding validation and permission enforcement. */
export function buildTools(ctx: ToolContext): AITool[] {
  return TOOL_DEFS.map((d) => ({
    name: d.name,
    description: d.description,
    inputSchema: d.json,
    run: async (raw: unknown) => {
      const parsed = (d.schema as z.ZodTypeAny).safeParse(raw ?? {});
      if (!parsed.success) throw new Error(`Invalid parameters: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      return (d.run as (c: ToolContext, i: unknown) => Promise<{ data: unknown; summary: string }>)(ctx, parsed.data);
    },
  }));
}
