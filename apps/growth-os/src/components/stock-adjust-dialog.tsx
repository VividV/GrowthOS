"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Minus, PackagePlus, Plus } from "lucide-react";
import { Alert, Button, Dialog, DialogContent, DialogTrigger, Field, Input, Textarea, cn, toast } from "@platform/ui";
import { adjustStockAction } from "@/server/product-actions";

type Mode = "purchase" | "damage" | "adjustment";

/** Big-button stock adjustment designed for one-handed use in a shop or store-room. */
export function StockAdjustDialog({ variantId, label, onHand, trigger }: { variantId: string; label: string; onHand: number; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("purchase");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const delta = mode === "purchase" ? Math.abs(qty) : mode === "damage" ? -Math.abs(qty) : qty;
  const after = onHand + delta;
  const needsReason = mode !== "purchase";

  const submit = () => start(async () => {
    setError(null);
    const r = await adjustStockAction({ variant_id: variantId, type: mode, quantity: mode === "adjustment" ? qty : Math.abs(qty), reason });
    if (!r.ok) { setError(r.error); return; }
    toast.success(r.message ?? "Stock updated");
    setOpen(false);
    setQty(1);
    setReason("");
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button size="sm" variant="outline"><PackagePlus /> Adjust</Button>}</DialogTrigger>
      <DialogContent title="Adjust stock" description={label} size="sm">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-sm">
            {([["purchase", "Restock"], ["damage", "Damaged / lost"], ["adjustment", "Correct count"]] as [Mode, string][]).map(([m, l]) => (
              <button key={m} type="button" onClick={() => { setMode(m); setQty(m === "adjustment" ? 0 : 1); }}
                className={cn("rounded-md px-2 py-1.5 text-xs font-medium", mode === m ? "bg-background shadow-xs" : "text-muted-foreground")}>{l}</button>
            ))}
          </div>
          <Field label={mode === "adjustment" ? "Change (+ / −)" : "Quantity"}>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" className="h-12 w-12" onClick={() => setQty((q) => (mode === "adjustment" ? q - 1 : Math.max(1, q - 1)))} aria-label="Decrease"><Minus /></Button>
              <Input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(Math.trunc(Number(e.target.value) || 0))} className="h-12 text-center text-lg font-semibold tabular" />
              <Button type="button" variant="outline" size="icon" className="h-12 w-12" onClick={() => setQty((q) => q + 1)} aria-label="Increase"><Plus /></Button>
            </div>
          </Field>
          <p className="text-sm text-muted-foreground">On hand: <span className="font-medium text-foreground tabular">{onHand}</span> → <span className={cn("font-semibold tabular", after < 0 ? "text-danger" : "text-foreground")}>{after}</span></p>
          <Field label={needsReason ? "Reason" : "Note (optional)"} required={needsReason}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[60px]" placeholder={mode === "purchase" ? "Supplier delivery" : mode === "damage" ? "Torn in transit" : "Stock count on Friday"} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button className="h-11 w-full" onClick={submit} loading={pending} disabled={delta === 0 || (needsReason && !reason.trim())}>Save adjustment</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
