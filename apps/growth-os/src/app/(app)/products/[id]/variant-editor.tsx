"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { Alert, Button, Checkbox, Dialog, DialogContent, DialogTrigger, Field, Input, toast } from "@platform/ui";
import { addVariantAction, updateVariantAction } from "@/server/product-actions";

export interface VariantRow { id: string; name: string; sku: string; cost_price: string | number | null; selling_price: string | number | null; low_stock_threshold: number | null; is_active: boolean }

export function EditVariantDialog({ variant }: { variant: VariantRow }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    name: variant.name, sku: variant.sku, cost_price: variant.cost_price === null ? "" : String(variant.cost_price),
    selling_price: variant.selling_price === null ? "" : String(variant.selling_price),
    low_stock_threshold: variant.low_stock_threshold === null ? "" : String(variant.low_stock_threshold), is_active: variant.is_active,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="icon" variant="ghost" aria-label={`Edit ${variant.name}`}><Pencil /></Button></DialogTrigger>
      <DialogContent title="Edit variant" size="sm">
        <div className="space-y-4">
          <Field label="Name"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="SKU"><Input value={v.sku} onChange={(e) => setV({ ...v, sku: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price override" hint="Blank = product price"><Input type="number" min="0" value={v.selling_price} onChange={(e) => setV({ ...v, selling_price: e.target.value })} /></Field>
            <Field label="Cost override" hint="Blank = product cost"><Input type="number" min="0" value={v.cost_price} onChange={(e) => setV({ ...v, cost_price: e.target.value })} /></Field>
          </div>
          <Field label="Low-stock alert at" hint="Blank = product setting"><Input type="number" min="0" value={v.low_stock_threshold} onChange={(e) => setV({ ...v, low_stock_threshold: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.is_active} onChange={(e) => setV({ ...v, is_active: e.target.checked })} /> Available for sale</label>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button className="w-full" loading={pending} onClick={() => start(async () => {
            const r = await updateVariantAction(variant.id, v);
            if (!r.ok) { setError(r.error); return; }
            toast.success("Variant saved"); setOpen(false); router.refresh();
          })}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AddVariantDialog({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", sku: "", selling_price: "", cost_price: "", opening_quantity: "0" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Plus /> Add variant</Button></DialogTrigger>
      <DialogContent title="Add variant" size="sm" description="e.g. Green / Large">
        <div className="space-y-4">
          <Field label="Variant name" required><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Green / Large" /></Field>
          <Field label="SKU" hint="Leave blank to auto-generate"><Input value={v.sku} onChange={(e) => setV({ ...v, sku: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price override"><Input type="number" min="0" value={v.selling_price} onChange={(e) => setV({ ...v, selling_price: e.target.value })} /></Field>
            <Field label="Cost override"><Input type="number" min="0" value={v.cost_price} onChange={(e) => setV({ ...v, cost_price: e.target.value })} /></Field>
          </div>
          <Field label="Opening stock"><Input type="number" min="0" value={v.opening_quantity} onChange={(e) => setV({ ...v, opening_quantity: e.target.value })} /></Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button className="w-full" disabled={!v.name.trim()} loading={pending} onClick={() => start(async () => {
            const r = await addVariantAction(productId, { ...v, sku: v.sku || undefined });
            if (!r.ok) { setError(r.error); return; }
            toast.success("Variant added"); setOpen(false); router.refresh();
          })}>Add variant</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
