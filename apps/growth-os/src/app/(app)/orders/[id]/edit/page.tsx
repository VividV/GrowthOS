import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@platform/ui";
import { requirePermission } from "@platform/auth";
import { todayIn } from "@/lib/dates";
import { loadOrder } from "@/server/order-detail";
import { loadBuilderData } from "@/server/order-data";
import { OrderBuilder } from "../../order-builder";

export const metadata = { title: "Edit draft order" };

export default async function EditOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await requirePermission("orders.write");
  const o = await loadOrder(ws.organization.id, id);
  if (!o) notFound();
  if (o.status !== "draft" || !ws.writable) redirect(`/orders/${id}`);
  const data = await loadBuilderData(ws.organization.id);
  return (
    <div className="space-y-5">
      <Link href={`/orders/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {o.order_number}</Link>
      <PageHeader title={`Edit ${o.order_number}`} description="Draft orders can be changed freely until they are confirmed." />
      <OrderBuilder {...data} currency={ws.organization.currency} today={todayIn(ws.organization.timezone)}
        canPay={ws.can("payments.record")} canCreateCustomer={ws.can("customers.write")} allowNegative={Boolean(ws.business?.allow_negative_stock)}
        initial={{
          id: o.id, customer_id: o.customer_id, channel: o.channel, order_date: o.order_date, expected_delivery_date: o.expected_delivery_date,
          discount_amount: Number(o.discount_amount), delivery_fee: Number(o.delivery_fee), notes: o.notes, delivery_address: o.delivery_address,
          items: o.order_items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity, unit_price: Number(i.unit_price), discount_amount: Number(i.discount_amount) })),
        }} />
    </div>
  );
}
