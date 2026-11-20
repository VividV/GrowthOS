import { percentChange } from "./dates";

/**
 * Rule-based dashboard insights. Deterministic, cheap, and available even when
 * the AI provider is down. Every insight carries the evidence it was derived
 * from; if the evidence is missing, the insight is not produced.
 */
export interface Insight {
  id: string;
  tone: "positive" | "negative" | "warning" | "neutral";
  title: string;
  detail: string;
  href?: string;
  evidence: Record<string, string | number>;
}

export interface InsightInput {
  currency: string;
  rangeLabel: string;
  current: { net_sales: number; cash_received: number; order_count: number; new_customers: number };
  previous: { net_sales: number; order_count: number } | null;
  lowStock: { product_name: string; variant_name: string | null; quantity_available: number }[];
  balances: { customer_name: string; outstanding: number }[];
  topProduct: { product_name: string; quantity: number; revenue: number } | null;
  overdueTasks: number;
  draftEnquiries: number;
  outstandingTotal: number;
  itemsMissingCost?: number;
  hasAnyOrders: boolean;
}

const money = (n: number, c: string) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: c, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(n);

export function buildInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];

  if (!i.hasAnyOrders) {
    out.push({
      id: "no-orders", tone: "neutral", title: "Record your first order",
      detail: "Insights appear once you have orders. Add a product, then create an order — it takes under a minute.",
      href: "/orders/new", evidence: { orders: 0 },
    });
    return out;
  }

  if (i.previous) {
    const change = percentChange(i.current.net_sales, i.previous.net_sales);
    if (change !== null && Math.abs(change) >= 5) {
      out.push({
        id: "sales-trend",
        tone: change > 0 ? "positive" : "negative",
        title: `Sales ${change > 0 ? "up" : "down"} ${Math.abs(change).toFixed(0)}% vs the previous period`,
        detail: `${money(i.current.net_sales, i.currency)} in net sales (${i.rangeLabel.toLowerCase()}) compared with ${money(i.previous.net_sales, i.currency)} before.`,
        href: "/finance",
        evidence: { current: i.current.net_sales, previous: i.previous.net_sales },
      });
    } else if (i.previous.net_sales === 0 && i.current.net_sales > 0) {
      out.push({
        id: "sales-trend", tone: "positive", title: "First sales in this comparison window",
        detail: `${money(i.current.net_sales, i.currency)} in net sales with none in the previous period.`,
        evidence: { current: i.current.net_sales, previous: 0 },
      });
    }
  }

  if (i.lowStock.length > 0) {
    const names = i.lowStock.slice(0, 3).map((p) => (p.variant_name ? `${p.product_name} (${p.variant_name})` : p.product_name));
    const out0 = i.lowStock.filter((p) => p.quantity_available <= 0).length;
    out.push({
      id: "low-stock", tone: "warning",
      title: `${i.lowStock.length} item${i.lowStock.length === 1 ? " is" : "s are"} at or below restock level`,
      detail: `${names.join(", ")}${i.lowStock.length > 3 ? ` and ${i.lowStock.length - 3} more` : ""}.${out0 ? ` ${out0} out of stock.` : ""}`,
      href: "/inventory?filter=low",
      evidence: { low_stock_items: i.lowStock.length, out_of_stock: out0 },
    });
  }

  if (i.balances.length > 0) {
    const top = i.balances[0]!;
    out.push({
      id: "balances", tone: "warning",
      title: `${i.balances.length} customer${i.balances.length === 1 ? " owes" : "s owe"} you ${money(i.outstandingTotal, i.currency)}`,
      detail: `Largest balance: ${top.customer_name} (${money(top.outstanding, i.currency)}). Follow up to improve cash flow.`,
      href: "/tasks?suggest=1",
      evidence: { customers_owing: i.balances.length, outstanding: i.outstandingTotal },
    });
  }

  if (i.topProduct && i.topProduct.quantity > 0) {
    out.push({
      id: "top-product", tone: "positive",
      title: `Best seller: ${i.topProduct.product_name}`,
      detail: `${i.topProduct.quantity} sold for ${money(i.topProduct.revenue, i.currency)} (${i.rangeLabel.toLowerCase()}).`,
      href: "/products",
      evidence: { quantity: i.topProduct.quantity, revenue: i.topProduct.revenue },
    });
  }

  if (i.current.order_count > 0 && i.current.cash_received < i.current.net_sales * 0.6) {
    out.push({
      id: "cash-gap", tone: "warning",
      title: "Cash collected is lagging sales",
      detail: `You received ${money(i.current.cash_received, i.currency)} against ${money(i.current.net_sales, i.currency)} in sales this period.`,
      href: "/orders?payment=unpaid",
      evidence: { cash_received: i.current.cash_received, net_sales: i.current.net_sales },
    });
  }

  if (i.overdueTasks > 0) {
    out.push({
      id: "tasks", tone: "neutral", title: `${i.overdueTasks} follow-up${i.overdueTasks === 1 ? " is" : "s are"} overdue`,
      detail: "Clear them from your daily task list.", href: "/tasks", evidence: { overdue_tasks: i.overdueTasks },
    });
  }

  if (i.draftEnquiries > 0) {
    out.push({
      id: "drafts", tone: "neutral", title: `${i.draftEnquiries} enquir${i.draftEnquiries === 1 ? "y" : "ies"} not yet confirmed`,
      detail: "Draft orders older than 3 days — a quick message could close them.", href: "/orders?status=draft",
      evidence: { draft_orders: i.draftEnquiries },
    });
  }

  if (i.itemsMissingCost && i.itemsMissingCost > 0) {
    out.push({
      id: "missing-cost", tone: "neutral", title: "Some products have no cost price",
      detail: `${i.itemsMissingCost} sold item${i.itemsMissingCost === 1 ? "" : "s"} had a zero cost, so profit is overstated. Add cost prices to products.`,
      href: "/products", evidence: { items_missing_cost: i.itemsMissingCost },
    });
  }

  return out.slice(0, 6);
}
