"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { Alert, Button, Card, CardContent, Field, Input } from "@platform/ui";
import { signInAction } from "@/lib/actions";

export default function Login() {
  const [state, action, pending] = useActionState(signInAction, null);
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h1 className="font-semibold">Platform administration</h1></div>
          <p className="text-sm text-muted-foreground">Internal staff only. All actions are logged.</p>
          {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
          <form action={action} className="space-y-4">
            <Field label="Email"><Input name="email" type="email" required autoComplete="username" /></Field>
            <Field label="Password"><Input name="password" type="password" required autoComplete="current-password" /></Field>
            <Button className="w-full" loading={pending}>Sign in</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
