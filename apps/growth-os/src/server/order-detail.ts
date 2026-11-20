import "server-only";
import { getServerClient } from "@platform/database/server";
import { toAppError, type Order, type OrderItem, type Payment } from "@platform/database";

export type OrderDetail = Order & {
  customers: { id: string; full_name: string; phone: string | null; email: string | null; address: string | null } | null;
  order_items: OrderItem[];
  payments: (Payment & { recorded_by: string | null })[];
  order_returns: { id: string; return_date: string; reason: string | null; restocked: boolean; credit_amount: number; order_return_items: { quantity: number; order_item_id: string }[] }[];
};

export async function loadOrder(orgId: string, id: string): Promise<OrderDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await getServerClient();
  const { data, error } = await supabase.from("orders")
    .select("*, customers(id, full_name, phone, email, address), order_items(*), payments(*), order_returns(*, order_return_items(quantity, order_item_id))")
    .eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (error) throw toAppError(error);
  if (!data) return null;
  const o = data as OrderDetail;
  o.order_items.sort((a, b) => a.id.localeCompare(b.id));
  o.payments.sort((a, b) => a.paid_at.localeCompare(b.paid_at));
  return o;
}
