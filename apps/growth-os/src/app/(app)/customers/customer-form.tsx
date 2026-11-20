"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTrigger } from "@platform/ui";
import { ActionForm } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { createCustomerAction, updateCustomerAction } from "@/server/customer-actions";

export interface CustomerFormValues {
  id?: string; full_name?: string; phone?: string | null; email?: string | null; location?: string | null;
  address?: string | null; notes?: string | null; source?: string | null;
}

const SOURCES = ["instagram", "whatsapp", "tiktok", "facebook", "walk-in", "referral", "website", "other"];

export function CustomerDialog({ customer, defaultOpen = false, trigger, onCreated }: {
  customer?: CustomerFormValues; defaultOpen?: boolean; trigger?: React.ReactNode; onCreated?: (id: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const router = useRouter();
  const editing = Boolean(customer?.id);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (editing ? <Button variant="outline" size="sm"><Pencil /> Edit</Button> : <Button><UserPlus /> New customer</Button>)}
      </DialogTrigger>
      <DialogContent title={editing ? "Edit customer" : "New customer"} description={editing ? undefined : "Only a name is required — add the rest any time."}>
        <ActionForm
          action={editing ? updateCustomerAction : createCustomerAction}
          className="space-y-4"
          onSuccess={(d) => {
            setOpen(false);
            const id = (d as { id?: string } | null)?.id;
            if (id && onCreated) onCreated(id);
            else if (id) router.push(`/customers/${id}`);
          }}
        >
          {({ pending }) => (
            <>
              {customer?.id && <input type="hidden" name="id" value={customer.id} />}
              <TextField name="full_name" label="Full name" required defaultValue={customer?.full_name} autoFocus autoComplete="off" />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField name="phone" label="Phone / WhatsApp" type="tel" inputMode="tel" defaultValue={customer?.phone ?? ""} placeholder="0803 000 0000" />
                <TextField name="email" label="Email" type="email" inputMode="email" defaultValue={customer?.email ?? ""} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField name="location" label="Location" defaultValue={customer?.location ?? ""} placeholder="Lekki, Lagos" />
                <SelectField name="source" label="How they found you" defaultValue={customer?.source ?? ""}>
                  <option value="">—</option>
                  {SOURCES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
                </SelectField>
              </div>
              <TextAreaField name="address" label="Delivery address" defaultValue={customer?.address ?? ""} className="[&_textarea]:min-h-[60px]" />
              <TextAreaField name="notes" label="Notes" defaultValue={customer?.notes ?? ""} placeholder="Sizes, preferences, birthdays…" />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" loading={pending}>{editing ? "Save changes" : "Add customer"}</Button>
              </div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
