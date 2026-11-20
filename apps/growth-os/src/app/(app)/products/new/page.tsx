import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert, PageHeader } from "@platform/ui";
import { requirePermission } from "@platform/auth";
import { getServerClient } from "@platform/database/server";
import { ProductForm } from "../product-form";

export const metadata = { title: "New product" };

export default async function NewProduct() {
  const ws = await requirePermission("products.write");
  const supabase = await getServerClient();
  const { data } = await supabase.from("product_categories").select("id, name").eq("organization_id", ws.organization.id).order("name");
  return (
    <div className="space-y-5">
      <Link href="/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Products</Link>
      <PageHeader title="New product" />
      {ws.writable ? <ProductForm categories={(data ?? []) as { id: string; name: string }[]} /> : <Alert tone="danger">Your workspace is read-only. Choose a plan to add products.</Alert>}
    </div>
  );
}
