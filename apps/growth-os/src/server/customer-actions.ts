"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@platform/database/server";
import { requireWorkspace } from "@platform/auth";
import { capture } from "@platform/analytics";
import { previewCustomerImport, type PreviewRow } from "@/lib/csv";
import { runAction, fail, formToObject, type ActionResult } from "./action";

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const customerSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(160),
  phone: opt(40).refine((v) => v === null || /^[+\d\s\-()]{6,40}$/.test(v), "Enter a valid phone number"),
  email: opt(254).refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid email"),
  location: opt(120),
  address: opt(300),
  notes: opt(2000),
  source: opt(40),
});

async function guard(permission: "customers.write" | "customers.delete" | "customers.import") {
  const ws = await requireWorkspace();
  if (!ws.can(permission)) fail("You don't have permission to do that.", "forbidden");
  if (!ws.writable) fail("Your workspace is read-only. Choose a plan to make changes.", "subscription");
  return ws;
}

export async function createCustomerAction(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ws = await guard("customers.write");
    const input = customerSchema.parse(formToObject(fd));
    const supabase = await getServerClient();
    const { data, error } = await supabase.from("customers")
      .insert({ ...input, organization_id: ws.organization.id, created_by: ws.user.id }).select("id").single();
    if (error) throw error;
    await capture(ws.user.id, "customer_created");
    revalidatePath("/customers");
    return { id: data.id as string };
  }, "Customer added");
}

export async function updateCustomerAction(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await guard("customers.write");
    const id = z.string().uuid().parse(fd.get("id"));
    const input = customerSchema.parse(formToObject(fd));
    const supabase = await getServerClient();
    const { error, count } = await supabase.from("customers").update(input, { count: "exact" }).eq("id", id).eq("organization_id", ws.organization.id);
    if (error) throw error;
    if (!count) fail("Customer not found", "not_found");
    revalidatePath(`/customers/${id}`);
    return null;
  }, "Customer updated");
}

export async function setCustomerArchivedAction(id: string, archived: boolean): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await guard("customers.write");
    const supabase = await getServerClient();
    const { error } = await supabase.from("customers").update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", z.string().uuid().parse(id)).eq("organization_id", ws.organization.id);
    if (error) throw error;
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return null;
  }, archived ? "Customer archived" : "Customer restored");
}

/** Hard delete is only possible for customers with no orders; otherwise archive (keeps financial history intact). */
export async function deleteCustomerAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await guard("customers.delete");
    const supabase = await getServerClient();
    const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("customer_id", id);
    if ((count ?? 0) > 0) fail("This customer has orders, so they can't be deleted. Archive them instead.", "conflict");
    const { error, count: deleted } = await supabase.from("customers").delete({ count: "exact" }).eq("id", id).eq("organization_id", ws.organization.id);
    if (error) throw error;
    if (!deleted) fail("Customer not found or you can't delete it", "not_found");
    revalidatePath("/customers");
    return null;
  }, "Customer deleted");
}

async function existingKeys(orgId: string) {
  const supabase = await getServerClient();
  const { data, error } = await supabase.from("customers").select("phone_normalized, email").eq("organization_id", orgId).limit(20000);
  if (error) throw error;
  return (data ?? []) as { phone_normalized: string | null; email: string | null }[];
}

export async function previewImportAction(csvText: string): Promise<ActionResult<{ rows: PreviewRow[]; unknownColumns: string[]; tooMany: boolean; remaining: number | null }>> {
  return runAction(async () => {
    const ws = await guard("customers.import");
    if (!ws.entitlements.csv_import?.enabled) fail("CSV import isn't included in your plan.", "subscription");
    if (csvText.length > 2_000_000) fail("File is too large (max 2 MB).");
    const preview = previewCustomerImport(csvText, await existingKeys(ws.organization.id));
    const limit = ws.entitlements.max_customers?.limit ?? null;
    let remaining: number | null = null;
    if (limit !== null) {
      const supabase = await getServerClient();
      const { count } = await supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", ws.organization.id).is("archived_at", null);
      remaining = Math.max(0, limit - (count ?? 0));
    }
    return { ...preview, remaining };
  });
}

/** Re-validates and de-duplicates on the server — the client preview is never trusted. */
export async function commitImportAction(csvText: string): Promise<ActionResult<{ imported: number; skipped: number }>> {
  return runAction(async () => {
    const ws = await guard("customers.import");
    if (!ws.entitlements.csv_import?.enabled) fail("CSV import isn't included in your plan.", "subscription");
    const { rows } = previewCustomerImport(csvText, await existingKeys(ws.organization.id));
    const ok = rows.filter((r) => r.status === "ok" && r.data);
    const limit = ws.entitlements.max_customers?.limit ?? null;
    const supabase = await getServerClient();
    let allowed = ok;
    if (limit !== null) {
      const { count } = await supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", ws.organization.id).is("archived_at", null);
      allowed = ok.slice(0, Math.max(0, limit - (count ?? 0)));
      if (allowed.length === 0 && ok.length > 0) fail("Your plan's customer limit has been reached. Upgrade to import more.", "subscription");
    }
    for (let i = 0; i < allowed.length; i += 500) {
      const batch = allowed.slice(i, i + 500).map((r) => ({ ...r.data!, organization_id: ws.organization.id, created_by: ws.user.id }));
      const { error } = await supabase.from("customers").insert(batch);
      if (error) throw error;
    }
    await capture(ws.user.id, "customers_imported", { count: allowed.length });
    revalidatePath("/customers");
    return { imported: allowed.length, skipped: rows.length - allowed.length };
  });
}
