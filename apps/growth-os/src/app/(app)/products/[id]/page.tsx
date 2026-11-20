import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, StatCard, TBody, THead, TR, Table, formatDateTime, formatMoney } from "@platform/ui";
import { requirePermission } from "@platform/auth";
import { getServerClient } from "@platform/database/server";
import { toAppError } from "@platform/database";
import { ConfirmAction } from "@/components/confirm-action";
import { StockAdjustDialog } from "@/components/stock-adjust-dialog";
import { setProductArchivedAction } from "@/server/product-actions";
import { signedUrls } from "@/server/storage";
import { ProductForm, type ProductInitial } from "../product-form";
import { AddVariantDialog, EditVariantDialog } from "./variant-editor";

export const metadata = { title: "Product" };

const MOVEMENT_LABELS: Record<string, string> = {
  opening: "Opening stock", purchase: "Restock", adjustment: "Count correction", damage: "Damaged / lost", sale: "Sold",
  return: "Customer return", reservation: "Reserved for order", reservation_release: "Reservation released", cancellation_restock: "Cancelled order restocked",
};

export default async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ws = await requirePermission("products.read");
  const cur = ws.organization.currency;
  const supabase = await getServerClient();
  const { data: product, error } = await supabase.from("products").select("*").eq("id", id).eq("organization_id", ws.organization.id).maybeSingle();
  if (error) throw toAppError(error);
  if (!product) notFound();

  const [{ data: variants }, { data: movements }, { data: categories }] = await Promise.all([
    supabase.from("variant_stock").select("*").eq("product_id", id).order("sku"),
    supabase.from("inventory_movements").select("*, product_variants(name, sku), orders(order_number)").eq("product_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("product_categories").select("id, name").eq("organization_id", ws.organization.id).order("name"),
  ]);
  const { data: rawVariants } = await supabase.from("product_variants").select("id, name, sku, cost_price, selling_price, low_stock_threshold, is_active, archived_at").eq("product_id", id);
  const urls = await signedUrls(supabase, [product.image_path as string | null]);
  type VS = { variant_id: string; variant_name: string; sku: string; quantity_on_hand: number; quantity_reserved: number; quantity_available: number; low_stock_threshold: number; selling_price: number; cost_price: number; is_sellable: boolean; is_default: boolean };
  const vs = ((variants ?? []) as VS[]).filter((v) => !(product.has_variants && v.is_default && !v.is_sellable));
  const raw = Object.fromEntries((rawVariants ?? []).map((v) => [v.id, v]));
  const totals = vs.reduce((a, v) => ({ onHand: a.onHand + v.quantity_on_hand, reserved: a.reserved + v.quantity_reserved, value: a.value + v.quantity_on_hand * Number(v.cost_price) }), { onHand: 0, reserved: 0, value: 0 });
  const canWrite = ws.can("products.write") && ws.writable;
  const canAdjust = ws.can("inventory.adjust") && ws.writable;
  const archived = Boolean(product.archived_at);

  return (
    <div className="space-y-5">
      <Link href="/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Products</Link>
      <PageHeader title={product.name as string} description={archived ? "Archived" : product.is_active ? "Available for sale" : "Not available for sale"}
        actions={canWrite ? (
          <ConfirmAction label={archived ? "Restore" : "Archive"} variant="outline" icon={archived ? <ArchiveRestore /> : <Archive />}
            title={archived ? "Restore this product?" : "Archive this product?"} description={archived ? undefined : "It will no longer appear in new orders. Order history is kept."}
            run={async () => { "use server"; return setProductArchivedAction(id, !archived); }} />
        ) : undefined} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="On hand" value={totals.onHand} />
        <StatCard label="Reserved for orders" value={totals.reserved} />
        <StatCard label="Available to sell" value={totals.onHand - totals.reserved} />
        {ws.can("finance.read") && <StatCard label="Stock value (at cost)" value={formatMoney(totals.value, cur)} />}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{product.has_variants ? "Variants & stock" : "Stock"}</CardTitle>
          {canWrite && <AddVariantDialog productId={id} />}
        </CardHeader>
        <CardContent className="p-0 sm:p-0 pt-3">
          <Table>
            <THead><tr><th>Variant</th><th>SKU</th><th className="text-right">Price</th><th className="text-right">On hand</th><th className="text-right">Reserved</th><th className="text-right">Available</th><th /></tr></THead>
            <TBody>
              {vs.map((v) => (
                <TR key={v.variant_id} className={!v.is_sellable ? "opacity-60" : ""}>
                  <td className="font-medium">{product.has_variants ? v.variant_name : "Default"}{!v.is_sellable && <Badge className="ml-2">Inactive</Badge>}</td>
                  <td className="font-mono text-xs">{v.sku}</td>
                  <td className="text-right tabular">{formatMoney(v.selling_price, cur)}</td>
                  <td className="text-right tabular">{v.quantity_on_hand}</td>
                  <td className="text-right tabular text-muted-foreground">{v.quantity_reserved}</td>
                  <td className="text-right"><Badge tone={v.quantity_available <= 0 ? "danger" : v.quantity_available <= v.low_stock_threshold ? "warning" : "success"}>{v.quantity_available}</Badge></td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      {canAdjust && <StockAdjustDialog variantId={v.variant_id} onHand={v.quantity_on_hand} label={`${product.name}${product.has_variants ? ` · ${v.variant_name}` : ""}`} />}
                      {canWrite && raw[v.variant_id] && <EditVariantDialog variant={raw[v.variant_id] as never} />}
                    </div>
                  </td>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {canWrite ? (
        <ProductForm categories={(categories ?? []) as { id: string; name: string }[]} currency={cur === "NGN" ? "₦" : cur}
          product={{ ...(product as unknown as ProductInitial), image_url: product.image_path ? urls[product.image_path as string] : null }} />
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Inventory history</CardTitle></CardHeader>
        <CardContent className="p-0 sm:p-0 pt-3">
          {(movements ?? []).length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">No stock movements yet.</p> : (
            <Table>
              <THead><tr><th>When</th><th>Movement</th>{product.has_variants && <th>Variant</th>}<th className="text-right">Change</th><th className="text-right">On hand after</th><th>Note</th></tr></THead>
              <TBody>
                {(movements ?? []).map((m) => (
                  <TR key={m.id as string}>
                    <td className="whitespace-nowrap text-sm">{formatDateTime(m.created_at as string, ws.organization.timezone)}</td>
                    <td className="text-sm">{MOVEMENT_LABELS[m.movement_type as string] ?? m.movement_type}</td>
                    {product.has_variants && <td className="text-sm">{(m.product_variants as { name: string } | null)?.name}</td>}
                    <td className={`text-right tabular ${Number(m.quantity_change) > 0 ? "text-success" : Number(m.quantity_change) < 0 ? "text-danger" : "text-muted-foreground"}`}>
                      {Number(m.quantity_change) > 0 ? "+" : ""}{m.quantity_change as number}{Number(m.reserved_change) !== 0 && <span className="ml-1 text-xs text-muted-foreground">({Number(m.reserved_change) > 0 ? "+" : ""}{m.reserved_change as number} reserved)</span>}
                    </td>
                    <td className="text-right tabular">{m.quantity_after as number}</td>
                    <td className="text-sm text-muted-foreground">
                      {m.order_id ? <Link href={`/orders/${m.order_id}`} className="text-primary">{(m.orders as { order_number: string } | null)?.order_number}</Link> : (m.reason as string) ?? ""}
                    </td>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
