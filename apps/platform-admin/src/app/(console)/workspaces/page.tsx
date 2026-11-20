import { Badge, Card, Input, PageHeader, TBody, THead, TR, Table, formatDate, formatMoney } from "@platform/ui";
import { db, requireStaff, WRITE_ROLES } from "@/lib/staff";
import { extendTrialAction, setEntitlementStatusAction } from "@/lib/actions";
import { ActionButton } from "../ui";

export const metadata = { title: "Workspaces" };

const TONE: Record<string, "success" | "info" | "warning" | "danger" | "neutral"> = { active: "success", trialing: "info", past_due: "warning", expired: "danger", demo: "neutral", none: "neutral" };

export default async function Workspaces({ searchParams }: { searchParams: Promise<{ q?: string; state?: string }> }) {
  const sp = await searchParams;
  const staff = await requireStaff("workspaces");
  const canWrite = WRITE_ROLES.workspaces!.includes(staff.role);
  let q = db().from("admin_workspace_overview").select("*").order("created_at", { ascending: false }).limit(200);
  if (sp.q) q = q.ilike("name", `%${sp.q.replace(/[%_]/g, "")}%`);
  if (sp.state) q = q.eq("subscription_state", sp.state);
  const [{ data, error }, { data: ents }] = await Promise.all([q, db().from("organization_products").select("organization_id, status")]);
  if (error) throw new Error(error.message);
  const suspended = new Set((ents ?? []).filter((e) => e.status === "suspended").map((e) => e.organization_id));

  return (
    <>
      <PageHeader title="Workspaces" description="Subscription state and record counts only — no business record contents." />
      <form className="flex gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Search by business name" className="max-w-xs" />
        <select name="state" defaultValue={sp.state ?? ""} className="h-9 rounded-md border px-2 text-sm">
          <option value="">All states</option>{["trialing", "active", "past_due", "expired", "demo"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className="rounded-md border px-3 text-sm">Filter</button>
      </form>
      <Card className="overflow-hidden">
        <Table>
          <THead><tr><th>Workspace</th><th>Owner</th><th>Plan / state</th><th className="text-right">Members</th><th className="text-right">Customers</th><th className="text-right">Orders</th><th className="text-right">AI $ (month)</th><th /></tr></THead>
          <TBody>
            {(data ?? []).map((w) => (
              <TR key={w.id as string}>
                <td><p className="font-medium">{w.name as string}</p><p className="text-xs text-muted-foreground">{w.country as string} · created {formatDate(w.created_at as string)}</p></td>
                <td className="text-sm">{w.owner_email as string}</td>
                <td>
                  <Badge tone={TONE[w.subscription_state as string] ?? "neutral"}>{w.subscription_state as string}</Badge>
                  <p className="mt-1 text-xs text-muted-foreground">{w.plan_name ? `${w.plan_name} · ${formatMoney(w.plan_price as number, "NGN")}` : "—"}{w.subscription_state === "trialing" ? ` · ends ${formatDate(w.trial_ends_at as string)}` : ""}</p>
                  {suspended.has(w.id) && <Badge tone="danger" className="mt-1">Growth OS suspended</Badge>}
                </td>
                <td className="text-right tabular">{w.members as number}</td>
                <td className="text-right tabular">{w.customer_count as number}</td>
                <td className="text-right tabular">{w.order_count as number}</td>
                <td className="text-right tabular">{Number(w.ai_cost_this_month_usd).toFixed(3)}</td>
                <td className="text-right">
                  {canWrite && !w.is_demo && (
                    <div className="flex justify-end gap-1">
                      {["trialing", "expired"].includes(w.subscription_state as string) && w.subscription_status !== "active" && (
                        <ActionButton size="sm" variant="outline" label="+7 days trial" confirm="Extend this workspace's trial by 7 days?" action={extendTrialAction.bind(null, w.id as string, 7)} />
                      )}
                      {suspended.has(w.id)
                        ? <ActionButton size="sm" variant="outline" label="Restore" action={setEntitlementStatusAction.bind(null, w.id as string, "active")} />
                        : <ActionButton size="sm" variant="ghost" label="Suspend" confirm="Suspend Growth OS access for this workspace? Data is kept." action={setEntitlementStatusAction.bind(null, w.id as string, "suspended")} />}
                    </div>
                  )}
                </td>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
