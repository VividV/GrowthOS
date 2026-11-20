import Link from "next/link";
import { ForgotPasswordForm } from "../auth-forms";

export const metadata = { title: "Reset your password" };

export default function ForgotPassword() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">Enter your email and we&apos;ll send you a reset link.</p>
      </div>
      <ForgotPasswordForm />
      <p className="text-center text-sm"><Link href="/login" className="font-medium text-primary">Back to sign in</Link></p>
    </div>
  );
}
