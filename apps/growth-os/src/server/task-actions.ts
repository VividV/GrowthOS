"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@platform/database/server";
import { requireWorkspace } from "@platform/auth";
import { capture } from "@platform/analytics";
import { todayIn, addDays } from "@/lib/dates";
import { runAction, fail, formToObject, type ActionResult } from "./action";

const uuidOrNull = z.string().optional().transform((v) => (v ? v : null)).refine((v) => v === null || /^[0-9a-f-]{36}$/i.test(v), "Invalid id");
const taskSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title").max(200),
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  customer_id: uuidOrNull,
  order_id: uuidOrNull,
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  assigned_to: uuidOrNull,
});

async function guard() {
  const ws = await requireWorkspace();
  if (!ws.can("tasks.write")) fail("You don't have permission to manage follow-ups.", "forbidden");
  if (!ws.writable) fail("Your workspace is read-only. Choose a plan to make changes.", "subscription");
  return ws;
}

export async function saveTaskAction(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await guard();
    const raw = formToObject(fd);
    const input = taskSchema.parse(raw);
    if (input.assigned_to && input.assigned_to !== ws.user.id && !ws.can("tasks.assign")) fail("You can only assign tasks to yourself.", "forbidden");
    const supabase = await getServerClient();
    const id = raw.id;
    if (id) {
      const { error } = await supabase.from("follow_up_tasks").update(input).eq("id", id).eq("organization_id", ws.organization.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("follow_up_tasks").insert({
        ...input, organization_id: ws.organization.id, created_by: ws.user.id,
        source: raw.suggestion_key ? "suggested" : "manual", suggestion_key: raw.suggestion_key || null,
      });
      if (error) throw error;
      await capture(ws.user.id, "task_created", { source: raw.suggestion_key ? "suggested" : "manual" });
    }
    revalidatePath("/tasks");
    return null;
  }, "Follow-up saved");
}

export async function completeTaskAction(id: string, notes: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await guard();
    const supabase = await getServerClient();
    const { error } = await supabase.from("follow_up_tasks").update({
      status: "completed", completed_at: new Date().toISOString(), completed_by: ws.user.id, completion_notes: notes.slice(0, 2000) || null,
    }).eq("id", id).eq("organization_id", ws.organization.id);
    if (error) throw error;
    revalidatePath("/tasks");
    return null;
  }, "Marked complete");
}

export async function setTaskStatusAction(id: string, status: "open" | "in_progress" | "cancelled"): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await guard();
    z.enum(["open", "in_progress", "cancelled"]).parse(status);
    const supabase = await getServerClient();
    const { error } = await supabase.from("follow_up_tasks").update({ status, completed_at: null, completed_by: null })
      .eq("id", id).eq("organization_id", ws.organization.id);
    if (error) throw error;
    revalidatePath("/tasks");
    return null;
  }, "Follow-up updated");
}

export async function snoozeTaskAction(id: string, days: number): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await guard();
    const n = z.number().int().min(1).max(90).parse(days);
    const until = addDays(todayIn(ws.organization.timezone), n);
    const supabase = await getServerClient();
    const { error } = await supabase.from("follow_up_tasks").update({ snoozed_until: until, due_date: until })
      .eq("id", id).eq("organization_id", ws.organization.id);
    if (error) throw error;
    revalidatePath("/tasks");
    return null;
  }, `Snoozed for ${days} day${days === 1 ? "" : "s"}`);
}

export async function deleteTaskAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await guard();
    const supabase = await getServerClient();
    const { error, count } = await supabase.from("follow_up_tasks").delete({ count: "exact" }).eq("id", id).eq("organization_id", ws.organization.id);
    if (error) throw error;
    if (!count) fail("Only managers can delete follow-ups. Cancel it instead.", "forbidden");
    revalidatePath("/tasks");
    return null;
  }, "Follow-up deleted");
}
