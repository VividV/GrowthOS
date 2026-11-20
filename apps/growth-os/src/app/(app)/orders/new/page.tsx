import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert, PageHeader } from "@platform/ui";
import { requirePermission } from "@platform/auth";
import { todayIn } from "@/lib/dates";
import { loadBuilderData } from "@/server/order-data";
import { OrderBuilder, type DraftInitial } from "../order-builder";

export const metadata = { title: "New order" };

export default async function NewOrder({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const sp = await searchParams;
  const ws = await requirePermission("orders.write");
  const data = await loadBuilderData(ws.organization.id);
  return (
    <div className="space-y-5">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Orders</Link>
      <PageHeader title="New order" />
      {!ws.writable ? <Alert tone="danger">Your workspace is read-only. Choose a plan to record orders.</Alert> : (
        <OrderBuilder {...data} currency={ws.organization.currency} today={todayIn(ws.organization.timezone)}
          preselectCustomer={sp.customer} canPay={ws.can("payments.record")} canCreateCustomer={ws.can("customers.write")}
          allowNegative={Boolean(ws.business?.allow_negative_stock)} initial={undefined as DraftInitial | undefined} />
      )}
    </div>
  );
}
