import "server-only";
import { getServerClient } from "@platform/database/server";
import type { CustomerOption, SellableVariant } from "@/app/(app)/orders/order-builder";

export async function loadBuilderData(orgId: string) {
  const supabase = await getServerClient();
  const [{ data: variants }, { data: customers }] = await Promise.all([
    supabase.from("variant_stock").select("variant_id, product_name, variant_name, has_variants, is_default, sku, selling_price, quantity_available")
      .eq("organization_id", orgId).eq("is_sellable", true).order("product_name").limit(2000),
    supabase.from("customers").select("id, full_name, phone, address").eq("organization_id", orgId).is("archived_at", null).order("full_name").limit(3000),
  ]);
  return {
    variants: ((variants ?? []) as (SellableVariant & { is_default: boolean })[])
      .filter((v) => !(v.has_variants && v.is_default))
      .map((v) => ({ ...v, selling_price: Number(v.selling_price) })),
    customers: (customers ?? []) as CustomerOption[],
  };
}

