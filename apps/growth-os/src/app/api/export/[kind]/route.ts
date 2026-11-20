import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@platform/auth";
import { getServerClient } from "@platform/database/server";
import { toCsv } from "@/lib/csv";
import { addDays, todayIn } from "@/lib/dates";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const isDate = (s: string | null) => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));

/**
 * CSV exports. Enforced server-side: data.export permission AND csv_export plan
 * entitlement. Data is read with the user's own client, so RLS still applies.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const ws = await requireWorkspace();
  if (!ws.can("data.export")) return NextResponse.json({ error: "You don't have permission to export data." }, { status: 403 });
  if (!ws.entitlements.csv_export?.enabled) return NextResponse.json({ error: "CSV export is available on the Growth and Pro plans." }, { status: 402 });
  if (!(await rateLimit(`export:${ws.user.id}`, 20, 3600))) return NextResponse.json({ error: "Too many exports. Try again later." }, { status: 429 });

  const supabase = await getServerClient();
  const org = ws.organization.id;
  let csv: string;

  if (kind === "customers") {
    const { data, error } = await supabase.from("customer_summaries").select("*").eq("organization_id", org).order("created_at").limit(50000);
    if (error) return NextResponse.json({ error: "Export failed" }, { status: 500 });
    csv = toCsv(
      ["Customer ID", "Name", "Phone", "Email", "Location", "Address", "Source", "Created", "Total orders", "Total spent", "Outstanding balance", "Last purchase", "Notes", "Archived"],
      (data ?? []).map((c) => [c.customer_code, c.full_name, c.phone, c.email, c.location, c.address, c.source, String(c.created_at).slice(0, 10),
        c.total_orders, c.total_spent, c.outstanding_balance, c.last_purchase_date, c.notes, c.archived_at ? "yes" : "no"]),
    );
  } else if (kind === "orders") {
    const { data, error } = await supabase.from("orders").select("*, customers(full_name, phone)").eq("organization_id", org).order("order_date").limit(50000);
    if (error) return NextResponse.json({ error: "Export failed" }, { status: 500 });
    csv = toCsv(
      ["Order number", "Date", "Customer", "Phone", "Status", "Payment status", "Channel", "Subtotal", "Discount", "Delivery fee", "Total", "Returns", "Paid", "Balance", "Expected delivery"],
      (data ?? []).map((o) => {
        const c = o.customers as { full_name: string; phone: string | null } | null;
        return [o.order_number, o.order_date, c?.full_name ?? "Walk-in", c?.phone, o.status, o.payment_status, o.channel, o.subtotal, o.discount_amount, o.delivery_fee,
          o.total, o.returns_total, o.amount_paid, o.balance_due, o.expected_delivery_date];
      }),
    );
  } else if (kind === "finance") {
    if (!ws.can("finance.read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    if (!isDate(from) || !isDate(to)) return NextResponse.json({ error: "from and to dates are required" }, { status: 400 });
    const [exp, inc, pay] = await Promise.all([
      supabase.from("expenses").select("expense_date, description, vendor, amount, payment_method, reference, voided_at, expense_categories(name)").eq("organization_id", org).gte("expense_date", from!).lte("expense_date", to!).order("expense_date"),
      supabase.from("income_records").select("income_date, description, source, amount, voided_at").eq("organization_id", org).gte("income_date", from!).lte("income_date", to!).order("income_date"),
      supabase.from("payments").select("paid_at, kind, amount, method, reference, voided_at, orders(order_number)").eq("organization_id", org).gte("paid_at", `${addDays(from!, -1)}T00:00:00Z`).lte("paid_at", `${addDays(to!, 1)}T23:59:59Z`).order("paid_at"),
    ]);
    const rows: (string | number | null)[][] = [
      ...(exp.data ?? []).filter((e) => !e.voided_at).map((e) => [e.expense_date, "Expense", (e.expense_categories as unknown as { name: string } | null)?.name ?? "", e.description, e.vendor, -Number(e.amount), e.payment_method, e.reference]),
      ...(inc.data ?? []).filter((e) => !e.voided_at).map((e) => [e.income_date, "Other income", e.source ?? "", e.description, "", Number(e.amount), "", ""]),
      ...(pay.data ?? []).map((p) => ({ ...p, day: todayIn(ws.organization.timezone, new Date(p.paid_at as string)) }))
        .filter((p) => !p.voided_at && p.day >= from! && p.day <= to!).map((p) => [p.day, p.kind === "refund" ? "Refund" : "Order payment", "Sales",
        (p.orders as unknown as { order_number: string } | null)?.order_number ?? "", "", p.kind === "refund" ? -Number(p.amount) : Number(p.amount), p.method, p.reference]),
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    csv = toCsv(["Date", "Type", "Category", "Description", "Party", "Amount", "Method", "Reference"], rows);
  } else {
    return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  }

  const filename = `${ws.organization.slug}-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}
