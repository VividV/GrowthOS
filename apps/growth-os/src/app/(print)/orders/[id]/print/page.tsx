import { notFound } from "next/navigation";
import { formatDate, formatMoney } from "@platform/ui";
import { requirePermission } from "@platform/auth";
import { getServerClient } from "@platform/database/server";
import { loadOrder } from "@/server/order-detail";
import { signedUrls } from "@/server/storage";
import { PrintButton } from "./print-button";

export const metadata = { title: "Order summary" };

export default async function PrintOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await requirePermission("orders.read");
  const o = await loadOrder(ws.organization.id, id);
  if (!o) notFound();
  const supabase = await getServerClient();
  const { data: bp } = await supabase.from("business_profiles").select("business_email, phone, address, logo_path").eq("organization_id", ws.organization.id).maybeSingle();
  const logo = bp?.logo_path ? (await signedUrls(supabase, [bp.logo_path as string]))[bp.logo_path as string] : null;
  const cur = ws.organization.currency;
  const n = Number;

  return (
    <div className="mx-auto max-w-2xl bg-white p-6 text-sm text-slate-900 sm:p-10 print:p-0">
      <div className="mb-6 flex justify-end no-print"><PrintButton /></div>
      <header className="flex items-start justify-between gap-6 border-b pb-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt="" className="h-12 w-12 rounded-lg object-cover" />}
          <div>
            <p className="text-lg font-semibold">{ws.organization.name}</p>
            <p className="text-xs text-slate-500">{[bp?.address, bp?.phone, bp?.business_email].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">{o.status === "draft" ? "Quotation" : "Order summary"}</p>
          <p className="text-lg font-semibold">{o.order_number}</p>
          <p className="text-xs text-slate-500">{formatDate(o.order_date)}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-6 py-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Customer</p>
          <p className="mt-1 font-medium">{o.customers?.full_name ?? "Walk-in customer"}</p>
          {o.customers?.phone && <p>{o.customers.phone}</p>}
          {o.delivery_address && <p className="text-slate-600">{o.delivery_address}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
          <p className="mt-1 font-medium capitalize">{o.status} · {o.payment_status.replace("_", " ")}</p>
          {o.expected_delivery_date && <p className="text-slate-600">Delivery by {formatDate(o.expected_delivery_date)}</p>}
        </div>
      </section>

      <table className="w-full">
        <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Amount</th></tr></thead>
        <tbody>
          {o.order_items.map((i) => (
            <tr key={i.id} className="border-b">
              <td className="py-2">{i.product_name}{i.variant_name ? <span className="text-slate-500"> · {i.variant_name}</span> : null}</td>
              <td className="py-2 text-right tabular">{i.quantity}</td>
              <td className="py-2 text-right tabular">{formatMoney(i.unit_price, cur)}</td>
              <td className="py-2 text-right tabular">{formatMoney(i.line_total, cur)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto mt-4 w-64 space-y-1">
        <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular">{formatMoney(o.subtotal, cur)}</dd></div>
        {n(o.discount_amount) > 0 && <div className="flex justify-between"><dt className="text-slate-500">Discount</dt><dd className="tabular">−{formatMoney(o.discount_amount, cur)}</dd></div>}
        {n(o.delivery_fee) > 0 && <div className="flex justify-between"><dt className="text-slate-500">Delivery</dt><dd className="tabular">{formatMoney(o.delivery_fee, cur)}</dd></div>}
        <div className="flex justify-between border-t pt-1 font-semibold"><dt>Total</dt><dd className="tabular">{formatMoney(o.total, cur)}</dd></div>
        {n(o.returns_total) > 0 && <div className="flex justify-between"><dt className="text-slate-500">Returns</dt><dd className="tabular">−{formatMoney(o.returns_total, cur)}</dd></div>}
        {o.status !== "draft" && <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd className="tabular">{formatMoney(o.amount_paid, cur)}</dd></div>}
        {o.status !== "draft" && o.status !== "cancelled" && <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd className="tabular">{formatMoney(Math.max(0, n(o.balance_due)), cur)}</dd></div>}
      </dl>

      {o.notes && <p className="mt-8 whitespace-pre-wrap border-t pt-4 text-slate-600">{o.notes}</p>}
      <p className="mt-10 text-center text-xs text-slate-400">Thank you for your business · Generated with Growth OS</p>
    </div>
  );
}
