import Link from "next/link";
import { Download, Upload, Users } from "lucide-react";
import {
  Button, Card, EmptyState, MobileList, PageHeader, TBody, THead, TR, Table, formatDate, formatMoney,
} from "@platform/ui";
import { requirePermission } from "@platform/auth";
import { getServerClient } from "@platform/database/server";
import { toAppError, type CustomerSummary } from "@platform/database";
import { ListToolbar } from "@/components/list-toolbar";
import { PAGE_SIZE, Pagination, pageFrom, sanitizeSearch } from "@/components/pagination";
import { CustomerDialog } from "./customer-form";

export const metadata = { title: "Customers" };

export default async function Customers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ws = await requirePermission("customers.read");
  const cur = ws.organization.currency;
  const page = pageFrom(sp);
  const q = sanitizeSearch(sp.q);
  const filter = sp.filter ?? "";
  const sort = sp.sort ?? "recent";

  const supabase = await getServerClient();
  let query = supabase.from("customer_summaries").select("*", { count: "exact" }).eq("organization_id", ws.organization.id);
  query = filter === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,customer_code.ilike.%${q}%,location.ilike.%${q}%`);
  if (filter === "owing") query = query.gt("outstanding_balance", 0);
  if (filter === "never") query = query.eq("total_orders", 0);
  if (filter === "repeat") query = query.gte("total_orders", 2);
  query = sort === "spent" ? query.order("total_spent", { ascending: false })
    : sort === "owing" ? query.order("outstanding_balance", { ascending: false })
    : sort === "name" ? query.order("full_name")
    : sort === "last" ? query.order("last_purchase_date", { ascending: false, nullsFirst: false })
    : query.order("created_at", { ascending: false });
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw toAppError(error);
  const rows = (data ?? []) as CustomerSummary[];

  const canWrite = ws.can("customers.write") && ws.writable;
  const canExport = ws.can("data.export") && ws.entitlements.csv_export?.enabled;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        description="Everyone who has bought from you or asked about your products."
        actions={
          <>
            {ws.can("customers.import") && ws.writable && <Button asChild variant="outline"><Link href="/customers/import"><Upload /> Import</Link></Button>}
            {ws.can("data.export") && (canExport
              ? <Button asChild variant="outline"><a href="/api/export/customers"><Download /> Export</a></Button>
              : <Button variant="outline" disabled title="CSV export is available on Growth and Pro plans"><Download /> Export</Button>)}
            {canWrite && <CustomerDialog defaultOpen={sp.new === "1"} />}
          </>
        }
      />
      <ListToolbar
        placeholder="Search name, phone, email or code"
        filters={[
          { name: "filter", label: "Filter", options: [
            { value: "", label: "All customers" }, { value: "owing", label: "Owing money" }, { value: "repeat", label: "Repeat buyers" },
            { value: "never", label: "No orders yet" }, { value: "archived", label: "Archived" },
          ] },
          { name: "sort", label: "Sort", options: [
            { value: "recent", label: "Newest first" }, { value: "spent", label: "Top spenders" }, { value: "owing", label: "Highest balance" },
            { value: "last", label: "Recent buyers" }, { value: "name", label: "Name A–Z" },
          ] },
        ]}
      />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={Users} title={q || filter ? "No customers match" : "No customers yet"}
            description={q || filter ? "Try a different search or filter." : "Add customers one by one or import a spreadsheet from your phone contacts or notebook."}
            action={!q && !filter && canWrite ? <CustomerDialog /> : undefined} />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead><tr><th>Customer</th><th>Contact</th><th className="text-right">Orders</th><th className="text-right">Total spent</th><th className="text-right">Balance</th><th>Last purchase</th></tr></THead>
                <TBody>
                  {rows.map((c) => (
                    <TR key={c.id}>
                      <td>
                        <Link href={`/customers/${c.id}`} className="font-medium hover:text-primary">{c.full_name}</Link>
                        <div className="text-xs text-muted-foreground">{c.customer_code}{c.location ? ` · ${c.location}` : ""}</div>
                      </td>
                      <td className="text-sm"><div>{c.phone ?? "—"}</div><div className="text-xs text-muted-foreground">{c.email}</div></td>
                      <td className="text-right tabular">{c.total_orders}</td>
                      <td className="text-right tabular">{formatMoney(c.total_spent, cur)}</td>
                      <td className="text-right tabular">{Number(c.outstanding_balance) > 0 ? <span className="font-medium text-warning">{formatMoney(c.outstanding_balance, cur)}</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="text-sm text-muted-foreground">{formatDate(c.last_purchase_date)}</td>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <MobileList className="md:hidden">
              {rows.map((c) => (
                <li key={c.id}>
                  <Link href={`/customers/${c.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-accent">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.phone ?? c.email ?? c.customer_code} · {c.total_orders} order{c.total_orders === 1 ? "" : "s"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm tabular">{formatMoney(c.total_spent, cur)}</p>
                      {Number(c.outstanding_balance) > 0 && <p className="text-xs font-medium text-warning tabular">owes {formatMoney(c.outstanding_balance, cur)}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </MobileList>
            <Pagination page={page} total={count ?? 0} basePath="/customers" params={{ q: sp.q, filter: sp.filter, sort: sp.sort }} />
          </>
        )}
      </Card>
    </div>
  );
}
