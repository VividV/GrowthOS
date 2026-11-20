import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Banknote, Boxes, CircleDollarSign, Clock, CreditCard, Lightbulb, PackageCheck, Receipt,
  ShoppingBag, Sparkles, TrendingDown, TrendingUp, UserPlus, Users, Wallet,
} from "lucide-react";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, StatCard, cn,
  formatDate, formatDateTime, formatMoney, formatNumber, relativeDays,
} from "@platform/ui";
import { requireWorkspace } from "@platform/auth";
import { bucketFor, percentChange, resolveRange, todayIn } from "@/lib/dates";
import { buildInsights } from "@/lib/insights";
import {
  countRows, getCustomerBalances, getFinancialSummary, getLowStock, getRecentActivity, getSalesSummary, getTimeseries,
  getTopProducts, getUpcomingTasks, optional,
} from "@/server/queries";
import { DateRangeFilter } from "@/components/date-range-filter";
import { RevenueExpenseChart, SalesTrendChart, StatusDonut, TopProductsChart } from "@/components/charts";
import { PriorityBadge } from "@/components/status";

export const metadata = { title: "Dashboard" };

const n = (v: unknown) => Number(v ?? 0);

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ws = await requireWorkspace();
  const org = ws.organization.id;
  const cur = ws.organization.currency;
  const tz = ws.organization.timezone;
  const range = resolveRange(sp, tz);
  const today = todayIn(tz);
  const bucket = bucketFor(range);
  const canReports = ws.can("reports.read");
  const canFinance = ws.can("finance.read");

  const [sales, prev, fin, series, top, lowStock, balances, activity, tasks, drafts, overdue, anyOrders] = await Promise.all([
    canReports ? getSalesSummary(org, range.from, range.to) : null,
    canReports ? getSalesSummary(org, range.prevFrom, range.prevTo) : null,
    canFinance ? getFinancialSummary(org, range.from, range.to) : null,
    canReports ? getTimeseries(org, range.from, range.to, bucket) : null,
    canReports ? getTopProducts(org, range.from, range.to, 5) : null,
    ws.can("products.read") ? getLowStock(org, 8) : [],
    ws.can("customers.read") && ws.can("orders.read") ? optional(getCustomerBalances(org, 5)) : null,
    ws.can("orders.read") ? getRecentActivity(org, 8) : [],
    ws.can("tasks.read") ? getUpcomingTasks(org, 6) : [],
    ws.can("orders.read") ? countRows("orders", org, (q) => q.eq("status", "draft").lt("updated_at", new Date(Date.now() - 3 * 86400000).toISOString())) : 0,
    ws.can("tasks.read") ? countRows("follow_up_tasks", org, (q) => q.in("status", ["open", "in_progress"]).lt("due_date", today)) : 0,
    ws.can("orders.read") ? countRows("orders", org, (q) => q.neq("status", "draft")) : 0,
  ]);

  const insights = buildInsights({
    currency: cur,
    rangeLabel: range.label,
    current: { net_sales: n(sales?.net_sales), cash_received: n(sales?.cash_received), order_count: n(sales?.order_count), new_customers: n(sales?.new_customers) },
    previous: prev ? { net_sales: n(prev.net_sales), order_count: n(prev.order_count) } : null,
    lowStock: lowStock ?? [],
    balances: (balances ?? []).map((b) => ({ customer_name: b.customer_name, outstanding: b.outstanding })),
    topProduct: top?.[0] ?? null,
    overdueTasks: overdue,
    draftEnquiries: drafts,
    outstandingTotal: n(sales?.outstanding_total),
    itemsMissingCost: fin ? n(fin.items_missing_cost) : 0,
    hasAnyOrders: anyOrders > 0,
  });

  const change = (c: unknown, p: unknown) => (prev ? percentChange(n(c), n(p)) : null);
  const statusData = sales
    ? ["confirmed", "processing", "ready", "dispatched", "delivered", "cancelled"]
        .map((s) => ({ status: s, count: n(sales.orders_by_status?.[s]) }))
        .filter((d) => d.count > 0)
    : [];
  const welcome = sp.welcome;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={formatDate(today, { weekday: "long", day: "numeric", month: "long" })}
        title={`Good ${greeting(tz)}, ${((ws.user.user_metadata?.full_name as string) || "there").split(" ")[0]}`}
        description={canReports ? `${ws.organization.name} · ${range.label}` : ws.organization.name}
        actions={canReports ? <DateRangeFilter current={range.key} from={range.from} to={range.to} /> : undefined}
      />

      {welcome === "empty" && anyOrders === 0 && (
        <Alert tone="success" title="Your workspace is ready 🎉" action={<Button asChild size="sm"><Link href="/products/new">Add your first product</Link></Button>}>
          Add a few products and customers, then record an order. Your dashboard fills in automatically.
        </Alert>
      )}
      {sp.denied && <Alert tone="warning">You don&apos;t have access to that page. Ask the workspace owner to change your role.</Alert>}

      {canReports && sales && (
        <section aria-label="Business performance" className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Sales recorded" value={formatMoney(sales.net_sales, cur)} icon={TrendingUp}
              change={{ value: change(sales.net_sales, prev?.net_sales) }} hint={`${formatNumber(sales.order_count)} orders`} />
            <StatCard label="Money received" value={formatMoney(sales.cash_received, cur)} icon={Banknote} tone="success"
              change={{ value: change(sales.cash_received, prev?.cash_received) }} hint="payments − refunds" />
            <StatCard label="Outstanding (all time)" value={formatMoney(sales.outstanding_total, cur)} icon={CreditCard}
              tone={n(sales.outstanding_total) > 0 ? "warning" : "default"} hint={`${formatNumber(sales.customers_owing)} customers owe`} />
            {fin ? (
              <StatCard label="Estimated net profit" value={formatMoney(fin.net_profit, cur)} icon={n(fin.net_profit) >= 0 ? CircleDollarSign : TrendingDown}
                tone={n(fin.net_profit) >= 0 ? "success" : "danger"} hint="after COGS & expenses" />
            ) : (
              <StatCard label="Average order" value={formatMoney(sales.average_order_value, cur)} icon={Receipt} />
            )}
          </div>
          {fin && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Total expenses" value={formatMoney(fin.operating_expenses, cur)} icon={Wallet} hint={`${fin.expense_count} entries`} />
              <StatCard label="Cost of goods sold" value={formatMoney(fin.cogs, cur)} icon={Boxes} />
              <StatCard label="Gross profit" value={formatMoney(fin.gross_profit, cur)} icon={CircleDollarSign}
                hint={fin.gross_margin_pct !== null ? `${fin.gross_margin_pct}% margin` : undefined} />
              <StatCard label="Average order" value={formatMoney(sales.average_order_value, cur)} icon={Receipt} />
            </div>
          )}
        </section>
      )}

      <section aria-label="Operations" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {sales ? (
          <>
            <MiniStat label="Orders" value={sales.order_count} href="/orders" icon={ShoppingBag} />
            <MiniStat label="Pending" value={n(sales.open_orders?.confirmed)} href="/orders?status=confirmed" icon={Clock} />
            <MiniStat label="Processing" value={n(sales.open_orders?.processing) + n(sales.open_orders?.ready)} href="/orders?status=processing" icon={PackageCheck} />
            <MiniStat label="Completed" value={n(sales.orders_by_status?.delivered)} href="/orders?status=delivered" icon={PackageCheck} />
            <MiniStat label="Customers" value={sales.total_customers} sub={`+${sales.new_customers} new`} href="/customers" icon={Users} />
            <MiniStat label="Low stock" value={sales.low_stock_count} href="/inventory?filter=low" icon={AlertTriangle} warn={sales.low_stock_count > 0} />
          </>
        ) : (
          <>
            <MiniStat label="Low stock" value={lowStock.length} href="/inventory?filter=low" icon={AlertTriangle} warn={lowStock.length > 0} />
            <MiniStat label="Overdue follow-ups" value={overdue} href="/tasks" icon={Clock} warn={overdue > 0} />
          </>
        )}
      </section>

      {ws.can("reports.read") && (
        <Card className="overflow-hidden border-primary/20">
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft"><Lightbulb className="h-4 w-4 text-primary" /></span>
              <div>
                <CardTitle>Insights</CardTitle>
                <CardDescription>Generated from your records · {range.label}</CardDescription>
              </div>
            </div>
            {ws.can("ai.use") && (
              <Button asChild variant="outline" size="sm"><Link href="/assistant?q=What%20should%20I%20focus%20on%20this%20week%3F"><Sparkles /> Ask AI</Link></Button>
            )}
          </CardHeader>
          <CardContent>
            {insights.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing needs your attention right now. 👌</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {insights.map((i) => (
                  <li key={i.id}>
                    <Link href={i.href ?? "#"} className="group flex h-full gap-3 rounded-lg border bg-background p-3 transition hover:border-primary/30 hover:shadow-card">
                      <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", { positive: "bg-success", negative: "bg-danger", warning: "bg-warning", neutral: "bg-info" }[i.tone])} />
                      <span className="min-w-0 space-y-0.5">
                        <span className="block text-sm font-medium">{i.title}</span>
                        <span className="block text-xs text-muted-foreground">{i.detail}</span>
                      </span>
                      <ArrowRight className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {series && sales && (
        <section className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader><CardTitle>Sales trend</CardTitle><CardDescription>Net sales recorded vs money actually received</CardDescription></CardHeader>
            <CardContent className="pt-2">
              {anyOrders > 0 ? <SalesTrendChart data={series} currency={cur} bucket={bucket} /> : <EmptyState icon={TrendingUp} title="No sales yet" description="Your sales trend appears after your first confirmed order." />}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Order status</CardTitle><CardDescription>Orders placed {range.label.toLowerCase()}</CardDescription></CardHeader>
            <CardContent>
              {statusData.length ? <StatusDonut data={statusData} /> : <EmptyState icon={ShoppingBag} title="No orders in this period" />}
            </CardContent>
          </Card>
          {canFinance && (
            <Card className="lg:col-span-3">
              <CardHeader><CardTitle>Revenue vs expenses</CardTitle></CardHeader>
              <CardContent className="pt-2"><RevenueExpenseChart data={series} currency={cur} bucket={bucket} /></CardContent>
            </Card>
          )}
          <Card className={canFinance ? "lg:col-span-2" : "lg:col-span-5"}>
            <CardHeader className="flex-row items-center justify-between"><CardTitle>Top-selling products</CardTitle><Link href="/products" className="text-xs font-medium text-primary">All products</Link></CardHeader>
            <CardContent>
              {top && top.length ? <TopProductsChart data={top} currency={cur} /> : <EmptyState icon={Boxes} title="No product sales in this period" />}
            </CardContent>
          </Card>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        {ws.can("orders.read") && (
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between"><CardTitle>Recent activity</CardTitle><Link href="/orders" className="text-xs font-medium text-primary">View orders</Link></CardHeader>
            <CardContent className="pt-3">
              {activity.length === 0 ? (
                <EmptyState icon={ShoppingBag} title="No activity yet" description="Orders, payments and new customers will show up here." />
              ) : (
                <ul className="divide-y">
                  {activity.map((a) => {
                    const Icon = { order: ShoppingBag, payment: Banknote, refund: TrendingDown, customer: UserPlus }[a.kind];
                    const href = a.kind === "customer" ? `/customers/${a.ref_id}` : `/orders/${a.ref_id}`;
                    return (
                      <li key={`${a.kind}-${a.ref_id}-${a.occurred_at}`}>
                        <Link href={href} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle"><Icon className="h-4 w-4 text-muted-foreground" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{a.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">{a.detail}</span>
                          </span>
                          <span className="text-right">
                            {a.amount !== null && <span className={cn("block text-sm font-medium tabular", a.kind === "payment" && "text-success", a.kind === "refund" && "text-danger")}>{a.kind === "refund" ? "−" : ""}{formatMoney(a.amount, cur)}</span>}
                            <span className="block text-2xs text-muted-foreground">{formatDateTime(a.occurred_at, tz)}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
        <div className="space-y-4">
          {ws.can("tasks.read") && (
            <Card>
              <CardHeader className="flex-row items-center justify-between"><CardTitle>Upcoming follow-ups</CardTitle><Link href="/tasks" className="text-xs font-medium text-primary">All</Link></CardHeader>
              <CardContent className="pt-3">
                {tasks.length === 0 ? <p className="text-sm text-muted-foreground">No open follow-ups.</p> : (
                  <ul className="space-y-2.5">
                    {tasks.map((t) => (
                      <li key={t.id} className="flex items-start gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{t.title}</span>
                          <span className={cn("text-xs", t.due_date < today ? "text-danger" : "text-muted-foreground")}>{relativeDays(t.due_date, today)}{t.customers ? ` · ${t.customers.full_name}` : ""}</span>
                        </span>
                        <PriorityBadge priority={t.priority} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
          {lowStock.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between"><CardTitle>Low stock</CardTitle><Link href="/inventory?filter=low" className="text-xs font-medium text-primary">Restock</Link></CardHeader>
              <CardContent className="pt-3">
                <ul className="space-y-2">
                  {lowStock.slice(0, 5).map((s) => (
                    <li key={s.variant_id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{s.product_name}{s.variant_name ? <span className="text-muted-foreground"> · {s.variant_name}</span> : null}</span>
                      <Badge tone={s.quantity_available <= 0 ? "danger" : "warning"}>{s.quantity_available} left</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {balances && balances.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between"><CardTitle>Customers who owe you</CardTitle><Link href="/customers?filter=owing" className="text-xs font-medium text-primary">All</Link></CardHeader>
              <CardContent className="pt-3">
                <ul className="space-y-2">
                  {balances.map((b) => (
                    <li key={b.customer_id}>
                      <Link href={`/customers/${b.customer_id}`} className="flex items-center justify-between gap-2 text-sm hover:opacity-80">
                        <span className="truncate">{b.customer_name}</span>
                        <span className="font-medium tabular text-warning">{formatMoney(b.outstanding, cur)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}

function MiniStat({ label, value, sub, href, icon: Icon, warn }: { label: string; value: number | string; sub?: string; href: string; icon: typeof Users; warn?: boolean }) {
  return (
    <Link href={href} className="rounded-xl border bg-card p-3 shadow-card transition hover:border-primary/30">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={cn("h-3.5 w-3.5", warn ? "text-warning" : "text-muted-foreground")} />
      </div>
      <p className={cn("mt-1 text-lg font-semibold tabular", warn && "text-warning")}>{formatNumber(value)}</p>
      {sub && <p className="text-2xs text-muted-foreground">{sub}</p>}
    </Link>
  );
}

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
