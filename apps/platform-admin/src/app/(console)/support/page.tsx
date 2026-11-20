import { Card, CardContent, PageHeader, formatDateTime } from "@platform/ui";
import { db, requireStaff, WRITE_ROLES } from "@/lib/staff";
import { SupportStatus } from "../ui";

export const metadata = { title: "Support" };

export default async function Support() {
  const staff = await requireStaff("support");
  const { data } = await db().from("support_requests").select("id, subject, message, status, created_at, user_id, organizations(name)").order("created_at", { ascending: false }).limit(200);
  const canWrite = WRITE_ROLES.support!.includes(staff.role);
  const ids = [...new Set((data ?? []).map((r) => r.user_id as string).filter(Boolean))];
  const { data: profs } = ids.length ? await db().from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const byId = new Map((profs ?? []).map((p) => [p.id as string, p as { full_name: string; email: string }]));
  return (
    <>
      <PageHeader title="Support requests" />
      {(data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No support requests.</p>}
      <div className="space-y-3">
        {(data ?? []).map((r) => {
          const p = byId.get(r.user_id as string) ?? null;
          return (
            <Card key={r.id as string}>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{r.subject as string}</p>
                    <p className="text-xs text-muted-foreground">{p?.full_name} · <a className="text-primary" href={`mailto:${p?.email}`}>{p?.email}</a> · {(r.organizations as unknown as { name: string } | null)?.name} · {formatDateTime(r.created_at as string)}</p>
                  </div>
                  {canWrite ? <SupportStatus id={r.id as string} status={r.status as string} /> : <span className="text-xs">{r.status as string}</span>}
                </div>
                <p className="whitespace-pre-wrap text-sm">{r.message as string}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
