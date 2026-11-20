import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@platform/ui";
import { db, requireStaff, WRITE_ROLES } from "@/lib/staff";
import { PlanEditor, type PlanEdit } from "../ui";

export const metadata = { title: "Plans & entitlements" };

export default async function Plans() {
  const staff = await requireStaff("plans");
  const { data } = await db().from("subscription_plans").select("*, platform_products(name), plan_entitlements(key, enabled, limit_value)").order("sort_order");
  const canEdit = WRITE_ROLES.plans!.includes(staff.role);
  return (
    <>
      <PageHeader title="Plans & entitlements" description="Prices, limits and features are data — changes apply immediately to entitlement checks. Enforcement happens in the database." />
      {(data ?? []).map((p) => (
        <Card key={p.id as string}>
          <CardHeader><CardTitle>{(p.platform_products as { name: string }).name} · {p.name as string} <span className="font-mono text-xs text-muted-foreground">({p.code as string})</span></CardTitle></CardHeader>
          <CardContent>
            <PlanEditor canEdit={canEdit} plan={{
              id: p.id as string, code: p.code as string, name: p.name as string, description: (p.description as string) ?? "", price: Number(p.price),
              paystack_plan_code: p.paystack_plan_code as string | null, is_active: p.is_active as boolean, is_public: p.is_public as boolean,
              features: p.features as string[], entitlements: ((p.plan_entitlements ?? []) as PlanEdit["entitlements"]).sort((a, b) => a.key.localeCompare(b.key)),
            }} />
          </CardContent>
        </Card>
      ))}
    </>
  );
}
