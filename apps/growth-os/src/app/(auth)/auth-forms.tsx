"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Button } from "@platform/ui";
import { ActionForm } from "@/components/action-form";
import { TextField } from "@/components/form-fields";
import {
  forgotPasswordAction, resendVerificationAction, resetPasswordAction, signInAction, signUpAction,
} from "@/server/auth-actions";

export function RegisterForm() {
  return (
    <ActionForm action={signUpAction} refresh={false} className="space-y-4">
      {({ pending }) => (
        <>
          <TextField name="fullName" label="Full name" autoComplete="name" required placeholder="Adaeze Okafor" />
          <TextField name="email" label="Email address" type="email" autoComplete="email" inputMode="email" required placeholder="you@business.com" />
          <TextField name="password" label="Password" type="password" autoComplete="new-password" required hint="At least 8 characters with a letter and a number" />
          <TextField name="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" required />
          <Button type="submit" className="w-full" loading={pending}>Create account</Button>
          <p className="text-center text-xs text-muted-foreground">7-day free trial · No card required</p>
        </>
      )}
    </ActionForm>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [unverified, setUnverified] = useState<string | null>(null);
  return (
    <>
      {unverified && (
        <div className="mb-4">
          <Alert tone="warning" title="Verify your email first">
            <ResendVerification email={unverified} />
          </Alert>
        </div>
      )}
      <ActionForm
        action={signInAction}
        refresh={false}
        className="space-y-4"
        onSuccess={(d) => setUnverified((d as { unverified?: string } | null)?.unverified ?? null)}
      >
        {({ pending }) => (
          <>
            <input type="hidden" name="next" value={next ?? ""} />
            <TextField name="email" label="Email address" type="email" autoComplete="email" inputMode="email" required />
            <div className="space-y-1.5">
              <TextField name="password" label="Password" type="password" autoComplete="current-password" required />
              <div className="text-right">
                <Link href="/forgot-password" className="text-xs font-medium text-primary">Forgot password?</Link>
              </div>
            </div>
            <Button type="submit" className="w-full" loading={pending}>Sign in</Button>
          </>
        )}
      </ActionForm>
    </>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  if (sent) {
    return <Alert tone="success" title="Check your email">If an account exists for that address, we&apos;ve sent a link to reset your password.</Alert>;
  }
  return (
    <ActionForm action={forgotPasswordAction} refresh={false} successToast={false} onSuccess={() => setSent(true)} className="space-y-4">
      {({ pending }) => (
        <>
          <TextField name="email" label="Email address" type="email" autoComplete="email" required />
          <Button type="submit" className="w-full" loading={pending}>Send reset link</Button>
        </>
      )}
    </ActionForm>
  );
}

export function ResetPasswordForm() {
  return (
    <ActionForm action={resetPasswordAction} refresh={false} className="space-y-4">
      {({ pending }) => (
        <>
          <TextField name="password" label="New password" type="password" autoComplete="new-password" required hint="At least 8 characters with a letter and a number" />
          <TextField name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" required />
          <Button type="submit" className="w-full" loading={pending}>Update password</Button>
        </>
      )}
    </ActionForm>
  );
}

export function ResendVerification({ email }: { email: string }) {
  return (
    <ActionForm action={resendVerificationAction} refresh={false} className="mt-2">
      {({ pending }) => (
        <>
          <input type="hidden" name="email" value={email} />
          <Button type="submit" variant="outline" size="sm" loading={pending}>Resend verification email</Button>
        </>
      )}
    </ActionForm>
  );
}
