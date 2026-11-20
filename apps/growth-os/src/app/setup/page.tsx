import { Alert, Card, CardContent } from "@platform/ui";
import { Logo } from "@/components/logo";

export const metadata = { title: "Setup required" };
export const dynamic = "force-dynamic";

const CHECKS = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", required: true, purpose: "Database, authentication and storage" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true, purpose: "Browser access with row-level security" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", required: true, purpose: "Webhooks, cron jobs and usage logging (server only)" },
  { key: "PAYSTACK_SECRET_KEY", required: false, purpose: "Subscription checkout and renewals" },
  { key: "ANTHROPIC_API_KEY", required: false, purpose: "AI business assistant" },
  { key: "RESEND_API_KEY", required: false, purpose: "Product emails (invitations, receipts, trial reminders)" },
  { key: "CRON_SECRET", required: false, purpose: "Protects the daily maintenance job" },
];

/** Shows which integrations are configured — values are never displayed. */
export default function Setup() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-6">
      <Logo />
      <div>
        <h1 className="text-xl font-semibold">{configured ? "Configuration status" : "Finish setting up Growth OS"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Set these environment variables, then redeploy. See docs/deployment.md.</p>
      </div>
      {!configured && <Alert tone="warning" title="Supabase is not configured">The app cannot run until the required values are set.</Alert>}
      <Card>
        <CardContent className="divide-y p-0 sm:p-0">
          {CHECKS.map((c) => {
            const ok = Boolean(process.env[c.key]);
            return (
              <div key={c.key} className="flex items-start justify-between gap-4 px-4 py-3">
                <div>
                  <p className="font-mono text-xs">{c.key}</p>
                  <p className="text-xs text-muted-foreground">{c.purpose}</p>
                </div>
                <span className={ok ? "text-xs font-medium text-success" : c.required ? "text-xs font-medium text-danger" : "text-xs text-muted-foreground"}>
                  {ok ? "Configured" : c.required ? "Missing" : "Not set (optional)"}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </main>
  );
}
