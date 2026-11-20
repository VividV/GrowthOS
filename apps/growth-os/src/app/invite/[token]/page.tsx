import Link from "next/link";
import { getUser } from "@platform/auth";
import { Button, Card, CardContent } from "@platform/ui";
import { Logo } from "@/components/logo";
import { AcceptInvite } from "./accept";

export const metadata = { title: "Join a workspace" };
export const dynamic = "force-dynamic";

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getUser();
  const next = encodeURIComponent(`/invite/${token}`);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-subtle p-6">
      <Logo />
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 text-center">
          <h1 className="text-lg font-semibold">You&apos;ve been invited to a Growth OS workspace</h1>
          {user && !user.is_anonymous ? (
            <>
              <p className="text-sm text-muted-foreground">Signed in as {user.email}. The invitation must have been sent to this address.</p>
              <AcceptInvite token={token} />
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Sign in or create an account with the email address the invitation was sent to.</p>
              <div className="flex flex-col gap-2">
                <Button asChild><Link href={`/register?next=${next}`}>Create account</Link></Button>
                <Button asChild variant="outline"><Link href={`/login?next=${next}`}>Sign in</Link></Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
