import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateImage } from "@/lib/image-validation";
import { fail } from "./action";

export const BUCKET = "business-assets";

/**
 * Uploads an image to <org>/<folder>/<random>.<ext> using the USER's client,
 * so storage RLS (membership + permission) applies. Returns the object path.
 */
export async function uploadImage(supabase: SupabaseClient, orgId: string, folder: "logo" | "products", file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateImage(bytes.subarray(0, 16), file.size);
  if (!check.ok) fail(check.error);
  const path = `${orgId}/${folder}/${crypto.randomUUID()}.${check.kind.ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: check.kind.mime, upsert: false });
  if (error) fail(`Upload failed: ${error.message}`);
  return path;
}

/** Short-lived signed URLs for private assets. Returns null for missing paths. */
export async function signedUrls(supabase: SupabaseClient, paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (unique.length === 0) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(unique, 60 * 60);
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}
