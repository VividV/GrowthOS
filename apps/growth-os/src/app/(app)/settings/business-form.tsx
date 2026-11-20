"use client";

import { useMemo, useState } from "react";
import { Building2, ImagePlus } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox } from "@platform/ui";
import { ActionForm } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { updateBusinessAction } from "@/server/settings-actions";

type V = { name: string; category: string; description: string; currency: string; timezone: string; business_email: string; phone: string; address: string; order_prefix: string; stock_policy: string; allow_negative_stock: boolean };
const TIMEZONES = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Africa/Cairo", "Europe/London", "America/New_York"];
const CURRENCIES = ["NGN", "GHS", "KES", "ZAR", "EGP", "GBP", "USD", "EUR"];

export function BusinessForm({ values, logoUrl }: { values: V; logoUrl: string | null }) {
  const [logo, setLogo] = useState<File | null>(null);
  const preview = useMemo(() => (logo ? URL.createObjectURL(logo) : logoUrl), [logo, logoUrl]);
  return (
    <ActionForm action={updateBusinessAction} className="space-y-5">
      {({ pending }) => (
        <>
          <Card>
            <CardHeader><CardTitle>Business profile</CardTitle><CardDescription>Shown on order summaries and used by the AI assistant for context.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border bg-subtle">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {preview ? <img src={preview} alt="Logo" className="h-full w-full object-cover" /> : <Building2 className="h-6 w-6 text-muted-foreground" />}
                </span>
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent">
                  <ImagePlus className="h-4 w-4" /> Change logo
                  <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField name="name" label="Business name" required defaultValue={values.name} />
                <TextField name="category" label="Category" defaultValue={values.category} />
              </div>
              <TextAreaField name="description" label="Description" defaultValue={values.description} />
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField name="business_email" label="Business email" type="email" defaultValue={values.business_email} />
                <TextField name="phone" label="Phone" type="tel" defaultValue={values.phone} />
                <TextField name="address" label="Address" defaultValue={values.address} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField name="currency" label="Currency" defaultValue={values.currency} hint="Changing currency doesn't convert existing amounts.">
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </SelectField>
                <SelectField name="timezone" label="Timezone" defaultValue={values.timezone} hint="Reports group sales by day in this timezone.">
                  {[...new Set([values.timezone, ...TIMEZONES])].map((t) => <option key={t}>{t}</option>)}
                </SelectField>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Orders & stock</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <TextField name="order_prefix" label="Order number prefix" defaultValue={values.order_prefix} hint="e.g. ADZ → ADZ-1001" className="sm:max-w-xs" />
              <SelectField name="stock_policy" label="When should stock leave inventory?" defaultValue={values.stock_policy}>
                <option value="reserve_on_confirm">Reserve when confirmed, deduct when dispatched (recommended)</option>
                <option value="deduct_on_confirm">Deduct as soon as an order is confirmed</option>
              </SelectField>
              <input type="hidden" name="allow_negative_stock" value="off" />
              <label className="flex items-start gap-2 text-sm">
                <Checkbox name="allow_negative_stock" value="on" defaultChecked={values.allow_negative_stock} className="mt-0.5" />
                <span><span className="font-medium">Allow selling more than you have in stock</span><span className="block text-muted-foreground">Useful for pre-orders. Stock can go negative until you restock.</span></span>
              </label>
            </CardContent>
          </Card>
          <div className="flex justify-end"><Button type="submit" loading={pending}>Save settings</Button></div>
        </>
      )}
    </ActionForm>
  );
}
