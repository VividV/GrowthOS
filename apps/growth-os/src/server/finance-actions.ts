"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@platform/database/server";
import { requireWorkspace } from "@platform/auth";
import { capture } from "@platform/analytics";
import { runAction, fail, formToObject, type ActionResult } from "./action";

const amount = z.coerce.number({ invalid_type_error: "Enter an amount" }).positive("Enter an amount greater than zero").max(1e11)
  .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, "At most 2 decimal places");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

async function guard() {
  const ws = await requireWorkspace();
  if (!ws.can("finance.write")) fail("You don't have permission to record finances.", "forbidden");
  if (!ws.writable) fail("Your workspace is read-only. Choose a plan to make changes.", "subscription");
  return ws;
}

const expenseSchema = z.object({
  category_id: z.string().uuid("Choose a category"),
  amount,
  expense_date: day,
  description: z.string().trim().min(1, "Describe the expense").max(300),
  vendor: z.string().trim().max(120).optional().transform((v) => v || null),
  payment_method: z.enum(["cash", "bank_transfer", "pos", "card", "mobile_money", "other"]).optional().or(z.literal("")).transform((v) => v || null),
  reference: z.string().trim().max(100).optional().transform((v) => v || null),
});

export async function saveExpenseAction(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await guard();
    const raw = formToObject(fd);
    const input = expenseSchema.parse(raw);
    const supabase = await getServerClient();
    if (raw.id) {
      const { error } = await supabase.from("expenses").update(input).eq("id", raw.id).eq("organization_id", ws.organization.id).is("voided_at", null);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("expenses").insert({ ...input, organization_id: ws.organization.id, created_by: ws.user.id });
      if (error) throw error;
      await capture(ws.user.id, "expense_recorded");
    }
    revalidatePath("/finance");
    return null;
  }, "Expense saved");
}

const incomeSchema = z.object({
  amount,
  income_date: day,
  description: z.string().trim().min(1, "Describe the income").max(300),
  source: z.string().trim().max(80).optional().transform((v) => v || null),
});

export async function saveIncomeAction(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await guard();
    const input = incomeSchema.parse(formToObject(fd));
    const supabase = await getServerClient();
    const { error } = await supabase.from("income_records").insert({ ...input, organization_id: ws.organization.id, created_by: ws.user.id });
    if (error) throw error;
    revalidatePath("/finance");
    return null;
  }, "Income recorded");
}

export async function voidFinancialRecordAction(table: "expenses" | "income_records", id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await guard();
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("void_financial_record", { p_table: z.enum(["expenses", "income_records"]).parse(table), p_id: z.string().uuid().parse(id) });
    if (error) throw error;
    revalidatePath("/finance");
    return null;
  }, "Record voided — it no longer counts in reports");
}

export async function createExpenseCategoryAction(name: string): Promise<ActionResult<{ id: string; name: string }>> {
  return runAction(async () => {
    const ws = await guard();
    const supabase = await getServerClient();
    const { data, error } = await supabase.from("expense_categories").insert({ organization_id: ws.organization.id, name: z.string().trim().min(1).max(60).parse(name) })
      .select("id, name").single();
    if (error) throw error;
    revalidatePath("/finance");
    return data as { id: string; name: string };
  }, "Category added");
}
