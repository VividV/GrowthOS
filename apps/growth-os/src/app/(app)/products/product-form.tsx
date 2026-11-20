"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { ImagePlus, Plus, Trash2, Wand2, X } from "lucide-react";
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Field, Input, Select, Textarea, toast } from "@platform/ui";
import { createCategoryAction, createProductAction, updateProductAction } from "@/server/product-actions";

type VariantDraft = { key: string; options: Record<string, string>; sku: string; selling_price: string; cost_price: string; opening_quantity: string };
export interface ProductInitial {
  id: string; name: string; sku: string | null; description: string | null; category_id: string | null;
  cost_price: number | string; selling_price: number | string; low_stock_threshold: number; is_active: boolean; image_url?: string | null;
}

const cartesian = (groups: { name: string; values: string[] }[]): Record<string, string>[] =>
  groups.reduce<Record<string, string>[]>((acc, g) => acc.flatMap((a) => g.values.map((v) => ({ ...a, [g.name]: v }))), [{}]);

export function ProductForm({ categories: initialCategories, product, currency = "₦" }: {
  categories: { id: string; name: string }[]; product?: ProductInitial; currency?: string;
}) {
  const router = useRouter();
  const editing = Boolean(product);
  const [categories, setCategories] = useState(initialCategories);
  const [f, setF] = useState({
    name: product?.name ?? "", sku: product?.sku ?? "", description: product?.description ?? "", category_id: product?.category_id ?? "",
    cost_price: product ? String(product.cost_price) : "", selling_price: product ? String(product.selling_price) : "",
    low_stock_threshold: String(product?.low_stock_threshold ?? 5), opening_quantity: "0", is_active: product?.is_active ?? true,
  });
  const [image, setImage] = useState<File | null>(null);
  const [hasVariants, setHasVariants] = useState(false);
  const [groups, setGroups] = useState<{ name: string; values: string[] }[]>([{ name: "Colour", values: [] }, { name: "Size", values: [] }]);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [newCat, setNewCat] = useState("");
  const [catPending, startCat] = useTransition();
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : product?.image_url ?? null), [image, product?.image_url]);
  const [state, action, pending] = useActionState(editing ? updateProductAction : createProductAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message ?? "Saved");
      const id = (state.data as { id?: string } | null)?.id;
      router.push(id ? `/products/${id}` : `/products/${product!.id}`);
      router.refresh();
    }
  }, [state, router, product]);

  const generate = () => {
    const filled = groups.filter((g) => g.name.trim() && g.values.length);
    const combos = cartesian(filled);
    const base = (f.sku || f.name).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "ITEM";
    setVariants(combos.map((options) => {
      const key = Object.values(options).join("|");
      const existing = variants.find((v) => v.key === key);
      return existing ?? { key, options, sku: `${base}-${Object.values(options).map((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3)).join("-")}`, selling_price: "", cost_price: "", opening_quantity: "0" };
    }));
  };

  const payload = {
    ...f, is_active: f.is_active,
    variants: !editing && hasVariants ? variants.map((v) => ({ options: v.options, sku: v.sku, selling_price: v.selling_price, cost_price: v.cost_price, opening_quantity: v.opening_quantity || "0" })) : [],
  };
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {editing && <input type="hidden" name="id" value={product!.id} />}
      {image && <FileInput name="image" file={image} />}
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Product name" required error={fe.name}><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Ankara Shirt" autoFocus={!editing} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <Select value={f.category_id} onChange={(e) => set("category_id", e.target.value)}>
                  <option value="">Uncategorised</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="New category" hint="Optional">
                <div className="flex gap-2">
                  <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="e.g. Accessories" />
                  <Button type="button" variant="outline" disabled={!newCat.trim()} loading={catPending} onClick={() => startCat(async () => {
                    const r = await createCategoryAction(newCat);
                    if (r.ok) { setCategories((c) => [...c, r.data].sort((a, b) => a.name.localeCompare(b.name))); set("category_id", r.data.id); setNewCat(""); }
                    else toast.error(r.error);
                  })}><Plus /></Button>
                </div>
              </Field>
            </div>
            <Field label="Description"><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Fabric, fit, care instructions…" /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Image</CardTitle></CardHeader>
          <CardContent>
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed bg-subtle text-sm text-muted-foreground hover:border-primary/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <><ImagePlus className="h-6 w-6" /> Add a photo</>}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && file.size > 2 * 1024 * 1024) { toast.error("Images must be 2 MB or smaller"); return; }
                setImage(file ?? null);
              }} />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">PNG, JPEG or WebP · up to 2 MB</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Pricing & stock</CardTitle><CardDescription>Cost price lets Growth OS calculate your real profit.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={`Selling price (${currency})`} required error={fe.selling_price}><Input type="number" inputMode="decimal" min="0" step="0.01" value={f.selling_price} onChange={(e) => set("selling_price", e.target.value)} className="tabular" /></Field>
          <Field label={`Cost price (${currency})`} error={fe.cost_price} hint="What you paid per item"><Input type="number" inputMode="decimal" min="0" step="0.01" value={f.cost_price} onChange={(e) => set("cost_price", e.target.value)} className="tabular" /></Field>
          <Field label="Low-stock alert at" error={fe.low_stock_threshold}><Input type="number" inputMode="numeric" min="0" value={f.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} /></Field>
          {!editing && !hasVariants && <Field label="Opening stock" error={fe.opening_quantity}><Input type="number" inputMode="numeric" min="0" value={f.opening_quantity} onChange={(e) => set("opening_quantity", e.target.value)} /></Field>}
          {(editing || !hasVariants) && <Field label="SKU" error={fe.sku} hint="Leave blank to auto-generate"><Input value={f.sku} onChange={(e) => set("sku", e.target.value)} placeholder="ANK-SHIRT" /></Field>}
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Available for sale</label>
        </CardContent>
      </Card>

      {!editing && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle>Variants</CardTitle><CardDescription>Different colours, sizes or lengths — each with its own SKU and stock.</CardDescription></div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} /> This product has variants</label>
          </CardHeader>
          {hasVariants && (
            <CardContent className="space-y-4">
              {groups.map((g, gi) => (
                <div key={gi} className="grid gap-2 sm:grid-cols-[160px_1fr_auto] sm:items-start">
                  <Input value={g.name} onChange={(e) => setGroups((gs) => gs.map((x, i) => (i === gi ? { ...x, name: e.target.value } : x)))} placeholder="Option (e.g. Colour)" />
                  <TagInput values={g.values} onChange={(values) => setGroups((gs) => gs.map((x, i) => (i === gi ? { ...x, values } : x)))} placeholder="Type a value and press Enter (e.g. Blue)" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setGroups((gs) => gs.filter((_, i) => i !== gi))} aria-label="Remove option"><Trash2 /></Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                {groups.length < 3 && <Button type="button" variant="outline" size="sm" onClick={() => setGroups((g) => [...g, { name: "", values: [] }])}><Plus /> Add option</Button>}
                <Button type="button" size="sm" onClick={generate} disabled={!groups.some((g) => g.values.length)}><Wand2 /> Generate variants</Button>
              </div>
              {variants.length > 0 && (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-subtle text-left text-2xs uppercase tracking-wide text-muted-foreground">
                      <tr><th className="px-3 py-2">Variant</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Price override</th><th className="px-3 py-2">Cost override</th><th className="px-3 py-2">Opening stock</th><th /></tr>
                    </thead>
                    <tbody>
                      {variants.map((v, i) => {
                        const upd = (k: keyof VariantDraft, val: string) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
                        return (
                          <tr key={v.key} className="border-t">
                            <td className="px-3 py-2 font-medium">{Object.values(v.options).join(" / ")}</td>
                            <td className="px-3 py-2"><Input value={v.sku} onChange={(e) => upd("sku", e.target.value)} className="h-8" /></td>
                            <td className="px-3 py-2"><Input type="number" min="0" value={v.selling_price} onChange={(e) => upd("selling_price", e.target.value)} placeholder={f.selling_price || "same"} className="h-8 w-28" /></td>
                            <td className="px-3 py-2"><Input type="number" min="0" value={v.cost_price} onChange={(e) => upd("cost_price", e.target.value)} placeholder={f.cost_price || "same"} className="h-8 w-28" /></td>
                            <td className="px-3 py-2"><Input type="number" min="0" value={v.opening_quantity} onChange={(e) => upd("opening_quantity", e.target.value)} className="h-8 w-20" /></td>
                            <td className="px-3 py-2"><Button type="button" size="icon" variant="ghost" onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))} aria-label="Remove"><X /></Button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      <div className="sticky bottom-20 z-10 flex justify-end gap-2 rounded-xl border bg-background/95 p-3 shadow-pop backdrop-blur lg:bottom-4">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={pending} disabled={!editing && hasVariants && variants.length === 0}>{editing ? "Save product" : "Create product"}</Button>
      </div>
    </form>
  );
}

function TagInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState("");
  const add = () => {
    const parts = text.split(",").map((s) => s.trim()).filter(Boolean).filter((s) => !values.includes(s));
    if (parts.length) onChange([...values, ...parts]);
    setText("");
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
          {v}<button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <input value={text} onChange={(e) => setText(e.target.value)} onBlur={add}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        placeholder={values.length ? "" : placeholder} className="min-w-[120px] flex-1 bg-transparent text-sm outline-none" />
    </div>
  );
}

function FileInput({ name, file }: { name: string; file: File }) {
  return (
    <input type="file" name={name} className="hidden" ref={(el) => {
      if (!el) return;
      const dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
    }} />
  );
}
