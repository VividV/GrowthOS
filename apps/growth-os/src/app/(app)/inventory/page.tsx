import Link from "next/link";
import { Boxes, History } from "lucide-react";
import { Badge, Card, EmptyState, MobileList, PageHeader, StatCard, TBody, THead, TR, Table, cn, formatDateTime, formatMoney } from "@platform/ui";
import { requirePermission } from "@platform/auth";
import { getServerClient } from "@platform/database/server";
import { toAppError, type VariantStock } from "@platform/database";
import { ListToolbar } from "@/components/list-toolbar";
import { sanitizeSearch } from "@/components/pagination";
import { StockAdjustDialog } from "@/components/stock-adjust-dialog";

export const metadata = { title: "Inventory" };

const LABELS: Record<string, string> = {
  opening: "Opening", purchase: "Restock", adjustment: "Correction", damage: "Damaged", sale: "Sold", return: "Returned",
  reservation: "Reserved", reservation_release: "Released", cancellation_restock: "Cancelled → restock",
};

export default async function Inventory({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ws = await requirePermission("products.read");
  const supabase = await getServerClient();
  const q = sanitizeSearch(sp.q);
  const tab = sp.tab === "history" ? "history" : "stock";

  let query = supabase.from("variant_stock").select("*").eq("organization_id", ws.organization.id).eq("is_sellable", true);
  if (q) query = query.or(`product_name.ilike.%${q}%,variant_name.ilike.%${q}%,sku.ilike.%${q}%`);
  const [{ data, error }, { data: moves }] = await Promise.all([
    query.order("product_name").order("sku").limit(1000),
    tab === "history"
      ? supabase.from("inventory_movements").select("*, products(name), product_variants(name, sku), orders(order_number)").eq("organization_id", ws.organization.id).order("created_at", { ascending: false }).limit(150)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  if (error) throw toAppError(error);
  let rows = ((data ?? []) as VariantStock[]).filter((v) => !(v.has_variants && v.is_default));
  const all = rows;
  if (sp.filter === "low") rows = rows.filter((r) => r.quantity_available <= r.low_stock_threshold);
  if (sp.filter === "out") rows = rows.filter((r) => r.quantity_available <= 0);
  const canAdjust = ws.can("inventory.adjust") && ws.writable;
  const showValue = ws.can("finance.read");
  const value = all.reduce((a, r) => a + r.quantity_on_hand * Number(r.cost_price), 0);
  const label = (r: VariantStock) => (r.has_variants ? `${r.product_name} · ${r.variant_name}` : r.product_name);

  return (
    <div className="space-y-5">
      <PageHeader title="Inventory" description="Every stock change is recorded — restocks, sales, returns and corrections." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="SKUs in stock" value={all.filter((r) => r.quantity_on_hand > 0).length} />
        <StatCard label="Units on hand" value={all.reduce((a, r) => a + r.quantity_on_hand, 0)} />
        <StatCard label="Low stock" value={all.filter((r) => r.quantity_available <= r.low_stock_threshold && r.quantity_available > 0).length} tone="warning" />
        {showValue ? <StatCard label="Stock value (cost)" value={formatMoney(value, ws.organization.currency)} /> : <StatCard label="Out of stock" value={all.filter((r) => r.quantity_available <= 0).length} tone="danger" />}
      </div>

      <div className="flex gap-1 border-b">
        {[["stock", "Stock levels", Boxes], ["history", "Movement history", History]].map(([k, l, Icon]) => (
          <Link key={k as string} href={k === "stock" ? "/inventory" : "/inventory?tab=history"}
            className={cn("-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium", tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {/* @ts-expect-error icon component from tuple */}
            <Icon className="h-4 w-4" /> {l as string}
          </Link>
        ))}
      </div>

      {tab === "stock" ? (
        <>
          <ListToolbar placeholder="Search product, variant or SKU" filters={[{ name: "filter", label: "Stock filter", options: [
            { value: "", label: "All items" }, { value: "low", label: "Low stock" }, { value: "out", label: "Out of stock" }] }]} />
          <Card className="overflow-hidden">
            {rows.length === 0 ? <EmptyState icon={Boxes} title={sp.filter ? "Nothing low on stock 🎉" : "No stock items"} description={sp.filter ? undefined : "Add products to start tracking stock."} /> : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <THead><tr><th>Item</th><th>SKU</th><th className="text-right">On hand</th><th className="text-right">Reserved</th><th className="text-right">Available</th><th className="text-right">Alert at</th><th /></tr></THead>
                    <TBody>
                      {rows.map((r) => (
                        <TR key={r.variant_id}>
                          <td><Link href={`/products/${r.product_id}`} className="font-medium hover:text-primary">{label(r)}</Link></td>
                          <td className="font-mono text-xs">{r.sku}</td>
                          <td className="text-right tabular">{r.quantity_on_hand}</td>
                          <td className="text-right tabular text-muted-foreground">{r.quantity_reserved}</td>
                          <td className="text-right"><Badge tone={r.quantity_available <= 0 ? "danger" : r.quantity_available <= r.low_stock_threshold ? "warning" : "success"}>{r.quantity_available}</Badge></td>
                          <td className="text-right text-sm text-muted-foreground tabular">{r.low_stock_threshold}</td>
                          <td className="text-right">{canAdjust && <StockAdjustDialog variantId={r.variant_id} onHand={r.quantity_on_hand} label={label(r)} />}</td>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
                <MobileList className="md:hidden">
                  {rows.map((r) => (
                    <li key={r.variant_id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{label(r)}</p>
                        <p className="text-xs text-muted-foreground">{r.sku} · {r.quantity_on_hand} on hand{r.quantity_reserved ? `, ${r.quantity_reserved} reserved` : ""}</p>
                      </div>
                      <Badge tone={r.quantity_available <= 0 ? "danger" : r.quantity_available <= r.low_stock_threshold ? "warning" : "success"}>{r.quantity_available}</Badge>
                      {canAdjust && <StockAdjustDialog variantId={r.variant_id} onHand={r.quantity_on_hand} label={label(r)} />}
                    </li>
                  ))}
                </MobileList>
              </>
            )}
          </Card>
        </>
      ) : (
        <Card className="overflow-hidden">
          {(moves ?? []).length === 0 ? <EmptyState icon={History} title="No stock movements yet" /> : (
            <Table>
              <THead><tr><th>When</th><th>Item</th><th>Type</th><th className="text-right">Change</th><th className="text-right">After</th><th>Reference</th></tr></THead>
              <TBody>
                {(moves ?? []).map((m) => {
                  const p = m.products as { name: string } | null; const v = m.product_variants as { name: string; sku: string } | null;
                  const qc = Number(m.quantity_change); const rc = Number(m.reserved_change);
                  return (
                    <TR key={m.id as string}>
                      <td className="whitespace-nowrap text-sm">{formatDateTime(m.created_at as string, ws.organization.timezone)}</td>
                      <td className="text-sm">{p?.name}{v && v.name !== "Default" ? <span className="text-muted-foreground"> · {v.name}</span> : null}</td>
                      <td className="text-sm">{LABELS[m.movement_type as string] ?? (m.movement_type as string)}</td>
                      <td className={cn("text-right tabular", qc > 0 && "text-success", qc < 0 && "text-danger")}>{qc > 0 ? "+" : ""}{qc}{rc !== 0 && <span className="ml-1 text-xs text-muted-foreground">({rc > 0 ? "+" : ""}{rc} res.)</span>}</td>
                      <td className="text-right tabular">{m.quantity_after as number}</td>
                      <td className="text-sm text-muted-foreground">{m.order_id ? <Link className="text-primary" href={`/orders/${m.order_id}`}>{(m.orders as { order_number: string } | null)?.order_number}</Link> : (m.reason as string) ?? ""}</td>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
