import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Mail, MessageCircle, Phone } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, TBody, THead, TR, Table, cn, formatDate, formatDateTime, formatMoney } from "@platform/ui";
import { requirePermission } from "@platform/auth";
import { loadOrder } from "@/server/order-detail";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/status";
import { OrderActions, VoidPaymentButton } from "./order-actions";

export const metadata = { title: "Order" };
const FLOW = ["draft", "confirmed", "processing", "ready", "dispatched", "delivered"];

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await requirePermission("orders.read");
  const o = await loadOrder(ws.organization.id, id);
  if (!o) notFound();
  const cur = ws.organization.currency;
  const tz = ws.organization.timezone;
  const n = Number;
  const writable = ws.writable;
  const stepIndex = FLOW.indexOf(o.status);
  const timeline = [
    { label: "Created", at: o.created_at },
    { label: "Confirmed", at: o.confirmed_at },
    { label: "Dispatched", at: o.dispatched_at },
    { label: "Delivered", at: o.delivered_at },
    { label: "Cancelled", at: o.cancelled_at },
  ].filter((t) => t.at);
  const wa = o.customers?.phone?.replace(/\D/g, "").replace(/^0/, "234");

  return (
    <div className="space-y-5">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground no-print"><ArrowLeft className="h-4 w-4" /> Orders</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{o.order_number}</h1>
            <OrderStatusBadge status={o.status} />
            {o.status !== "draft" && <PaymentStatusBadge status={o.payment_status} />}
          </div>
          <p className="text-sm text-muted-foreground">{formatDate(o.order_date)}{o.channel ? ` · via ${o.channel}` : ""}{o.expected_delivery_date ? ` · delivery by ${formatDate(o.expected_delivery_date)}` : ""}</p>
        </div>
        <OrderActions id={o.id} status={o.status} balanceDue={n(o.balance_due)} amountPaid={n(o.amount_paid)} currency={cur}
          items={o.order_items.map((i) => ({ id: i.id, name: `${i.product_name}${i.variant_name ? ` · ${i.variant_name}` : ""}`, quantity: i.quantity, returned: i.returned_quantity }))}
          can={{ write: writable && ws.can("orders.write"), cancel: writable && ws.can("orders.cancel"), pay: writable && ws.can("payments.record"), refund: writable && ws.can("payments.refund") }} />
      </div>

      {o.status !== "cancelled" && (
        <ol className="flex items-center gap-1 overflow-x-auto rounded-xl border bg-card p-3 no-print" aria-label="Order progress">
          {FLOW.slice(1).map((s, i) => {
            const done = stepIndex >= i + 1;
            return (
              <li key={s} className="flex flex-1 items-center gap-2">
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold", done ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={cn("whitespace-nowrap text-xs capitalize", done ? "font-medium" : "text-muted-foreground")}>{s}</span>
                {i < 4 && <span className={cn("h-px min-w-4 flex-1", done ? "bg-primary" : "bg-border")} />}
              </li>
            );
          })}
        </ol>
      )}
      {o.status === "cancelled" && (
        <div className="rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
          Cancelled {formatDateTime(o.cancelled_at, tz)}{o.cancel_reason ? ` — ${o.cancel_reason}` : ""}.
          {n(o.amount_paid) > 0 && <> {formatMoney(o.amount_paid, cur)} was paid and has not been refunded yet.</>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader><CardTitle>Items</CardTitle></CardHeader>
            <CardContent className="p-0 sm:p-0 pt-3">
              <Table>
                <THead><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Line total</th></tr></THead>
                <TBody>
                  {o.order_items.map((i) => (
                    <TR key={i.id}>
                      <td>
                        <Link href={`/products/${i.product_id}`} className="font-medium hover:text-primary">{i.product_name}</Link>
                        <div className="text-xs text-muted-foreground">{i.variant_name ? `${i.variant_name} · ` : ""}{i.sku}{n(i.discount_amount) > 0 ? ` · −${formatMoney(i.discount_amount, cur)} discount` : ""}</div>
                        {i.returned_quantity > 0 && <Badge tone="warning" className="mt-1">{i.returned_quantity} returned</Badge>}
                      </td>
                      <td className="text-right tabular">{i.quantity}</td>
                      <td className="text-right tabular">{formatMoney(i.unit_price, cur)}</td>
                      <td className="text-right tabular">{formatMoney(i.line_total, cur)}</td>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <dl className="space-y-1.5 border-t px-5 py-4 text-sm">
                <Row label="Subtotal" value={formatMoney(o.subtotal, cur)} />
                {n(o.discount_amount) > 0 && <Row label="Discount" value={`−${formatMoney(o.discount_amount, cur)}`} />}
                {n(o.delivery_fee) > 0 && <Row label="Delivery" value={formatMoney(o.delivery_fee, cur)} />}
                <Row label="Total" value={formatMoney(o.total, cur)} strong />
                {n(o.returns_total) > 0 && <Row label="Returns credited" value={`−${formatMoney(o.returns_total, cur)}`} />}
                {o.status !== "draft" && <Row label="Paid (net of refunds)" value={formatMoney(o.amount_paid, cur)} />}
                {o.status !== "draft" && o.status !== "cancelled" && (
                  n(o.balance_due) >= 0
                    ? <Row label="Balance due" value={formatMoney(o.balance_due, cur)} strong tone={n(o.balance_due) > 0 ? "warning" : "success"} />
                    : <Row label="Owed to customer" value={formatMoney(-n(o.balance_due), cur)} strong tone="info" />
                )}
                {ws.can("finance.read") && o.status !== "draft" && (
                  <p className="pt-2 text-xs text-muted-foreground">Cost of goods {formatMoney(o.cost_total, cur)} · estimated gross profit {formatMoney(n(o.total) - n(o.delivery_fee) - n(o.cost_total), cur)}</p>
                )}
              </dl>
            </CardContent>
          </Card>

          {o.status !== "draft" && (
            <Card className="overflow-hidden">
              <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
              <CardContent className="p-0 sm:p-0 pt-3">
                {o.payments.length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">No payments recorded yet.</p> : (
                  <Table>
                    <THead><tr><th>Date</th><th>Type</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th><th /></tr></THead>
                    <TBody>
                      {o.payments.map((p) => (
                        <TR key={p.id} className={p.voided_at ? "text-muted-foreground line-through" : ""}>
                          <td className="whitespace-nowrap text-sm">{formatDateTime(p.paid_at, tz)}</td>
                          <td className="text-sm capitalize">{p.kind}</td>
                          <td className="text-sm capitalize">{p.method.replace("_", " ")}</td>
                          <td className="text-sm">{p.reference ?? "—"}{p.voided_at && <span className="block text-xs no-underline">Voided: {p.void_reason}</span>}</td>
                          <td className={cn("text-right tabular", p.kind === "refund" && "text-danger")}>{p.kind === "refund" ? "−" : ""}{formatMoney(p.amount, cur)}</td>
                          <td className="text-right">{!p.voided_at && ws.can("payments.refund") && writable && <VoidPaymentButton paymentId={p.id} orderId={o.id} />}</td>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {o.order_returns.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Returns</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {o.order_returns.map((r) => (
                    <li key={r.id} className="flex justify-between gap-3">
                      <span>{formatDate(r.return_date)} · {r.order_return_items.reduce((a, i) => a + i.quantity, 0)} item(s){r.reason ? ` · ${r.reason}` : ""} {r.restocked ? <Badge tone="success">Restocked</Badge> : <Badge>Not restocked</Badge>}</span>
                      <span className="tabular">−{formatMoney(r.credit_amount, cur)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {o.customers ? (
                <>
                  <Link href={`/customers/${o.customers.id}`} className="font-medium text-primary">{o.customers.full_name}</Link>
                  {o.customers.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><a href={`tel:${o.customers.phone}`}>{o.customers.phone}</a>
                    {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hello ${o.customers.full_name.split(" ")[0]}, about your order ${o.order_number}`)}`} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-primary"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>}</p>}
                  {o.customers.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{o.customers.email}</p>}
                </>
              ) : <p className="text-muted-foreground">Walk-in customer</p>}
              {o.delivery_address && <p className="pt-2 text-muted-foreground"><span className="block text-xs">Delivery address</span>{o.delivery_address}</p>}
            </CardContent>
          </Card>
          {o.notes && <Card><CardHeader><CardTitle>Notes</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm">{o.notes}</p></CardContent></Card>}
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {timeline.map((t) => <li key={t.label} className="flex justify-between"><span>{t.label}</span><span className="text-muted-foreground">{formatDateTime(t.at, tz)}</span></li>)}
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">Stock: {{ none: "not yet reserved", reserved: "reserved", deducted: "deducted", released: "released" }[o.stock_state] ?? o.stock_state}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "warning" | "success" | "info" }) {
  return (
    <div className={cn("flex justify-between", strong && "font-semibold", tone === "warning" && "text-warning", tone === "success" && "text-success", tone === "info" && "text-info")}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt><dd className="tabular">{value}</dd>
    </div>
  );
}
