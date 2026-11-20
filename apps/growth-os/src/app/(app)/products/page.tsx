import Link from "next/link";
import { ImageIcon, Package, Plus } from "lucide-react";
import { Badge, Button, Card, EmptyState, MobileList, PageHeader, TBody, THead, TR, Table, formatMoney } from "@platform/ui";
import { requirePermission } from "@platform/auth";
import { getServerClient } from "@platform/database/server";
import { toAppError } from "@platform/database";
import { ListToolbar } from "@/components/list-toolbar";
import { PAGE_SIZE, Pagination, pageFrom, sanitizeSearch } from "@/components/pagination";
import { signedUrls } from "@/server/storage";

export const metadata = { title: "Products" };

type Row = {
  id: string; name: string; sku: string | null; image_path: string | null; cost_price: number; selling_price: number; has_variants: boolean;
  is_active: boolean; archived_at: string | null; low_stock_threshold: number; product_categories: { name: string } | null;
  product_variants: { quantity_on_hand: number; quantity_reserved: number; is_active: boolean; archived_at: string | null; low_stock_threshold: number | null }[];
};

export default async function Products({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ws = await requirePermission("products.read");
  const cur = ws.organization.currency;
  const page = pageFrom(sp);
  const q = sanitizeSearch(sp.q);
  const supabase = await getServerClient();

  const { data: categories } = await supabase.from("product_categories").select("id, name").eq("organization_id", ws.organization.id).order("name");
  let query = supabase.from("products")
    .select("id, name, sku, image_path, cost_price, selling_price, has_variants, is_active, archived_at, low_stock_threshold, product_categories(name), product_variants(quantity_on_hand, quantity_reserved, is_active, archived_at, low_stock_threshold)", { count: "exact" })
    .eq("organization_id", ws.organization.id);
  query = sp.status === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (sp.status === "inactive") query = query.eq("is_active", false);
  if (sp.status === "active") query = query.eq("is_active", true);
  if (sp.category) query = query.eq("category_id", sp.category);
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,description.ilike.%${q}%`);
  const { data, count, error } = await query.order("name").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw toAppError(error);
  const rows = (data ?? []) as unknown as Row[];
  const urls = await signedUrls(supabase, rows.map((r) => r.image_path));
  const canWrite = ws.can("products.write") && ws.writable;
  const showCost = ws.can("finance.read");

  const stock = (r: Row) => {
    const vs = r.product_variants.filter((v) => v.is_active && !v.archived_at);
    const available = vs.reduce((a, v) => a + v.quantity_on_hand - v.quantity_reserved, 0);
    const low = vs.some((v) => v.quantity_on_hand - v.quantity_reserved <= (v.low_stock_threshold ?? r.low_stock_threshold));
    return { available, low, variants: vs.length };
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Products" description="Your catalogue, prices and stock at a glance."
        actions={canWrite ? <Button asChild><Link href="/products/new"><Plus /> New product</Link></Button> : undefined} />
      <ListToolbar placeholder="Search products or SKU" filters={[
        { name: "category", label: "Category", options: [{ value: "", label: "All categories" }, ...(categories ?? []).map((c) => ({ value: c.id as string, label: c.name as string }))] },
        { name: "status", label: "Status", options: [{ value: "", label: "All products" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "archived", label: "Archived" }] },
      ]} />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={Package} title={q || sp.category || sp.status ? "No products match" : "No products yet"}
            description="Add what you sell — with sizes and colours if you have them — and Growth OS tracks stock as you take orders."
            action={canWrite && !q ? <Button asChild><Link href="/products/new"><Plus /> Add product</Link></Button> : undefined} />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead><tr><th>Product</th><th>Category</th><th className="text-right">Price</th>{showCost && <th className="text-right">Margin</th>}<th className="text-right">Available</th><th>Status</th></tr></THead>
                <TBody>
                  {rows.map((r) => {
                    const s = stock(r);
                    const margin = Number(r.selling_price) > 0 ? ((Number(r.selling_price) - Number(r.cost_price)) / Number(r.selling_price)) * 100 : null;
                    return (
                      <TR key={r.id}>
                        <td>
                          <Link href={`/products/${r.id}`} className="flex items-center gap-3">
                            <Thumb src={r.image_path ? urls[r.image_path] : undefined} />
                            <span>
                              <span className="block font-medium hover:text-primary">{r.name}</span>
                              <span className="block text-xs text-muted-foreground">{r.has_variants ? `${s.variants} variants` : r.sku ?? "—"}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="text-sm text-muted-foreground">{r.product_categories?.name ?? "—"}</td>
                        <td className="text-right tabular">{formatMoney(r.selling_price, cur)}</td>
                        {showCost && <td className="text-right text-sm tabular">{margin === null ? "—" : Number(r.cost_price) === 0 ? <span className="text-muted-foreground">no cost</span> : `${margin.toFixed(0)}%`}</td>}
                        <td className="text-right"><span className={`tabular ${s.low ? "font-medium text-warning" : ""}`}>{s.available}</span></td>
                        <td>{r.archived_at ? <Badge>Archived</Badge> : r.is_active ? (s.low ? <Badge tone="warning">Low stock</Badge> : <Badge tone="success">Active</Badge>) : <Badge>Inactive</Badge>}</td>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
            <MobileList className="md:hidden">
              {rows.map((r) => {
                const s = stock(r);
                return (
                  <li key={r.id}>
                    <Link href={`/products/${r.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-accent">
                      <Thumb src={r.image_path ? urls[r.image_path] : undefined} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{formatMoney(r.selling_price, cur)}{r.has_variants ? ` · ${s.variants} variants` : ""}</p>
                      </div>
                      <Badge tone={s.available <= 0 ? "danger" : s.low ? "warning" : "neutral"}>{s.available} in stock</Badge>
                    </Link>
                  </li>
                );
              })}
            </MobileList>
            <Pagination page={page} total={count ?? 0} basePath="/products" params={{ q: sp.q, category: sp.category, status: sp.status }} />
          </>
        )}
      </Card>
    </div>
  );
}

function Thumb({ src }: { src?: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-subtle">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
    </span>
  );
}
