import "server-only";
import { getServerClient } from "@platform/database/server";
import { toAppError, type FinancialSummary, type SalesSummary } from "@platform/database";

/**
 * Read helpers. Every call uses the signed-in user's client, so RLS and the
 * permission checks inside the SQL report functions apply.
 */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toAppError(error);
  return data as T;
}

export const getSalesSummary = (org: string, from: string, to: string) =>
  rpc<SalesSummary>("report_sales_summary", { p_org: org, p_from: from, p_to: to });

export const getFinancialSummary = (org: string, from: string, to: string) =>
  rpc<FinancialSummary>("report_financial_summary", { p_org: org, p_from: from, p_to: to });

export interface SeriesPoint { bucket: string; sales: number; cash_received: number; expenses: number | null; orders: number }
export const getTimeseries = async (org: string, from: string, to: string, bucket: "day" | "week" | "month") =>
  (await rpc<Record<string, unknown>[]>("report_timeseries", { p_org: org, p_from: from, p_to: to, p_bucket: bucket })).map((r) => ({
    bucket: String(r.bucket), sales: Number(r.sales), cash_received: Number(r.cash_received),
    expenses: r.expenses === null ? null : Number(r.expenses), orders: Number(r.orders),
  })) as SeriesPoint[];

export interface TopProduct { product_id: string; product_name: string; quantity: number; revenue: number; cogs: number | null; profit: number | null; margin_pct: number | null }
export const getTopProducts = async (org: string, from: string, to: string, limit = 5, sort: "revenue" | "quantity" | "profit" = "revenue") =>
  (await rpc<Record<string, unknown>[]>("report_top_products", { p_org: org, p_from: from, p_to: to, p_limit: limit, p_sort: sort })).map((r) => ({
    product_id: String(r.product_id), product_name: String(r.product_name), quantity: Number(r.quantity), revenue: Number(r.revenue),
    cogs: r.cogs === null ? null : Number(r.cogs), profit: r.profit === null ? null : Number(r.profit),
    margin_pct: r.margin_pct === null ? null : Number(r.margin_pct),
  })) as TopProduct[];

export interface LowStockRow { variant_id: string; product_id: string; product_name: string; variant_name: string | null; sku: string; quantity_on_hand: number; quantity_reserved: number; quantity_available: number; low_stock_threshold: number }
export const getLowStock = (org: string, limit = 20) => rpc<LowStockRow[]>("report_low_stock", { p_org: org, p_limit: limit });

export interface BalanceRow { customer_id: string; customer_name: string; phone: string | null; open_orders: number; outstanding: number; oldest_order_date: string }
export const getCustomerBalances = async (org: string, limit = 20) =>
  (await rpc<Record<string, unknown>[]>("report_customer_balances", { p_org: org, p_limit: limit })).map((r) => ({
    ...r, outstanding: Number(r.outstanding), open_orders: Number(r.open_orders),
  })) as BalanceRow[];

export interface ActivityRow { kind: "order" | "payment" | "refund" | "customer"; occurred_at: string; title: string; detail: string; amount: number | null; ref_id: string }
export const getRecentActivity = (org: string, limit = 10) => rpc<ActivityRow[]>("report_recent_activity", { p_org: org, p_limit: limit });

export interface ExpenseBreakdownRow { category_id: string; category_name: string; total: number; entries: number }
export const getExpenseBreakdown = async (org: string, from: string, to: string) =>
  (await rpc<Record<string, unknown>[]>("report_expense_breakdown", { p_org: org, p_from: from, p_to: to })).map((r) => ({
    category_id: String(r.category_id), category_name: String(r.category_name), total: Number(r.total), entries: Number(r.entries),
  })) as ExpenseBreakdownRow[];

export interface SuggestionRow { suggestion_key: string; kind: string; title: string; reason: string; customer_id: string | null; customer_name: string | null; order_id: string | null; priority: string; amount: number | null }
export const getSuggestions = (org: string) => rpc<SuggestionRow[]>("suggest_follow_ups", { p_org: org });

export async function getUpcomingTasks(org: string, limit = 6) {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("follow_up_tasks")
    .select("id, title, due_date, priority, status, customers(full_name)")
    .eq("organization_id", org)
    .in("status", ["open", "in_progress"])
    .order("due_date")
    .limit(limit);
  if (error) throw toAppError(error);
  return (data ?? []) as unknown as { id: string; title: string; due_date: string; priority: string; status: string; customers: { full_name: string } | null }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filterable = any;
export async function countRows(table: string, org: string, filters: (q: Filterable) => Filterable = (q) => q): Promise<number> {
  const supabase = await getServerClient();
  const q = supabase.from(table).select("id", { count: "exact", head: true }).eq("organization_id", org);
  const { count, error } = (await filters(q)) as { count: number | null; error: unknown };
  if (error) throw toAppError(error);
  return count ?? 0;
}

/** Safely run a report the user might not have permission for. */
export async function optional<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}
