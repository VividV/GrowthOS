import { Check } from "lucide-react";
import { requireWorkspace } from "@platform/auth";
import { getServerClient } from "@platform/database/server";
import { ENTITLEMENT_LABELS, daysLeft, subscriptionBanner, usagePercent } from "@platform/billing";
import { isPaystackConfigured } from "@platform/billing/paystack";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress, TBody, THead, TR, Table, cn, formatDate, formatMoney } from "@platform/ui";
import { CancelButton, CheckoutButton } from "./billing-buttons";

export const metadata = { title: "Plan & billing" };

type Plan = { id: string; code: string; name: string; description: string | null; price: number; currency: string; features: string[]; sort_order: number };

export default async function Billing({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const sp = await searchParams;
  const ws = await requireWorkspace();
  const supabase = await getServerClient();
  const owner = ws.can("billing.manage");
  const [{ data: plans }, { data: usage }, { data: payments }] = await Promise.all([
    supabase.from("subscription_plans").select("id, code, name, description, price, currency, features, sort_order").eq("is_public", true).eq("is_active", true).order("sort_order"),
    supabase.rpc("workspace_usage", { p_org: ws.organization.id }),
    owner ? supabase.from("payment_transactions").select("reference, amount, currency, status, paid_at, created_at, channel, subscription_plans(name)").eq("organization_id", ws.organization.id).order("created_at", { ascending: false }).limit(24) : Promise.resolve({ data: [] }),
  ]);
  const sub = ws.subscription;
  const u = (usage ?? {}) as Record<string, number>;
  const banner = subscriptionBanner(sub ? { ...sub } : { state: "none" });
  const current = sub?.plan_code;
  const isPaid = sub?.state === "active" || sub?.state === "past_due";

  if (ws.organization.is_demo) return <Alert tone="info" title="This is a demo workspace">Demo workspaces don&apos;t have a subscription. Switch to your own business to choose a plan.</Alert>;

  const meters = [
    { key: "max_users", used: u.users ?? 0 }, { key: "max_products", used: u.products ?? 0 }, { key: "max_customers", used: u.customers ?? 0 },
    { key: "max_orders_per_month", used: u.orders_this_month ?? 0 }, { key: "ai_messages_per_month", used: u.ai_messages_this_month ?? 0 },
  ];

  return (
    <div className="space-y-5">
      {sp.payment === "success" && <Alert tone="success" title="Payment confirmed">Your subscription is active. Thank you!</Alert>}
      {sp.payment === "pending" && <Alert tone="info" title="We're confirming your payment">This can take a minute. Refresh shortly — you won't be charged twice.</Alert>}
      {sp.payment === "mismatch" && <Alert tone="danger">The amount paid didn&apos;t match the plan price. Please contact support.</Alert>}
      {banner && <Alert tone={banner.tone} title={banner.title}>{banner.body}</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Current plan</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-2xl font-semibold">{sub?.plan_name ?? "None"}{sub?.state === "trialing" && <Badge tone="info" className="ml-2 align-middle">Free trial</Badge>}</p>
            {sub?.state === "trialing" && <p className="text-muted-foreground">Trial ends {formatDate(sub.trial_ends_at, { day: "numeric", month: "long", year: "numeric" })} ({daysLeft(sub.trial_ends_at)} days left). You get the full Growth plan during the trial.</p>}
            {isPaid && <p className="text-muted-foreground">{sub?.cancel_at_period_end ? "Access until" : "Renews"} {formatDate(sub?.current_period_end, { day: "numeric", month: "long", year: "numeric" })}</p>}
            {sub?.state === "expired" && <p className="text-danger">Expired — your workspace is read-only. All data is kept.</p>}
            {owner && sub?.status === "active" && !sub.cancel_at_period_end && <div className="pt-2"><CancelButton /></div>}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Usage</CardTitle><CardDescription>Limits reset monthly where noted.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {meters.map((m) => {
              const limit = ws.entitlements[m.key]?.limit ?? null;
              const pct = usagePercent(m.used, limit);
              return (
                <div key={m.key} className="space-y-1.5">
                  <div className="flex justify-between text-sm"><span>{ENTITLEMENT_LABELS[m.key]}</span><span className="tabular text-muted-foreground">{m.used}{limit === null ? " · unlimited" : ` / ${limit}`}</span></div>
                  <Progress value={pct ?? 4} tone={pct !== null && pct >= 90 ? "danger" : pct !== null && pct >= 75 ? "warning" : "primary"} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {!owner ? <Alert tone="info">Only the workspace owner can change the plan.</Alert> : (
        <>
          {!isPaystackConfigured() && <Alert tone="warning" title="Online payments are not configured">Set PAYSTACK_SECRET_KEY on the server to enable checkout.</Alert>}
          <div className="grid gap-4 md:grid-cols-3">
            {((plans ?? []) as Plan[]).map((p) => {
              const isCurrent = current === p.code && isPaid;
              const highlight = p.code === "growth";
              return (
                <Card key={p.id} className={cn("flex flex-col", highlight && "border-primary ring-1 ring-primary")}>
                  <CardHeader>
                    <div className="flex items-center justify-between"><CardTitle className="text-base">{p.name}</CardTitle>{highlight && <Badge tone="primary">Most popular</Badge>}</div>
                    <p className="pt-2"><span className="text-3xl font-semibold tabular">{formatMoney(p.price, p.currency)}</span><span className="text-sm text-muted-foreground">/month</span></p>
                    <CardDescription>{p.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <ul className="flex-1 space-y-2 text-sm">
                      {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{f}</li>)}
                    </ul>
                    <div className="pt-5">
                      {isCurrent ? <Badge tone="success" className="w-full justify-center py-2">Current plan</Badge>
                        : <CheckoutButton planCode={p.code} label={isPaid ? `Switch to ${p.name}` : `Choose ${p.name}`} disabled={!isPaystackConfigured()} variant={highlight ? "default" : "outline"} />}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Payments are processed securely by Paystack — Growth OS never sees or stores your card details. Switching plans starts a new monthly period from the day you pay; unused time on the previous plan isn&apos;t prorated. Downgrades require your usage to fit the smaller plan.</p>

          <Card className="overflow-hidden">
            <CardHeader><CardTitle>Payment history</CardTitle></CardHeader>
            <CardContent className="p-0 sm:p-0 pt-3">
              {(payments ?? []).length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">No payments yet.</p> : (
                <Table>
                  <THead><tr><th>Date</th><th>Plan</th><th>Reference</th><th>Status</th><th className="text-right">Amount</th></tr></THead>
                  <TBody>
                    {(payments ?? []).map((t) => (
                      <TR key={t.reference as string}>
                        <td className="text-sm">{formatDate((t.paid_at ?? t.created_at) as string)}</td>
                        <td className="text-sm">{(t.subscription_plans as unknown as { name: string } | null)?.name}</td>
                        <td className="font-mono text-xs">{t.reference as string}</td>
                        <td><Badge tone={t.status === "success" ? "success" : t.status === "pending" ? "neutral" : "danger"}>{t.status as string}</Badge></td>
                        <td className="text-right tabular">{formatMoney(t.amount as number, t.currency as string)}</td>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
