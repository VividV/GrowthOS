import Link from "next/link";
import { Download, Info, Wallet } from "lucide-react";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, StatCard, TBody, THead, TR, Table, cn,
  formatDate, formatDateTime, formatMoney,
} from "@platform/ui";
import { requirePermission } from "@platform/auth";
import { getServerClient } from "@platform/database/server";
import { resolveRange, todayIn } from "@/lib/dates";
import { getExpenseBreakdown, getFinancialSummary } from "@/server/queries";
import { voidFinancialRecordAction } from "@/server/finance-actions";
import { DateRangeFilter } from "@/components/date-range-filter";
import { ConfirmAction } from "@/components/confirm-action";
import { ExpenseDialog, IncomeDialog } from "./finance-forms";

export const metadata = { title: "Finance" };

export default async function Finance({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ws = await requirePermission("finance.read");
  const org = ws.organization.id;
  const cur = ws.organization.currency;
  const tz = ws.organization.timezone;
  const range = resolveRange(sp, tz);
  const today = todayIn(tz);
  const tab = sp.tab ?? "expenses";
  const supabase = await getServerClient();

  const [s, breakdown, cats, expenses, income, payments] = await Promise.all([
    getFinancialSummary(org, range.from, range.to),
    getExpenseBreakdown(org, range.from, range.to),
    supabase.from("expense_categories").select("id, name").eq("organization_id", org).is("archived_at", null).order("name"),
    supabase.from("expenses").select("*, expense_categories(name)").eq("organization_id", org).gte("expense_date", range.from).lte("expense_date", range.to).order("expense_date", { ascending: false }).limit(300),
    supabase.from("income_records").select("*").eq("organization_id", org).gte("income_date", range.from).lte("income_date", range.to).order("income_date", { ascending: false }).limit(200),
    tab === "payments" ? supabase.from("payments").select("*, orders(order_number), customers(full_name)").eq("organization_id", org).order("paid_at", { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
  ]);
  const n = Number;
  const canWrite = ws.can("finance.write") && ws.writable;
  const maxCat = Math.max(1, ...breakdown.map((b) => b.total));
  const canExport = ws.can("data.export") && ws.entitlements.csv_export?.enabled;

  const pl: { label: string; value: number; sign?: "-" | "+"; strong?: boolean; hint?: string }[] = [
    { label: "Sales recorded", value: n(s.gross_sales), hint: `${s.order_count} confirmed orders` },
    { label: "Returns", value: n(s.returns), sign: "-" },
    { label: "Revenue (net sales)", value: n(s.net_sales), strong: true },
    { label: "Cost of goods sold", value: n(s.cogs), sign: "-" },
    { label: "Gross profit", value: n(s.gross_profit), strong: true, hint: s.gross_margin_pct !== null ? `${s.gross_margin_pct}% margin` : undefined },
    { label: "Operating expenses", value: n(s.operating_expenses), sign: "-" },
    { label: "Other income", value: n(s.other_income), sign: "+" },
    { label: "Estimated net profit", value: n(s.net_profit), strong: true },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Finance" description={`Money in, money out and estimated profit · ${range.label}`}
        actions={<DateRangeFilter current={range.key} from={range.from} to={range.to} />} />

      <div className="flex flex-wrap gap-2">
        {canWrite && <ExpenseDialog categories={(cats.data ?? []) as { id: string; name: string }[]} today={today} defaultOpen={sp.new === "expense"} />}
        {canWrite && <IncomeDialog today={today} />}
        {ws.can("data.export") && (canExport
          ? <Button variant="ghost" asChild><a href={`/api/export/finance?from=${range.from}&to=${range.to}`}><Download /> Export</a></Button>
          : <Button variant="ghost" disabled title="CSV export is available on Growth and Pro plans"><Download /> Export</Button>)}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue" value={formatMoney(s.net_sales, cur)} hint="sales − returns" />
        <StatCard label="Cash received" value={formatMoney(s.cash_received, cur)} tone="success" hint="payments − refunds" />
        <StatCard label="Outstanding (all time)" value={formatMoney(s.outstanding_total, cur)} tone={n(s.outstanding_total) > 0 ? "warning" : "default"} />
        <StatCard label="Estimated net profit" value={formatMoney(s.net_profit, cur)} tone={n(s.net_profit) >= 0 ? "success" : "danger"} />
      </div>

      {n(s.items_missing_cost) > 0 && (
        <Alert tone="warning" title="Profit may be overstated" action={<Button asChild size="sm" variant="outline"><Link href="/products">Add cost prices</Link></Button>}>
          {s.items_missing_cost} sold item(s) in this period have no cost price, so their cost of goods is counted as zero.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Profit summary</CardTitle><CardDescription>How your sales turn into profit this period</CardDescription></CardHeader>
          <CardContent>
            <dl className="divide-y">
              {pl.map((r) => (
                <div key={r.label} className={cn("flex items-center justify-between py-2.5 text-sm", r.strong && "font-semibold")}>
                  <dt className={cn(!r.strong && "text-muted-foreground")}>{r.label}{r.hint && <span className="ml-2 text-xs font-normal text-muted-foreground">{r.hint}</span>}</dt>
                  <dd className={cn("tabular", r.strong && r.value < 0 && "text-danger")}>{r.sign === "-" ? "−" : r.sign === "+" ? "+" : ""}{formatMoney(Math.abs(r.value), cur)}{r.strong && r.value < 0 ? " loss" : ""}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 flex gap-2 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5 shrink-0" />
              Management estimate, not a statutory account. Sales count when an order is confirmed; cash counts only when a payment is recorded. Unpaid orders never count as cash.</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Expenses by category</CardTitle></CardHeader>
          <CardContent>
            {breakdown.length === 0 ? <p className="text-sm text-muted-foreground">No expenses in this period.</p> : (
              <ul className="space-y-3">
                {breakdown.map((b) => (
                  <li key={b.category_id} className="space-y-1">
                    <div className="flex justify-between text-sm"><span>{b.category_name}</span><span className="tabular">{formatMoney(b.total, cur)}</span></div>
                    <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-chart-3" style={{ width: `${(b.total / maxCat) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex gap-1 border-b px-3">
          {[["expenses", "Expenses"], ["income", "Other income"], ["payments", "Payments ledger"]].map(([k, l]) => (
            <Link key={k} href={`/finance?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>, tab: k! }).toString()}`}
              className={cn("-mb-px border-b-2 px-3 py-3 text-sm font-medium", tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>{l}</Link>
          ))}
        </div>
        {tab === "expenses" && ((expenses.data ?? []).length === 0 ? <EmptyState icon={Wallet} title="No expenses recorded" description="Record rent, transport, packaging and other costs to see your real profit." /> : (
          <Table>
            <THead><tr><th>Date</th><th>Description</th><th>Category</th><th className="text-right">Amount</th><th /></tr></THead>
            <TBody>
              {(expenses.data ?? []).map((e) => (
                <TR key={e.id as string} className={e.voided_at ? "text-muted-foreground line-through" : ""}>
                  <td className="whitespace-nowrap text-sm">{formatDate(e.expense_date as string)}</td>
                  <td className="text-sm">{e.description as string}{e.vendor ? <span className="block text-xs text-muted-foreground">{e.vendor as string}</span> : null}</td>
                  <td><Badge>{(e.expense_categories as { name: string } | null)?.name}</Badge></td>
                  <td className="text-right tabular">{formatMoney(e.amount as number, cur)}</td>
                  <td className="text-right">{!e.voided_at && canWrite && <ConfirmAction label="Void" size="sm" variant="ghost" destructive title="Void this expense?" description="It stays in the audit trail but is excluded from reports." run={async () => { "use server"; return voidFinancialRecordAction("expenses", e.id as string); }} />}</td>
                </TR>
              ))}
            </TBody>
          </Table>
        ))}
        {tab === "income" && ((income.data ?? []).length === 0 ? <EmptyState icon={Wallet} title="No other income in this period" /> : (
          <Table>
            <THead><tr><th>Date</th><th>Description</th><th>Source</th><th className="text-right">Amount</th><th /></tr></THead>
            <TBody>
              {(income.data ?? []).map((e) => (
                <TR key={e.id as string} className={e.voided_at ? "text-muted-foreground line-through" : ""}>
                  <td className="text-sm">{formatDate(e.income_date as string)}</td><td className="text-sm">{e.description as string}</td>
                  <td className="text-sm">{(e.source as string) ?? "—"}</td><td className="text-right tabular">{formatMoney(e.amount as number, cur)}</td>
                  <td className="text-right">{!e.voided_at && canWrite && <ConfirmAction label="Void" size="sm" variant="ghost" destructive title="Void this income?" run={async () => { "use server"; return voidFinancialRecordAction("income_records", e.id as string); }} />}</td>
                </TR>
              ))}
            </TBody>
          </Table>
        ))}
        {tab === "payments" && (
          <Table>
            <THead><tr><th>When</th><th>Order</th><th>Customer</th><th>Method</th><th className="text-right">Amount</th></tr></THead>
            <TBody>
              {((payments.data ?? []) as Record<string, unknown>[]).map((p) => (
                <TR key={p.id as string} className={p.voided_at ? "text-muted-foreground line-through" : ""}>
                  <td className="whitespace-nowrap text-sm">{formatDateTime(p.paid_at as string, tz)}</td>
                  <td className="text-sm"><Link className="text-primary" href={`/orders/${p.order_id}`}>{(p.orders as { order_number: string } | null)?.order_number}</Link></td>
                  <td className="text-sm">{(p.customers as { full_name: string } | null)?.full_name ?? "Walk-in"}</td>
                  <td className="text-sm capitalize">{String(p.method).replace("_", " ")}</td>
                  <td className={cn("text-right tabular", p.kind === "refund" ? "text-danger" : "text-success")}>{p.kind === "refund" ? "−" : "+"}{formatMoney(p.amount as number, cur)}</td>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
