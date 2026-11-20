"use client";

import * as React from "react";
import { Field, Input, Select, Textarea } from "@platform/ui";
import { useFieldError } from "./action-form";

type Common = { name: string; label?: string; hint?: React.ReactNode; required?: boolean; className?: string };

export function TextField({ name, label, hint, required, className, ...props }: Common & React.InputHTMLAttributes<HTMLInputElement>) {
  const error = useFieldError(name);
  const id = `f-${name}`;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required} className={className}>
      <Input id={id} name={name} aria-invalid={Boolean(error)} required={required} {...props} />
    </Field>
  );
}

export function TextAreaField({ name, label, hint, required, className, ...props }: Common & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const error = useFieldError(name);
  const id = `f-${name}`;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required} className={className}>
      <Textarea id={id} name={name} aria-invalid={Boolean(error)} {...props} />
    </Field>
  );
}

export function SelectField({ name, label, hint, required, className, children, ...props }: Common & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const error = useFieldError(name);
  const id = `f-${name}`;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required} className={className}>
      <Select id={id} name={name} aria-invalid={Boolean(error)} {...props}>{children}</Select>
    </Field>
  );
}

/** Money input: numeric keyboard on mobile, 2dp, no negative values. */
export function MoneyField({ name, label, hint, required, className, currency = "₦", ...props }: Common & React.InputHTMLAttributes<HTMLInputElement> & { currency?: string }) {
  const error = useFieldError(name);
  const id = `f-${name}`;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required} className={className}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currency}</span>
        <Input id={id} name={name} type="number" inputMode="decimal" step="0.01" min="0" className="pl-7 tabular" aria-invalid={Boolean(error)} {...props} />
      </div>
    </Field>
  );
}
