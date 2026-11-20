import Link from "next/link";
import { MailCheck } from "lucide-react";
import { ResendVerification } from "../auth-forms";

export const metadata = { title: "Verify your email" };

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft">
        <MailCheck className="h-6 w-6 text-primary" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to {email ? <span className="font-medium text-foreground">{email}</span> : "your email"}.
          Click it to activate your account and set up your business.
        </p>
      </div>
      {email && (
        <div className="flex flex-col items-center gap-1">
          <p className="text-xs text-muted-foreground">Didn&apos;t get it? Check spam, then</p>
          <ResendVerification email={email} />
        </div>
      )}
      <p className="text-sm"><Link href="/login" className="font-medium text-primary">Back to sign in</Link></p>
    </div>
  );
}
