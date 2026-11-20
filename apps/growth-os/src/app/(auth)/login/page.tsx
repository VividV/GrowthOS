import Link from "next/link";
import { Alert } from "@platform/ui";
import { LoginForm } from "../auth-forms";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; verified?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your Growth OS workspace.</p>
      </div>
      {sp.verified && <Alert tone="success">Email verified — sign in to continue.</Alert>}
      {sp.error && <Alert tone="danger">{sp.error === "link" ? "That link is invalid or has expired. Request a new one." : "Something went wrong. Please try again."}</Alert>}
      <LoginForm next={sp.next} />
      <div className="space-y-2 text-center text-sm text-muted-foreground">
        <p>New to Growth OS? <Link href="/register" className="font-medium text-primary">Start your free trial</Link></p>
        <p><Link href="/demo" className="font-medium text-foreground underline-offset-4 hover:underline">Explore the demo</Link> without signing up</p>
      </div>
    </div>
  );
}
