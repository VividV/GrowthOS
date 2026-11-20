"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTrigger } from "@platform/ui";
import { ActionForm } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { saveTaskAction } from "@/server/task-actions";

export interface TaskValues {
  id?: string; title?: string; description?: string | null; customer_id?: string | null; order_id?: string | null;
  due_date?: string; priority?: string; assigned_to?: string | null; suggestion_key?: string | null;
}

export function TaskDialog({
  task, members, customers, customerId, trigger, defaultOpen, currentUserId, canAssign, title,
}: {
  task?: TaskValues; members: { id: string; name: string }[]; customers?: { id: string; full_name: string }[];
  customerId?: string; trigger?: React.ReactNode; defaultOpen?: boolean; currentUserId: string; canAssign: boolean; title?: string;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const today = new Date().toISOString().slice(0, 10);
  const assignable = canAssign ? members : members.filter((m) => m.id === currentUserId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button><Plus /> New follow-up</Button>}</DialogTrigger>
      <DialogContent title={title ?? (task?.id ? "Edit follow-up" : "New follow-up")}>
        <ActionForm action={saveTaskAction} className="space-y-4" onSuccess={() => setOpen(false)}>
          {({ pending }) => (
            <>
              {task?.id && <input type="hidden" name="id" value={task.id} />}
              {task?.suggestion_key && <input type="hidden" name="suggestion_key" value={task.suggestion_key} />}
              {task?.order_id && <input type="hidden" name="order_id" value={task.order_id} />}
              <TextField name="title" label="What needs doing?" required defaultValue={task?.title} placeholder="Call Ngozi about her balance" autoFocus />
              <TextAreaField name="description" label="Details" defaultValue={task?.description ?? ""} className="[&_textarea]:min-h-[60px]" />
              {customerId || task?.customer_id ? (
                <input type="hidden" name="customer_id" value={customerId ?? task?.customer_id ?? ""} />
              ) : customers ? (
                <SelectField name="customer_id" label="Customer" defaultValue="">
                  <option value="">No customer</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </SelectField>
              ) : null}
              <div className="grid grid-cols-2 gap-4">
                <TextField name="due_date" label="Due" type="date" required defaultValue={task?.due_date ?? today} />
                <SelectField name="priority" label="Priority" defaultValue={task?.priority ?? "medium"}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                </SelectField>
              </div>
              <SelectField name="assigned_to" label="Assign to" defaultValue={task?.assigned_to ?? currentUserId}>
                <option value="">Unassigned</option>
                {assignable.map((m) => <option key={m.id} value={m.id}>{m.id === currentUserId ? `${m.name} (me)` : m.name}</option>)}
              </SelectField>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" loading={pending}>Save</Button>
              </div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
