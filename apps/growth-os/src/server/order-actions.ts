"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@platform/database/server";
import { requireWorkspace } from "@platform/auth";
import type { Permission } from "@platform/permissions";
import { capture } from "@platform/analytics";
import { runAction, fail, type ActionResult } from "./action";

const uuid = z.string().uuid();
const amount = z.coerce.number().positive("Enter an amount greater than zero").max(1e11)
  .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, "At most 2 decimal places");
const optMoney = z.union([z.string(), z.number()]).optional().transform((v) => (v === "" || v === undefined ? 0 : Number(v)))
  .refine((v) => Number.isFinite(v) && v >= 0, "Must be zero or more");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform((v) => v || null);
const METHODS = ["cash", "bank_transfer", "pos", "card", "mobile_money", "other"] as const;

const orderSchema = z.object({
  order_id: uuid.optional().nullable(),
  customer_id: uuid.optional().nullable().or(z.literal("")).transform((v) => v || null),
  channel: z.string().trim().max(40).optional().transform((v) => v || null),
  order_date: date,
  expected_delivery_date: date,
  discount_amount: optMoney,
  delivery_fee: optMoney,
  notes: z.string().trim().max(2000).optional().transform((v) => v || null),
  delivery_address: z.string().trim().max(500).optional().transform((v) => v || null),
  items: z.array(z.object({
    variant_id: uuid,
    quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(100000),
    unit_price: z.union([z.string(), z.number()]).optional().transform((v) => (v === "" || v === undefined ? undefined : Number(v))),
    discount_amount: optMoney,
  })).min(1, "Add at least one item").max(200),
  confirm: z.boolean().default(false),
  payment: z.object({ amount: z.union([z.string(), z.number()]).optional(), method: z.enum(METHODS).default("bank_transfer"), reference: z.string().max(100).optional() }).optional(),
});

async function guard(...perms: Permission[]) {
  const ws = await requireWorkspace();
  for (const p of perms) if (!ws.can(p)) fail("You don't have permission to do that.", "forbidden");
  if (!ws.writable) fail("Your workspace is read-only. Choose a plan to make changes.", "subscription");
  return ws;
}

const touch = (id?: string) => {
  revalidatePath("/orders");
  if (id) revalidatePath(`/orders/${id}`);
  revalidatePath("/dashboard");
};

export async function saveOrderAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ws = await guard("orders.write");
    const input = orderSchema.parse(raw);
    const payAmount = input.payment?.amount ? Number(input.payment.amount) : 0;
    if (payAmount > 0 && !ws.can("payments.record")) fail("You can't record payments.", "forbidden");
    const supabase = await getServerClient();
    const { order_id, confirm, payment, ...p } = input;
    let id: string;
    if (order_id) {
      const { error } = await supabase.rpc("save_draft_order", { p_org: ws.organization.id, p_order: order_id, p });
      if (error) throw error;
      id = order_id;
      if (confirm) {
        const { error: e2 } = await supabase.rpc("confirm_order", { p_order: id });
        if (e2) throw e2;
        if (payAmount > 0) {
          const { error: e3 } = await supabase.rpc("record_payment", { p_order: id, p_amount: payAmount, p_method: payment?.method, p_reference: payment?.reference ?? null });
          if (e3) throw e3;
        }
      }
    } else {
      const { data, error } = await supabase.rpc("create_order", {
        p_org: ws.organization.id,
        p: { ...p, confirm, payment: payAmount > 0 ? { amount: payAmount, method: payment?.method, reference: payment?.reference } : undefined },
      });
      if (error) throw error;
      id = data as string;
      await capture(ws.user.id, "order_created", { items: p.items.length, confirmed: confirm });
    }
    touch(id);
    return { id };
  }, input_message(raw));
}
function input_message(raw: unknown) {
  return (raw as { confirm?: boolean })?.confirm ? "Order confirmed" : "Draft saved";
}

export async function confirmOrderAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await guard("orders.write");
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("confirm_order", { p_order: uuid.parse(id) });
    if (error) throw error;
    touch(id);
    return null;
  }, "Order confirmed — stock reserved");
}

export async function updateOrderStatusAction(id: string, status: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await guard("orders.write");
    const s = z.enum(["processing", "ready", "dispatched", "delivered"]).parse(status);
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("update_order_status", { p_order: uuid.parse(id), p_status: s });
    if (error) throw error;
    touch(id);
    return null;
  }, `Marked as ${status}`);
}

export async function cancelOrderAction(id: string, reason: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await guard("orders.cancel");
    if (!reason.trim()) fail("Give a reason for cancelling.");
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("cancel_order", { p_order: uuid.parse(id), p_reason: reason.slice(0, 500) });
    if (error) throw error;
    touch(id);
    return null;
  }, "Order cancelled — stock released");
}

export async function deleteDraftAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await guard("orders.write");
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("delete_draft_order", { p_order: uuid.parse(id) });
    if (error) throw error;
    touch();
    return null;
  }, "Draft deleted");
}

const paymentSchema = z.object({
  order_id: uuid,
  amount,
  method: z.enum(METHODS),
  reference: z.string().trim().max(100).optional().transform((v) => v || null),
  paid_at: z.string().optional().transform((v) => (v ? new Date(v).toISOString() : null)),
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
});

export async function recordPaymentAction(raw: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await guard("payments.record");
    const p = paymentSchema.parse(raw);
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("record_payment", { p_order: p.order_id, p_amount: p.amount, p_method: p.method, p_reference: p.reference, p_paid_at: p.paid_at, p_notes: p.notes });
    if (error) throw error;
    await capture(ws.user.id, "payment_recorded", { method: p.method });
    touch(p.order_id);
    return null;
  }, "Payment recorded");
}

export async function recordRefundAction(raw: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    await guard("payments.refund");
    const p = z.object({ order_id: uuid, amount, method: z.enum(METHODS), reason: z.string().trim().min(1, "Give a reason").max(500) }).parse(raw);
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("record_refund", { p_order: p.order_id, p_amount: p.amount, p_method: p.method, p_reason: p.reason });
    if (error) throw error;
    touch(p.order_id);
    return null;
  }, "Refund recorded");
}

export async function voidPaymentAction(paymentId: string, orderId: string, reason: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await guard("payments.refund");
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("void_payment", { p_payment: uuid.parse(paymentId), p_reason: reason });
    if (error) throw error;
    touch(orderId);
    return null;
  }, "Payment voided");
}

export async function recordReturnAction(raw: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    await guard("orders.cancel");
    const p = z.object({
      order_id: uuid,
      restock: z.boolean(),
      reason: z.string().trim().max(500).optional(),
      items: z.array(z.object({ order_item_id: uuid, quantity: z.coerce.number().int().min(0) })).transform((a) => a.filter((i) => i.quantity > 0)),
    }).parse(raw);
    if (p.items.length === 0) fail("Choose at least one item to return.");
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("record_return", { p_order: p.order_id, p: { restock: p.restock, reason: p.reason, items: p.items } });
    if (error) throw error;
    touch(p.order_id);
    return null;
  }, "Return recorded");
}
