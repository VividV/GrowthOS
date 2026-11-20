"use client";

import { useState, useTransition } from "react";
import { Plus, Receipt, TrendingUp } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTrigger, Field, Input, toast } from "@platform/ui";
import { ActionForm } from "@/components/action-form";
import { MoneyField, SelectField, TextField } from "@/components/form-fields";
import { createExpenseCategoryAction, saveExpenseAction, saveIncomeAction } from "@/server/finance-actions";

export function ExpenseDialog({ categories: initial, today, defaultOpen }: { categories: { id: string; name: string }[]; today: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [categories, setCategories] = useState(initial);
  const [selected, setSelected] = useState("");
  const [newCat, setNewCat] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Receipt /> Record expense</Button></DialogTrigger>
      <DialogContent title="Record expense">
        <ActionForm action={saveExpenseAction} className="space-y-4" onSuccess={() => setOpen(false)}>
          {({ pending: saving }) => (
            <>
              <MoneyField name="amount" label="Amount" required autoFocus className="[&_input]:h-12 [&_input]:text-lg [&_input]:font-semibold" />
              <TextField name="description" label="What was it for?" required placeholder="Dispatch rider – Lekki deliveries" />
              <div className="grid grid-cols-2 gap-3">
                <SelectField name="category_id" label="Category" required value={selected} onChange={(e) => setSelected(e.target.value)}>
                  <option value="">Choose…</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectField>
                <TextField name="expense_date" label="Date" type="date" required defaultValue={today} max={today} />
              </div>
              <Field label="New category" hint="Create your own, e.g. Internet, Bank charges">
                <div className="flex gap-2">
                  <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} />
                  <Button type="button" variant="outline" disabled={!newCat.trim()} loading={pending} onClick={() => start(async () => {
                    const r = await createExpenseCategoryAction(newCat);
                    if (r.ok) { setCategories((c) => [...c, r.data]); setSelected(r.data.id); setNewCat(""); } else toast.error(r.error);
                  })}><Plus /></Button>
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <TextField name="vendor" label="Paid to" placeholder="Vendor" />
                <SelectField name="payment_method" label="Paid by" defaultValue="">
                  <option value="">—</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="pos">POS</option>
                  <option value="card">Card</option><option value="mobile_money">Mobile money</option><option value="other">Other</option>
                </SelectField>
              </div>
              <TextField name="reference" label="Reference" />
              <Button type="submit" className="w-full" loading={saving}>Save expense</Button>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function IncomeDialog({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><TrendingUp /> Other income</Button></DialogTrigger>
      <DialogContent title="Record other income" description="Income that isn't from an order — services, commissions, grants. Order payments are recorded on the order.">
        <ActionForm action={saveIncomeAction} className="space-y-4" onSuccess={() => setOpen(false)}>
          {({ pending }) => (
            <>
              <MoneyField name="amount" label="Amount" required autoFocus />
              <TextField name="description" label="Description" required placeholder="Styling consultation" />
              <div className="grid grid-cols-2 gap-3">
                <TextField name="income_date" label="Date" type="date" required defaultValue={today} max={today} />
                <TextField name="source" label="Source" placeholder="Services" />
              </div>
              <Button type="submit" className="w-full" loading={pending}>Save</Button>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
