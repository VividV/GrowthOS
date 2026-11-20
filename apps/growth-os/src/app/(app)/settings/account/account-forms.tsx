"use client";

import { Button } from "@platform/ui";
import { ActionForm } from "@/components/action-form";
import { TextField } from "@/components/form-fields";
import { changeEmailAction, changePasswordAction, updateProfileAction } from "@/server/auth-actions";
import { convertAnonymousAction } from "@/server/settings-actions";

export function AccountForms({ mode, name, email }: { mode: "profile" | "email" | "password" | "convert"; name: string; email: string }) {
  if (mode === "profile") return (
    <ActionForm action={updateProfileAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      {({ pending }) => (<><TextField name="fullName" label="Full name" defaultValue={name} required className="flex-1" /><Button type="submit" loading={pending}>Save</Button></>)}
    </ActionForm>
  );
  if (mode === "email") return (
    <ActionForm action={changeEmailAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      {({ pending }) => (<><TextField name="email" label="Email" type="email" defaultValue={email} required className="flex-1" /><Button type="submit" loading={pending}>Change email</Button></>)}
    </ActionForm>
  );
  if (mode === "password") return (
    <ActionForm action={changePasswordAction} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      {({ pending }) => (<>
        <TextField name="password" label="New password" type="password" autoComplete="new-password" required />
        <TextField name="confirmPassword" label="Confirm" type="password" autoComplete="new-password" required />
        <Button type="submit" loading={pending}>Update</Button>
      </>)}
    </ActionForm>
  );
  return (
    <ActionForm action={convertAnonymousAction} className="space-y-3">
      {({ pending }) => (<>
        <TextField name="fullName" label="Full name" required />
        <TextField name="email" label="Email" type="email" required />
        <TextField name="password" label="Password" type="password" autoComplete="new-password" required hint="At least 8 characters with a letter and a number" />
        <TextField name="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" required />
        <Button type="submit" className="w-full" loading={pending}>Save my account</Button>
      </>)}
    </ActionForm>
  );
}
