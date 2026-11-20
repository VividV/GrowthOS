import { requireWorkspace } from "@platform/auth";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@platform/ui";
import { AccountForms } from "./account-forms";

export const metadata = { title: "Account" };

export default async function Account() {
  const ws = await requireWorkspace();
  const name = (ws.user.user_metadata?.full_name as string | undefined) ?? "";
  if (ws.user.is_anonymous) {
    return (
      <div className="max-w-xl space-y-4">
        <Alert tone="info" title="You're exploring as a guest">Save your account to keep this demo and set up your own business with a free 7-day trial.</Alert>
        <Card><CardHeader><CardTitle>Create your account</CardTitle></CardHeader><CardContent><AccountForms mode="convert" name="" email="" /></CardContent></Card>
      </div>
    );
  }
  return (
    <div className="grid max-w-3xl gap-4">
      <Card><CardHeader><CardTitle>Profile</CardTitle></CardHeader><CardContent><AccountForms mode="profile" name={name} email={ws.user.email ?? ""} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Email address</CardTitle><CardDescription>We&apos;ll send a confirmation link to the new address.</CardDescription></CardHeader><CardContent><AccountForms mode="email" name={name} email={ws.user.email ?? ""} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Password</CardTitle></CardHeader><CardContent><AccountForms mode="password" name={name} email="" /></CardContent></Card>
    </div>
  );
}
