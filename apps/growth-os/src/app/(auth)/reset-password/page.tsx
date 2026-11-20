import Link from "next/link";
import { Alert } from "@platform/ui";
import { getUser } from "@platform/auth";
import { ResetPasswordForm } from "../auth-forms";

export const metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";

export default async function ResetPassword() {
  // The recovery link (via /auth/confirm) establishes a short-lived session.
  const user = await getUser();
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        {user?.email && <p className="text-sm text-muted-foreground">For {user.email}</p>}
      </div>
      {user ? (
        <ResetPasswordForm />
      ) : (
        <Alert tone="warning" title="This reset link has expired">
          <Link href="/forgot-password" className="font-medium underline">Request a new link</Link>
        </Alert>
      )}
    </div>
  );
}
