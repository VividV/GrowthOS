import { Alert, Card, CardContent, CardHeader, CardTitle, PageHeader, StatCard, formatMoney, formatNumber } from "@platform/ui";
import { db, requireStaff } from "@/lib/staff";

export const metadata = { title: "Overview" };

export default async function Overview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const sp = await searchParams;
  await requireStaff("overview");
  const { data, error } = await db().rpc("admin_platform_metrics");
  if (error) throw new Error(error.message);
  type Metrics = { users: number; workspaces: number; demo_workspaces: number; trialing: number; active: number; expired: number; mrr: number; revenue_30d: number;
    ai_requests_30d: number; ai_cost_30d_usd: number; open_support_requests: number; errors_24h: number; signups_by_day: { day: string; n: number }[] };
  const m = data as Metrics;
  const maxSignup = Math.max(1, ...m.signups_by_day.map((s) => s.n));
  const conversion = m.active + m.expired > 0 ? Math.round((m.active / (m.active + m.expired)) * 100) : null;
  return (
    <>
      <PageHeader title="Platform overview" description="Aggregate metrics across all products and workspaces." />
      {sp.denied && <Alert tone="warning">Your internal role can&apos;t open that area.</Alert>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Users" value={formatNumber(m.users)} />
        <StatCard label="Business workspaces" value={formatNumber(m.workspaces)} hint={`${m.demo_workspaces} demo`} />
        <StatCard label="MRR" value={formatMoney(m.mrr, "NGN")} hint={`${m.active} paying`} />
        <StatCard label="Revenue (30 days)" value={formatMoney(m.revenue_30d, "NGN")} />
        <StatCard label="On trial" value={formatNumber(m.trialing)} />
        <StatCard label="Expired / read-only" value={formatNumber(m.expired)} hint={conversion !== null ? `${conversion}% of ended trials paid` : undefined} />
        <StatCard label="AI requests (30d)" value={formatNumber(m.ai_requests_30d)} hint={`$${Number(m.ai_cost_30d_usd).toFixed(2)} est. cost`} />
        <StatCard label="Errors (24h)" value={formatNumber(m.errors_24h)} tone={m.errors_24h > 0 ? "warning" : "default"} hint={`${m.open_support_requests} open support`} />
      </div>
      <Card>
        <CardHeader><CardTitle>Sign-ups, last 30 days</CardTitle></CardHeader>
        <CardContent>
          {m.signups_by_day.length === 0 ? <p className="text-sm text-muted-foreground">No sign-ups yet.</p> : (
            <div className="flex h-32 items-end gap-1">
              {m.signups_by_day.map((s) => (
                <div key={s.day} className="flex-1 rounded-t bg-primary/80" style={{ height: `${(s.n / maxSignup) * 100}%` }} title={`${s.day}: ${s.n}`} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
