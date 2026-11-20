import { Badge, Card, CardHeader, CardTitle, PageHeader, TBody, THead, TR, Table, formatDate, formatDateTime, formatMoney } from "@platform/ui";
import { db, requireStaff } from "@/lib/staff";

export const metadata = { title: "Subscriptions" };

export default async function Subscriptions() {
  await requireStaff("subscriptions");
  const [{ data: subs }, { data: txs }, { data: events }] = await Promise.all([
    db().from("admin_workspace_overview").select("id, name, owner_email, subscription_status, subscription_state, plan_name, plan_price, trial_ends_at, current_period_end").eq("is_demo", false).order("current_period_end", { ascending: false, nullsFirst: false }).limit(200),
    db().from("payment_transactions").select("reference, amount, currency, status, paid_at, created_at, channel, failure_reason, organizations(name), subscription_plans(name)").order("created_at", { ascending: false }).limit(100),
    db().from("payment_events").select("event_type, received_at, processed_at, error").order("received_at", { ascending: false }).limit(30),
  ]);
  return (
    <>
      <PageHeader title="Subscriptions & payments" />
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Subscriptions</CardTitle></CardHeader>
        <Table>
          <THead><tr><th>Workspace</th><th>Plan</th><th>Status (stored / effective)</th><th>Trial ends</th><th>Period ends</th></tr></THead>
          <TBody>
            {(subs ?? []).map((s) => (
              <TR key={s.id as string}>
                <td><p className="text-sm font-medium">{s.name as string}</p><p className="text-xs text-muted-foreground">{s.owner_email as string}</p></td>
                <td className="text-sm">{s.plan_name as string} · {formatMoney(s.plan_price as number, "NGN")}</td>
                <td className="text-sm">{s.subscription_status as string} / <Badge tone={s.subscription_state === "active" ? "success" : s.subscription_state === "expired" ? "danger" : "info"}>{s.subscription_state as string}</Badge></td>
                <td className="text-sm">{formatDate(s.trial_ends_at as string)}</td>
                <td className="text-sm">{formatDate(s.current_period_end as string)}</td>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Payment transactions</CardTitle></CardHeader>
        <Table>
          <THead><tr><th>When</th><th>Workspace</th><th>Plan</th><th>Reference</th><th>Status</th><th className="text-right">Amount</th></tr></THead>
          <TBody>
            {(txs ?? []).map((t) => (
              <TR key={t.reference as string}>
                <td className="whitespace-nowrap text-sm">{formatDateTime((t.paid_at ?? t.created_at) as string)}</td>
                <td className="text-sm">{(t.organizations as unknown as { name: string } | null)?.name}</td>
                <td className="text-sm">{(t.subscription_plans as unknown as { name: string } | null)?.name}</td>
                <td className="font-mono text-xs">{t.reference as string}</td>
                <td><Badge tone={t.status === "success" ? "success" : t.status === "pending" ? "neutral" : "danger"}>{t.status as string}</Badge>{t.failure_reason ? <span className="block text-xs text-danger">{t.failure_reason as string}</span> : null}</td>
                <td className="text-right tabular">{formatMoney(t.amount as number, t.currency as string)}</td>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Recent webhook events</CardTitle></CardHeader>
        <Table>
          <THead><tr><th>Received</th><th>Event</th><th>Processed</th><th>Error</th></tr></THead>
          <TBody>
            {(events ?? []).map((e, i) => (
              <TR key={i}><td className="text-sm">{formatDateTime(e.received_at as string)}</td><td className="font-mono text-xs">{e.event_type as string}</td>
                <td className="text-sm">{e.processed_at ? "✓" : "—"}</td><td className="text-xs text-danger">{(e.error as string) ?? ""}</td></TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
