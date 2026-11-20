"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Banknote, CheckCircle2, Pencil, Printer, RotateCcw, Trash2, Truck, Undo2 } from "lucide-react";
import { Alert, Button, Checkbox, Dialog, DialogContent, DialogTrigger, Field, Input, Select, Textarea, formatMoney, toast } from "@platform/ui";
import { ConfirmAction } from "@/components/confirm-action";
import {
  cancelOrderAction, confirmOrderAction, deleteDraftAction, recordPaymentAction, recordRefundAction, recordReturnAction, updateOrderStatusAction, voidPaymentAction,
} from "@/server/order-actions";

const METHODS = [["bank_transfer", "Bank transfer"], ["cash", "Cash"], ["pos", "POS"], ["card", "Card"], ["mobile_money", "Mobile money"], ["other", "Other"]];
const NEXT: Record<string, { status: string; label: string }[]> = {
  confirmed: [{ status: "processing", label: "Start processing" }, { status: "dispatched", label: "Mark dispatched" }],
  processing: [{ status: "ready", label: "Mark ready" }, { status: "dispatched", label: "Mark dispatched" }],
  ready: [{ status: "dispatched", label: "Mark dispatched" }, { status: "delivered", label: "Mark delivered" }],
  dispatched: [{ status: "delivered", label: "Mark delivered" }],
};

export interface OrderActionProps {
  id: string; status: string; balanceDue: number; amountPaid: number; currency: string;
  items: { id: string; name: string; quantity: number; returned: number }[];
  can: { write: boolean; cancel: boolean; pay: boolean; refund: boolean };
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { toast.success(r.message ?? "Done"); after?.(); router.refresh(); } else toast.error(r.error ?? "Something went wrong");
    });
  return { pending, run };
}

export function OrderActions({ id, status, balanceDue, amountPaid, currency, items, can }: OrderActionProps) {
  const { pending, run } = useRun();
  const terminal = status === "cancelled";
  return (
    <div className="flex flex-wrap gap-2 no-print">
      {status === "draft" && can.write && (
        <>
          <Button loading={pending} onClick={() => run(() => confirmOrderAction(id))}><CheckCircle2 /> Confirm order</Button>
          <Button variant="outline" asChild><Link href={`/orders/${id}/edit`}><Pencil /> Edit</Link></Button>
          <ConfirmAction label="Delete" icon={<Trash2 />} destructive title="Delete this draft?" confirmLabel="Delete" redirectTo="/orders" run={() => deleteDraftAction(id)} />
        </>
      )}
      {can.write && NEXT[status]?.map((n, i) => (
        <Button key={n.status} variant={i === 0 ? "default" : "outline"} loading={pending} onClick={() => run(() => updateOrderStatusAction(id, n.status))}>
          {n.status === "dispatched" || n.status === "delivered" ? <Truck /> : null}{n.label}
        </Button>
      ))}
      {can.pay && !terminal && status !== "draft" && balanceDue > 0 && <PaymentDialog orderId={id} balanceDue={balanceDue} currency={currency} />}
      {can.refund && amountPaid > 0 && (balanceDue < 0 || terminal) && <RefundDialog orderId={id} max={Math.min(amountPaid, terminal ? amountPaid : -balanceDue)} currency={currency} />}
      {can.cancel && (status === "dispatched" || status === "delivered") && items.some((i) => i.quantity > i.returned) && <ReturnDialog orderId={id} items={items} />}
      {can.cancel && !["draft", "cancelled", "delivered"].includes(status) && (
        <ConfirmAction label="Cancel order" icon={<Ban />} destructive title="Cancel this order?" confirmLabel="Cancel order"
          description="Reserved stock is released and dispatched stock is put back. Payments stay on record — refund them separately."
          reason={{ label: "Reason", required: true, placeholder: "Customer changed their mind" }} run={(r) => cancelOrderAction(id, r)} />
      )}
      <Button variant="ghost" asChild><Link href={`/orders/${id}/print`} target="_blank"><Printer /> Print</Link></Button>
    </div>
  );
}

function PaymentDialog({ orderId, balanceDue, currency }: { orderId: string; balanceDue: number; currency: string }) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState({ amount: String(balanceDue), method: "bank_transfer", reference: "", paid_at: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Banknote /> Record payment</Button></DialogTrigger>
      <DialogContent title="Record payment" description={`Outstanding: ${formatMoney(balanceDue, currency)}`} size="sm">
        <div className="space-y-4">
          <Field label="Amount received" required>
            <Input type="number" inputMode="decimal" min="0" max={balanceDue} step="0.01" value={p.amount} onChange={(e) => setP({ ...p, amount: e.target.value })} className="h-12 text-lg font-semibold tabular" autoFocus />
          </Field>
          <div className="flex gap-2">
            {[0.5, 1].map((f) => <Button key={f} type="button" size="sm" variant="outline" onClick={() => setP({ ...p, amount: String(Math.round(balanceDue * f * 100) / 100) })}>{f === 1 ? "Full balance" : "Half"}</Button>)}
          </div>
          <Field label="Method"><Select value={p.method} onChange={(e) => setP({ ...p, method: e.target.value })}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reference"><Input value={p.reference} onChange={(e) => setP({ ...p, reference: e.target.value })} placeholder="Bank ref" /></Field>
            <Field label="Date received" hint="Default: now"><Input type="datetime-local" value={p.paid_at} onChange={(e) => setP({ ...p, paid_at: e.target.value })} /></Field>
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button className="h-11 w-full" loading={pending} onClick={() => { setError(null); run(async () => { const r = await recordPaymentAction({ order_id: orderId, ...p }); if (!r.ok) setError(r.error); return r; }, () => setOpen(false)); }}>Save payment</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({ orderId, max, currency }: { orderId: string; max: number; currency: string }) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState({ amount: String(max), method: "bank_transfer", reason: "" });
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Undo2 /> Record refund</Button></DialogTrigger>
      <DialogContent title="Record refund" description={`Up to ${formatMoney(max, currency)} can be refunded`} size="sm">
        <div className="space-y-4">
          <Field label="Amount refunded" required><Input type="number" min="0" max={max} value={p.amount} onChange={(e) => setP({ ...p, amount: e.target.value })} className="tabular" /></Field>
          <Field label="Method"><Select value={p.method} onChange={(e) => setP({ ...p, method: e.target.value })}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Reason" required><Textarea value={p.reason} onChange={(e) => setP({ ...p, reason: e.target.value })} className="min-h-[60px]" /></Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button className="w-full" disabled={!p.reason.trim()} loading={pending} onClick={() => run(async () => { const r = await recordRefundAction({ order_id: orderId, ...p }); if (!r.ok) setError(r.error); return r; }, () => setOpen(false))}>Save refund</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({ orderId, items }: { orderId: string; items: OrderActionProps["items"] }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><RotateCcw /> Record return</Button></DialogTrigger>
      <DialogContent title="Record a return" description="The order's value is reduced by the returned items (including their share of any order discount).">
        <div className="space-y-4">
          <ul className="divide-y rounded-lg border">
            {items.map((i) => {
              const max = i.quantity - i.returned;
              return (
                <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm">{i.name}<span className="block text-xs text-muted-foreground">{max} returnable</span></span>
                  <Input type="number" min="0" max={max} value={qty[i.id] ?? 0} disabled={max === 0}
                    onChange={(e) => setQty({ ...qty, [i.id]: Math.min(max, Math.max(0, Math.trunc(Number(e.target.value) || 0))) })} className="h-9 w-20 text-center tabular" aria-label={`Return quantity for ${i.name}`} />
                </li>
              );
            })}
          </ul>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Put returned items back into stock</label>
          <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[60px]" placeholder="Wrong size" /></Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button className="w-full" disabled={!Object.values(qty).some((q) => q > 0)} loading={pending}
            onClick={() => run(async () => { const r = await recordReturnAction({ order_id: orderId, restock, reason, items: Object.entries(qty).map(([order_item_id, quantity]) => ({ order_item_id, quantity })) }); if (!r.ok) setError(r.error); return r; }, () => setOpen(false))}>
            Save return
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VoidPaymentButton({ paymentId, orderId }: { paymentId: string; orderId: string }) {
  return (
    <ConfirmAction label="Void" size="sm" variant="ghost" destructive title="Void this payment?"
      description="Use this to correct a payment recorded by mistake. It stays visible (struck through) in the audit trail."
      reason={{ label: "Why is it being voided?", required: true }} confirmLabel="Void payment" run={(r) => voidPaymentAction(paymentId, orderId, r)} />
  );
}
