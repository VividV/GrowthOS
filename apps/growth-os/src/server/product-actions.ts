"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@platform/database/server";
import { requireWorkspace } from "@platform/auth";
import { capture } from "@platform/analytics";
import { runAction, fail, type ActionResult } from "./action";
import { uploadImage } from "./storage";

const money = z.union([z.string(), z.number()]).transform((v) => (v === "" || v === null ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v < 1e11), "Enter a valid amount")
  .refine((v) => v === null || Math.round(v * 100) === v * 100 || Math.abs(Math.round(v * 100) - v * 100) < 1e-6, "At most 2 decimal places");
const intNonNeg = z.union([z.string(), z.number()]).transform((v) => (v === "" ? 0 : Number(v))).refine((v) => Number.isInteger(v) && v >= 0 && v < 1e7, "Enter a whole number");
const sku = z.string().trim().max(60).regex(/^[A-Za-z0-9._\-/]*$/, "Use letters, numbers, - _ . /").optional().transform((v) => v || null);

const variantSchema = z.object({
  name: z.string().trim().max(120).optional(),
  options: z.record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(60)).default({}),
  sku,
  cost_price: money.optional(),
  selling_price: money.optional(),
  opening_quantity: intNonNeg.optional(),
});

const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(160),
  sku,
  description: z.string().trim().max(3000).optional().transform((v) => v || null),
  category_id: z.string().optional().transform((v) => v || null),
  cost_price: money.default(0),
  selling_price: money.refine((v) => v !== null, "Selling price is required"),
  low_stock_threshold: intNonNeg.default(5),
  opening_quantity: intNonNeg.default(0),
  is_active: z.boolean().default(true),
  variants: z.array(variantSchema).max(100, "At most 100 variants").default([]),
});

async function guard(permission: "products.write" | "inventory.adjust" | "products.delete" = "products.write") {
  const ws = await requireWorkspace();
  if (!ws.can(permission)) fail("You don't have permission to do that.", "forbidden");
  if (!ws.writable) fail("Your workspace is read-only. Choose a plan to make changes.", "subscription");
  return ws;
}

export async function createProductAction(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ws = await guard();
    const input = productSchema.parse(JSON.parse(String(fd.get("payload") ?? "{}")));
    const skus = input.variants.map((v) => v.sku?.toLowerCase()).filter(Boolean);
    if (new Set(skus).size !== skus.length) fail("Each variant needs a different SKU.");
    const supabase = await getServerClient();
    let image_path: string | null = null;
    const image = fd.get("image");
    if (image instanceof File && image.size > 0) image_path = await uploadImage(supabase, ws.organization.id, "products", image);
    const { data, error } = await supabase.rpc("create_product", { p_org: ws.organization.id, p: { ...input, image_path } });
    if (error) throw error;
    await capture(ws.user.id, "product_created", { variants: input.variants.length });
    revalidatePath("/products");
    return { id: data as string };
  }, "Product created");
}

const updateSchema = productSchema.pick({ name: true, sku: true, description: true, category_id: true, cost_price: true, selling_price: true, low_stock_threshold: true, is_active: true });

export async function updateProductAction(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ws = await guard();
    const id = z.string().uuid().parse(fd.get("id"));
    const input = updateSchema.parse(JSON.parse(String(fd.get("payload") ?? "{}")));
    const supabase = await getServerClient();
    const patch: Record<string, unknown> = { ...input };
    const image = fd.get("image");
    if (image instanceof File && image.size > 0) patch.image_path = await uploadImage(supabase, ws.organization.id, "products", image);
    const { error, count } = await supabase.from("products").update(patch, { count: "exact" }).eq("id", id).eq("organization_id", ws.organization.id);
    if (error) throw error;
    if (!count) fail("Product not found", "not_found");
    // keep the hidden default variant's SKU in step with the product SKU
    if (input.sku) await supabase.from("product_variants").update({ sku: input.sku }).eq("product_id", id).eq("is_default", true);
    revalidatePath(`/products/${id}`);
    revalidatePath("/products");
    return { id };
  }, "Product saved");
}

export async function addVariantAction(productId: string, raw: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    await guard();
    const v = variantSchema.parse(raw);
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("add_product_variant", { p_product: z.string().uuid().parse(productId), v });
    if (error) throw error;
    revalidatePath(`/products/${productId}`);
    return null;
  }, "Variant added");
}

const variantUpdate = z.object({
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1, "SKU is required").max(60),
  cost_price: money.optional(),
  selling_price: money.optional(),
  low_stock_threshold: z.union([z.string(), z.number()]).optional().transform((v) => (v === "" || v === undefined ? null : Number(v))),
  is_active: z.boolean(),
});

export async function updateVariantAction(variantId: string, raw: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await guard();
    const input = variantUpdate.parse(raw);
    const supabase = await getServerClient();
    const { data, error } = await supabase.from("product_variants").update(input).eq("id", z.string().uuid().parse(variantId))
      .eq("organization_id", ws.organization.id).select("product_id").single();
    if (error) throw error;
    revalidatePath(`/products/${data.product_id}`);
    return null;
  }, "Variant saved");
}

export async function setProductArchivedAction(id: string, archived: boolean): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await guard();
    const supabase = await getServerClient();
    const { error } = await supabase.from("products").update({ archived_at: archived ? new Date().toISOString() : null, is_active: !archived })
      .eq("id", z.string().uuid().parse(id)).eq("organization_id", ws.organization.id);
    if (error) throw error;
    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    return null;
  }, archived ? "Product archived" : "Product restored");
}

export async function createCategoryAction(name: string): Promise<ActionResult<{ id: string; name: string }>> {
  return runAction(async () => {
    const ws = await guard();
    const clean = z.string().trim().min(1).max(80).parse(name);
    const supabase = await getServerClient();
    const { data, error } = await supabase.from("product_categories").insert({ organization_id: ws.organization.id, name: clean }).select("id, name").single();
    if (error) throw error;
    return data as { id: string; name: string };
  }, "Category added");
}

const adjustSchema = z.object({
  variant_id: z.string().uuid(),
  type: z.enum(["purchase", "damage", "adjustment"]),
  quantity: z.coerce.number().int().refine((v) => v !== 0, "Quantity can't be zero").refine((v) => Math.abs(v) < 1e6, "Too large"),
  reason: z.string().trim().max(300).optional().default(""),
});

export async function adjustStockAction(raw: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    await guard("inventory.adjust");
    const input = adjustSchema.parse(raw);
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("adjust_stock", { p_variant: input.variant_id, p_type: input.type, p_quantity: input.quantity, p_reason: input.reason });
    if (error) throw error;
    revalidatePath("/inventory");
    revalidatePath("/products", "layout");
    return null;
  }, "Stock updated");
}
