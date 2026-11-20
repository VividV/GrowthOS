"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Minus, PackageSearch, Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Dialog, DialogContent, Field, Input, Select, Textarea, cn, formatMoney, toast,
} from "@platform/ui";
import { saveOrderAction } from "@/server/order-actions";
import { CustomerDialog } from "../customers/customer-form";

export interface SellableVariant { variant_id: string; product_name: string; variant_name: string; has_variants: boolean; sku: string; selling_price: number; quantity_available: number }
export interface CustomerOption { id: string; full_name: string; phone: string | null; address: string | null }
type Line = { variant_id: string; quantity: number; unit_price: string; discount_amount: string };
export interface DraftInitial {
  id: string; customer_id: string | null; channel: string | null; order_date: string; expected_delivery_date: string | null;
  discount_amount: number; delivery_fee: number; notes: string | null; delivery_address: string | null;
  items: { variant_id: string; quantity: number; unit_price: number; discount_amount: number }[];
}

const CHANNELS = ["instagram", "whatsapp", "walk-in", "tiktok", "facebook", "website", "phone", "other"];
const METHODS = [["bank_transfer", "Bank transfer"], ["cash", "Cash"], ["pos", "POS"], ["card", "Card"], ["mobile_money", "Mobile money"], ["other", "Other"]];

export function OrderBuilder({ variants, customers: initialCustomers, currency, today, initial, preselectCustomer, canPay, canCreateCustomer, allowNegative }: {
  variants: SellableVariant[]; customers: CustomerOption[]; currency: string; today: string; initial?: DraftInitial; preselectCustomer?: string;
  canPay: boolean; canCreateCustomer: boolean; allowNegative: boolean;
}) {
  const router = useRouter();
  const [customers, setCustomers] = useState(initialCustomers);
  const [customerId, setCustomerId] = useState(initial?.customer_id ?? preselectCustomer ?? "");
  const [lines, setLines] = useState<Line[]>(initial?.items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity, unit_price: String(i.unit_price), discount_amount: i.discount_amount ? String(i.discount_amount) : "" })) ?? []);
  const [meta, setMeta] = useState({
    channel: initial?.channel ?? "", order_date: initial?.order_date ?? today, expected_delivery_date: initial?.expected_delivery_date ?? "",
    discount_amount: initial?.discount_amount ? String(initial.discount_amount) : "", delivery_fee: initial?.delivery_fee ? String(initial.delivery_fee) : "",
    notes: initial?.notes ?? "", delivery_address: initial?.delivery_address ?? "",
  });
  const [payNow, setPayNow] = useState(false);
  const [payment, setPayment] = useState({ amount: "", method: "bank_transfer", reference: "" });
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [custSearch, setCustSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const byId = useMemo(() => Object.fromEntries(variants.map((v) => [v.variant_id, v])), [variants]);
  const customer = customers.find((c) => c.id === customerId);
  // Display-only estimate. The server recalculates every amount authoritatively.
  const subtotal = lines.reduce((a, l) => a + Math.max(0, (Number(l.unit_price) || 0) * l.quantity - (Number(l.discount_amount) || 0)), 0);
  const total = Math.max(0, subtotal - (Number(meta.discount_amount) || 0)) + (Number(meta.delivery_fee) || 0);
  const filtered = variants.filter((v) => `${v.product_name} ${v.variant_name} ${v.sku}`.toLowerCase().includes(search.toLowerCase())).slice(0, 60);
  const filteredCustomers = custSearch ? customers.filter((c) => `${c.full_name} ${c.phone ?? ""}`.toLowerCase().includes(custSearch.toLowerCase())).slice(0, 8) : [];

  const addVariant = (v: SellableVariant) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variant_id === v.variant_id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { variant_id: v.variant_id, quantity: 1, unit_price: String(v.selling_price), discount_amount: "" }];
    });
    toast.success(`Added ${v.product_name}`, { duration: 1200 });
  };
  const upd = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  const submit = (confirm: boolean) => start(async () => {
    setError(null);
    const r = await saveOrderAction({
      order_id: initial?.id ?? null, customer_id: customerId || null, ...meta, confirm,
      items: lines.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity, unit_price: l.unit_price, discount_amount: l.discount_amount })),
      payment: confirm && payNow && Number(payment.amount) > 0 ? payment : undefined,
    });
    if (!r.ok) { setError(r.error); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    toast.success(r.message ?? "Saved");
    router.push(`/orders/${r.data.id}`);
    router.refresh();
  });

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {error && <Alert tone="danger">{error}</Alert>}
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Customer</CardTitle>
            {canCreateCustomer && <CustomerDialog trigger={<Button size="sm" variant="ghost"><UserPlus /> New</Button>}
              onCreated={(id) => { router.refresh(); setCustomers((c) => [{ id, full_name: "New customer", phone: null, address: null }, ...c]); setCustomerId(id); }} />}
          </CardHeader>
          <CardContent className="space-y-3">
            {customer ? (
              <div className="flex items-center justify-between rounded-lg border bg-subtle px-3 py-2">
                <div><p className="text-sm font-medium">{customer.full_name}</p><p className="text-xs text-muted-foreground">{customer.phone ?? "No phone"}</p></div>
                <Button size="icon" variant="ghost" onClick={() => setCustomerId("")} aria-label="Remove customer"><X /></Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Search customers by name or phone — or leave blank for walk-in" className="pl-9" />
                {filteredCustomers.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-pop">
                    {filteredCustomers.map((c) => (
                      <li key={c.id}><button type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => { setCustomerId(c.id); setCustSearch(""); if (!meta.delivery_address && c.address) setMeta((m) => ({ ...m, delivery_address: c.address ?? "" })); }}>
                        <span>{c.full_name}</span><span className="text-muted-foreground">{c.phone}</span></button></li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Items</CardTitle>
            <Button size="sm" onClick={() => setPicker(true)}><Plus /> Add products</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.length === 0 ? (
              <button type="button" onClick={() => setPicker(true)} className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-sm text-muted-foreground hover:border-primary/40">
                <PackageSearch className="h-6 w-6" /> Tap to add products
              </button>
            ) : lines.map((l, i) => {
              const v = byId[l.variant_id];
              const over = v && !allowNegative && l.quantity > v.quantity_available;
              return (
                <div key={l.variant_id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{v?.product_name ?? "Unavailable product"}</p>
                      <p className="text-xs text-muted-foreground">{v?.has_variants ? `${v.variant_name} · ` : ""}{v?.sku} · {v?.quantity_available ?? 0} available</p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove item"><Trash2 /></Button>
                  </div>
                  <div className="mt-2 grid grid-cols-[auto_1fr_1fr] items-end gap-2">
                    <div className="flex items-center rounded-md border">
                      <button type="button" className="p-2.5" onClick={() => upd(i, { quantity: Math.max(1, l.quantity - 1) })} aria-label="Decrease"><Minus className="h-4 w-4" /></button>
                      <input value={l.quantity} onChange={(e) => upd(i, { quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} inputMode="numeric" className="w-10 bg-transparent text-center text-sm font-semibold tabular outline-none" aria-label="Quantity" />
                      <button type="button" className="p-2.5" onClick={() => upd(i, { quantity: l.quantity + 1 })} aria-label="Increase"><Plus className="h-4 w-4" /></button>
                    </div>
                    <Field label="Unit price"><Input type="number" inputMode="decimal" min="0" value={l.unit_price} onChange={(e) => upd(i, { unit_price: e.target.value })} className="tabular" /></Field>
                    <Field label="Line discount"><Input type="number" inputMode="decimal" min="0" value={l.discount_amount} onChange={(e) => upd(i, { discount_amount: e.target.value })} placeholder="0" className="tabular" /></Field>
                  </div>
                  {over && <p className="mt-2 text-xs text-danger">Only {v.quantity_available} available — confirming will fail unless you restock.</p>}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Delivery & notes</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Order date"><Input type="date" value={meta.order_date} max={today} onChange={(e) => setMeta({ ...meta, order_date: e.target.value })} /></Field>
            <Field label="Expected delivery"><Input type="date" value={meta.expected_delivery_date} onChange={(e) => setMeta({ ...meta, expected_delivery_date: e.target.value })} /></Field>
            <Field label="Sales channel">
              <Select value={meta.channel} onChange={(e) => setMeta({ ...meta, channel: e.target.value })}>
                <option value="">—</option>{CHANNELS.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
              </Select>
            </Field>
            <Field label="Delivery address"><Input value={meta.delivery_address} onChange={(e) => setMeta({ ...meta, delivery_address: e.target.value })} /></Field>
            <Field label="Notes" className="sm:col-span-2"><Textarea value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} className="min-h-[60px]" /></Field>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular">{formatMoney(subtotal, currency)}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Discount</span>
              <Input type="number" inputMode="decimal" min="0" value={meta.discount_amount} onChange={(e) => setMeta({ ...meta, discount_amount: e.target.value })} placeholder="0" className="h-8 w-28 text-right tabular" /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Delivery fee</span>
              <Input type="number" inputMode="decimal" min="0" value={meta.delivery_fee} onChange={(e) => setMeta({ ...meta, delivery_fee: e.target.value })} placeholder="0" className="h-8 w-28 text-right tabular" /></div>
            <div className="flex justify-between border-t pt-3 text-base font-semibold"><span>Total</span><span className="tabular">{formatMoney(total, currency)}</span></div>
            <p className="text-2xs text-muted-foreground">Final amounts are calculated securely when you save.</p>

            {canPay && (
              <div className="space-y-3 rounded-lg border p-3">
                <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={payNow} onChange={(e) => { setPayNow(e.target.checked); if (e.target.checked && !payment.amount) setPayment((p) => ({ ...p, amount: String(total) })); }} /> Customer has paid (fully or partly)</label>
                {payNow && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" inputMode="decimal" min="0" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} aria-label="Amount paid" className="tabular" />
                    <Select value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })} aria-label="Payment method">
                      {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                    <Input value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} placeholder="Reference (optional)" className="col-span-2" />
                  </div>
                )}
              </div>
            )}
            <Button className="h-11 w-full" disabled={lines.length === 0} loading={pending} onClick={() => submit(true)}>Confirm order</Button>
            <Button variant="outline" className="w-full" disabled={lines.length === 0 || pending} onClick={() => submit(false)}>Save as draft / enquiry</Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={picker} onOpenChange={setPicker}>
        <DialogContent title="Add products" size="lg">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products or SKU" className="pl-9" autoFocus />
          </div>
          {variants.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No products yet. Add products first.</p> : (
            <ul className="divide-y rounded-lg border">
              {filtered.map((v) => {
                const inCart = lines.find((l) => l.variant_id === v.variant_id)?.quantity ?? 0;
                return (
                  <li key={v.variant_id}>
                    <button type="button" onClick={() => addVariant(v)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent active:bg-accent">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{v.product_name}{v.has_variants && <span className="font-normal text-muted-foreground"> · {v.variant_name}</span>}</p>
                        <p className="text-xs text-muted-foreground">{v.sku} · <span className={cn(v.quantity_available <= 0 && "text-danger")}>{v.quantity_available} available</span></p>
                      </div>
                      <span className="text-sm tabular">{formatMoney(v.selling_price, currency)}</span>
                      {inCart > 0 ? <Badge tone="primary">{inCart}</Badge> : <Plus className="h-4 w-4 text-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Button className="mt-4 w-full" onClick={() => setPicker(false)}>Done ({lines.reduce((a, l) => a + l.quantity, 0)} items)</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
