import Link from "next/link";
import { Download, Plus, ShoppingBag } from "lucide-react";
import { Button, Card, EmptyState, MobileList, PageHeader, TBody, THead, TR, Table, formatDate, formatMoney } from "@platform/ui";
import { requirePermission } from "@platform/auth";
import { getServerClient } from "@platform/database/server";
import { toAppError, type Order } from "@platform/database";
import { ListToolbar } from "@/components/list-toolbar";
import { PAGE_SIZE, Pagination, pageFrom, sanitizeSearch } from "@/components/pagination";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/status";

export const metadata = { title: "Orders" };

type Row = Order & { customers: { full_name: string } | null; order_items: { quantity: number }[] };

export default async function Orders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ws = await requirePermission("orders.read");
  const cur = ws.organization.currency;
  const page = pageFrom(sp);
  const q = sanitizeSearch(sp.q);
  const supabase = await getServerClient();

  let query = supabase.from("orders").select("*, customers(full_name), order_items(quantity)", { count: "exact" }).eq("organization_id", ws.organization.id);
  if (sp.status === "open") query = query.in("status", ["confirmed", "processing", "ready", "dispatched"]);
  else if (sp.status === "processing") query = query.in("status", ["processing", "ready"]);
  else if (sp.status) query = query.eq("status", sp.status);
  if (sp.payment === "unpaid") query = query.in("payment_status", ["unpaid", "partially_paid"]).not("status", "in", "(draft,cancelled)");
  else if (sp.payment) query = query.eq("payment_status", sp.payment);
  if (q) {
    const { data: matches } = await supabase.from("customers").select("id").eq("organization_id", ws.organization.id).ilike("full_name", `%${q}%`).limit(100);
    const ids = (matches ?? []).map((m) => m.id as string);
    query = query.or([`order_number.ilike.%${q}%`, ids.length ? `customer_id.in.(${ids.join(",")})` : null].filter(Boolean).join(","));
  }
  const { data, count, error } = await query.order("order_date", { ascending: false }).order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw toAppError(error);
  const rows = (data ?? []) as Row[];
  const canWrite = ws.can("orders.write") && ws.writable;
  const canExport = ws.can("data.export") && ws.entitlements.csv_export?.enabled;

  return (
    <div className="space-y-5">
      <PageHeader title="Orders" description="Every sale from enquiry to delivery — with payments and balances."
        actions={<>
          {ws.can("data.export") && (canExport ? <Button asChild variant="outline"><a href="/api/export/orders"><Download /> Export</a></Button>
            : <Button variant="outline" disabled title="CSV export is available on Growth and Pro plans"><Download /> Export</Button>)}
          {canWrite && <Button asChild><Link href="/orders/new"><Plus /> New order</Link></Button>}
        </>} />
      <ListToolbar placeholder="Search order number or customer" filters={[
        { name: "status", label: "Status", options: [
          { value: "", label: "All statuses" }, { value: "open", label: "Open (not delivered)" }, { value: "draft", label: "Draft / enquiry" },
          { value: "confirmed", label: "Confirmed" }, { value: "processing", label: "Processing / ready" }, { value: "dispatched", label: "Dispatched" },
          { value: "delivered", label: "Delivered" }, { value: "cancelled", label: "Cancelled" }] },
        { name: "payment", label: "Payment", options: [
          { value: "", label: "Any payment" }, { value: "unpaid", label: "Owing money" }, { value: "paid", label: "Paid" }, { value: "refunded", label: "Refunded" }] },
      ]} />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={ShoppingBag} title={q || sp.status || sp.payment ? "No orders match" : "No orders yet"}
            description="Record sales from Instagram, WhatsApp or your shop. Stock and balances update automatically."
            action={canWrite && !q ? <Button asChild><Link href="/orders/new"><Plus /> Create order</Link></Button> : undefined} />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Status</th><th>Payment</th><th className="text-right">Total</th><th className="text-right">Balance</th></tr></THead>
                <TBody>
                  {rows.map((o) => (
                    <TR key={o.id}>
                      <td><Link href={`/orders/${o.id}`} className="font-medium hover:text-primary">{o.order_number}</Link><div className="text-xs text-muted-foreground">{o.order_items.reduce((a, i) => a + i.quantity, 0)} items{o.channel ? ` · ${o.channel}` : ""}</div></td>
                      <td className="text-sm">{o.customers?.full_name ?? <span className="text-muted-foreground">Walk-in</span>}</td>
                      <td className="whitespace-nowrap text-sm">{formatDate(o.order_date)}</td>
                      <td><OrderStatusBadge status={o.status} /></td>
                      <td>{o.status !== "draft" && <PaymentStatusBadge status={o.payment_status} />}</td>
                      <td className="text-right tabular">{formatMoney(o.total, cur)}</td>
                      <td className="text-right tabular">{Number(o.balance_due) > 0 && o.status !== "draft" ? <span className="font-medium text-warning">{formatMoney(o.balance_due, cur)}</span> : Number(o.balance_due) < 0 ? <span className="text-info">credit {formatMoney(-Number(o.balance_due), cur)}</span> : "—"}</td>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <MobileList className="md:hidden">
              {rows.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="block px-4 py-3 active:bg-accent">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{o.order_number}</span>
                      <span className="text-sm font-medium tabular">{formatMoney(o.total, cur)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">{o.customers?.full_name ?? "Walk-in"} · {formatDate(o.order_date, { day: "numeric", month: "short" })}</span>
                      <span className="flex gap-1"><OrderStatusBadge status={o.status} />{o.status !== "draft" && <PaymentStatusBadge status={o.payment_status} />}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </MobileList>
            <Pagination page={page} total={count ?? 0} basePath="/orders" params={{ q: sp.q, status: sp.status, payment: sp.payment }} />
          </>
        )}
      </Card>
    </div>
  );
}
