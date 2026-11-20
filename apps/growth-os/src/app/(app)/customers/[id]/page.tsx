import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, Mail, MapPin, MessageCircle, Phone, Plus, ShoppingBag, Trash2 } from "lucide-react";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, DescriptionList, EmptyState, StatCard, TBody, THead, TR, Table,
  formatDate, formatDateTime, formatMoney,
} from "@platform/ui";
import { requirePermission } from "@platform/auth";
import { getServerClient } from "@platform/database/server";
import { toAppError, type CustomerSummary, type Order, type Payment } from "@platform/database";
import { OrderStatusBadge, PaymentStatusBadge, PriorityBadge } from "@/components/status";
import { ConfirmAction } from "@/components/confirm-action";
import { deleteCustomerAction, setCustomerArchivedAction } from "@/server/customer-actions";
import { CustomerDialog } from "../customer-form";
import { TaskDialog } from "../../tasks/task-form";

export const metadata = { title: "Customer" };

export default async function CustomerProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ws = await requirePermission("customers.read");
  const cur = ws.organization.currency;
  const tz = ws.organization.timezone;
  const supabase = await getServerClient();

  const { data: c, error } = await supabase.from("customer_summaries").select("*").eq("id", id).eq("organization_id", ws.organization.id).maybeSingle();
  if (error) throw toAppError(error);
  if (!c) notFound();
  const customer = c as CustomerSummary;

  const [ordersRes, paymentsRes, tasksRes, historyRes, membersRes] = await Promise.all([
    ws.can("orders.read") ? supabase.from("orders").select("*").eq("customer_id", id).order("order_date", { ascending: false }).limit(50) : null,
    ws.can("orders.read") ? supabase.from("payments").select("*, orders(order_number)").eq("customer_id", id).order("paid_at", { ascending: false }).limit(50) : null,
    ws.can("tasks.read") ? supabase.from("follow_up_tasks").select("*").eq("customer_id", id).order("due_date", { ascending: false }).limit(30) : null,
    ws.can("orders.read") ? supabase.rpc("report_customer_history", { p_org: ws.organization.id, p_customer: id }) : null,
    supabase.from("organization_members").select("user_id, profiles(full_name)").eq("organization_id", ws.organization.id).eq("status", "active"),
  ]);
  const orders = (ordersRes?.data ?? []) as Order[];
  const payments = (paymentsRes?.data ?? []) as (Payment & { orders: { order_number: string } | null })[];
  const tasks = (tasksRes?.data ?? []) as { id: string; title: string; due_date: string; status: string; priority: string; completion_notes: string | null }[];
  const favourites = ((historyRes?.data as { favourite_products?: { product_name: string; quantity: number }[] } | null)?.favourite_products ?? []);
  const members = ((membersRes.data ?? []) as unknown as { user_id: string; profiles: { full_name: string } | null }[])
    .map((m) => ({ id: m.user_id, name: m.profiles?.full_name || "Team member" }));

  const canWrite = ws.can("customers.write") && ws.writable;
  const waNumber = customer.phone?.replace(/\D/g, "").replace(/^0/, "234");
  const archived = Boolean(customer.archived_at);

  return (
    <div className="space-y-5">
      <Link href="/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Customers</Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{customer.full_name}</h1>
            {archived && <Badge tone="neutral">Archived</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{customer.customer_code} · Customer since {formatDate(customer.created_at, undefined, tz)}</p>
          <div className="flex flex-wrap gap-3 pt-1 text-sm">
            {customer.phone && <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1.5 text-primary"><Phone className="h-3.5 w-3.5" /> {customer.phone}</a>}
            {waNumber && <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>}
            {customer.email && <a href={`mailto:${customer.email}`} className="inline-flex items-center gap-1.5 text-primary"><Mail className="h-3.5 w-3.5" /> {customer.email}</a>}
            {customer.location && <span className="inline-flex items-center gap-1.5 text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {customer.location}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ws.can("orders.write") && ws.writable && !archived && <Button asChild><Link href={`/orders/new?customer=${id}`}><ShoppingBag /> New order</Link></Button>}
          {ws.can("tasks.write") && ws.writable && <TaskDialog members={members} customerId={id} trigger={<Button variant="outline"><Plus /> Follow-up</Button>} currentUserId={ws.user.id} canAssign={ws.can("tasks.assign")} />}
          {canWrite && <CustomerDialog customer={customer} />}
          {canWrite && (
            <ConfirmAction
              label={archived ? "Restore" : "Archive"} icon={archived ? <ArchiveRestore /> : <Archive />} variant="outline"
              title={archived ? "Restore this customer?" : "Archive this customer?"}
              description={archived ? undefined : "They'll be hidden from lists but their orders and payments are kept."}
              run={async () => { "use server"; return setCustomerArchivedAction(id, !archived); }}
            />
          )}
          {ws.can("customers.delete") && ws.writable && customer.total_orders === 0 && (
            <ConfirmAction label="Delete" icon={<Trash2 />} destructive title="Delete this customer permanently?"
              description="This can't be undone. Customers with orders can only be archived." confirmLabel="Delete"
              run={async () => { "use server"; return deleteCustomerAction(id); }} redirectTo="/customers" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total orders" value={customer.total_orders} />
        <StatCard label="Total spent" value={formatMoney(customer.total_spent, cur)} />
        <StatCard label="Outstanding balance" value={formatMoney(customer.outstanding_balance, cur)} tone={Number(customer.outstanding_balance) > 0 ? "warning" : "default"} />
        <StatCard label="Last purchase" value={customer.last_purchase_date ? formatDate(customer.last_purchase_date) : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Order history</CardTitle></CardHeader>
            <CardContent className="p-0 sm:p-0 pt-3">
              {orders.length === 0 ? <EmptyState icon={ShoppingBag} title="No orders yet" /> : (
                <Table>
                  <THead><tr><th>Order</th><th>Date</th><th>Status</th><th>Payment</th><th className="text-right">Total</th><th className="text-right">Balance</th></tr></THead>
                  <TBody>
                    {orders.map((o) => (
                      <TR key={o.id}>
                        <td><Link href={`/orders/${o.id}`} className="font-medium hover:text-primary">{o.order_number}</Link></td>
                        <td className="whitespace-nowrap text-sm">{formatDate(o.order_date)}</td>
                        <td><OrderStatusBadge status={o.status} /></td>
                        <td><PaymentStatusBadge status={o.payment_status} /></td>
                        <td className="text-right tabular">{formatMoney(o.total, cur)}</td>
                        <td className="text-right tabular">{Number(o.balance_due) > 0 && o.status !== "cancelled" ? <span className="text-warning">{formatMoney(o.balance_due, cur)}</span> : "—"}</td>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Payment history</CardTitle></CardHeader>
            <CardContent className="p-0 sm:p-0 pt-3">
              {payments.length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">No payments recorded.</p> : (
                <Table>
                  <THead><tr><th>Date</th><th>Order</th><th>Method</th><th className="text-right">Amount</th></tr></THead>
                  <TBody>
                    {payments.map((p) => (
                      <TR key={p.id} className={p.voided_at ? "opacity-50" : ""}>
                        <td className="whitespace-nowrap text-sm">{formatDateTime(p.paid_at, tz)}</td>
                        <td className="text-sm">{p.orders?.order_number}</td>
                        <td className="text-sm capitalize">{p.method.replace("_", " ")}{p.voided_at && <Badge tone="neutral" className="ml-2">Voided</Badge>}</td>
                        <td className={`text-right tabular ${p.kind === "refund" ? "text-danger" : ""}`}>{p.kind === "refund" ? "−" : ""}{formatMoney(p.amount, cur)}</td>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent>
              <DescriptionList className="sm:grid-cols-1" items={[
                { label: "Address", value: customer.address },
                { label: "Source", value: customer.source ? <span className="capitalize">{customer.source}</span> : null },
              ]} />
              <div className="mt-4">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{customer.notes || <span className="text-muted-foreground">No notes yet.</span>}</p>
              </div>
            </CardContent>
          </Card>
          {favourites.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Purchase summary</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {favourites.map((f) => <li key={f.product_name} className="flex justify-between"><span>{f.product_name}</span><span className="tabular text-muted-foreground">×{f.quantity}</span></li>)}
                </ul>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Follow-up history</CardTitle></CardHeader>
            <CardContent>
              {tasks.length === 0 ? <p className="text-sm text-muted-foreground">No follow-ups yet.</p> : (
                <ul className="space-y-3">
                  {tasks.map((t) => (
                    <li key={t.id} className="text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className={t.status === "completed" ? "text-muted-foreground line-through" : ""}>{t.title}</span>
                        <PriorityBadge priority={t.priority} />
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDate(t.due_date)} · {t.status.replace("_", " ")}</p>
                      {t.completion_notes && <p className="mt-0.5 text-xs italic text-muted-foreground">“{t.completion_notes}”</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
