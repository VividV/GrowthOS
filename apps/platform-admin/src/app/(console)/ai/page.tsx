import { Card, CardContent, CardHeader, CardTitle, PageHeader, StatCard, TBody, THead, TR, Table, formatNumber } from "@platform/ui";
import { db, requireStaff, WRITE_ROLES } from "@/lib/staff";
import { AiSettings } from "../ui";

export const metadata = { title: "AI usage" };

export default async function AiUsage() {
  const staff = await requireStaff("ai");
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: logs }, { data: setting }, { data: orgs }] = await Promise.all([
    db().from("ai_usage_logs").select("organization_id, model, input_tokens, output_tokens, estimated_cost_usd, status, tool_calls").gte("created_at", since).limit(50000),
    db().from("platform_settings").select("value").eq("key", "ai").single(),
    db().from("organizations").select("id, name"),
  ]);
  const names = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]));
  const rows = logs ?? [];
  const byOrg = new Map<string, { req: number; cost: number; tokens: number; errors: number }>();
  const byModel = new Map<string, { req: number; cost: number }>();
  for (const r of rows) {
    const o = byOrg.get(r.organization_id as string) ?? { req: 0, cost: 0, tokens: 0, errors: 0 };
    o.req += 1; o.cost += Number(r.estimated_cost_usd); o.tokens += Number(r.input_tokens) + Number(r.output_tokens); if (r.status === "error") o.errors += 1;
    byOrg.set(r.organization_id as string, o);
    const m = byModel.get(r.model as string) ?? { req: 0, cost: 0 };
    m.req += 1; m.cost += Number(r.estimated_cost_usd); byModel.set(r.model as string, m);
  }
  const total = [...byOrg.values()].reduce((a, o) => ({ req: a.req + o.req, cost: a.cost + o.cost, errors: a.errors + o.errors }), { req: 0, cost: 0, errors: 0 });
  const v = setting?.value as { provider: string; model: string };

  return (
    <>
      <PageHeader title="AI usage & providers" description="Last 30 days. Costs are estimates from token counts × list price." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Requests" value={formatNumber(total.req)} />
        <StatCard label="Estimated cost" value={`$${total.cost.toFixed(2)}`} />
        <StatCard label="Avg cost / request" value={total.req ? `$${(total.cost / total.req).toFixed(4)}` : "—"} />
        <StatCard label="Errors" value={formatNumber(total.errors)} tone={total.errors ? "warning" : "default"} />
      </div>
      <Card>
        <CardHeader><CardTitle>Provider configuration</CardTitle></CardHeader>
        <CardContent>{WRITE_ROLES.ai!.includes(staff.role) ? <AiSettings provider={v.provider} model={v.model} configured={false} /> : <p className="text-sm">{v.provider} · {v.model}</p>}</CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader><CardTitle>Top workspaces by cost</CardTitle></CardHeader>
          <Table>
            <THead><tr><th>Workspace</th><th className="text-right">Requests</th><th className="text-right">Tokens</th><th className="text-right">Cost (USD)</th></tr></THead>
            <TBody>
              {[...byOrg.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 25).map(([id, o]) => (
                <TR key={id}><td className="text-sm">{names.get(id) ?? id}</td><td className="text-right tabular">{o.req}</td><td className="text-right tabular">{formatNumber(o.tokens)}</td><td className="text-right tabular">{o.cost.toFixed(3)}</td></TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>By model</CardTitle></CardHeader>
          <Table>
            <THead><tr><th>Model</th><th className="text-right">Requests</th><th className="text-right">Cost</th></tr></THead>
            <TBody>{[...byModel.entries()].map(([m, x]) => <TR key={m}><td className="font-mono text-xs">{m}</td><td className="text-right tabular">{x.req}</td><td className="text-right tabular">${x.cost.toFixed(2)}</td></TR>)}</TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
