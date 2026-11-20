import { Badge, Card, PageHeader, TBody, THead, TR, Table, formatDateTime } from "@platform/ui";
import { db, requireStaff } from "@/lib/staff";

export const metadata = { title: "Audit log" };

export default async function Audit({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const sp = await searchParams;
  await requireStaff("audit");
  let q = db().from("audit_logs").select("id, action, actor_type, entity_type, entity_id, metadata, created_at, organization_id, actor_id").order("created_at", { ascending: false }).limit(300);
  if (sp.who !== "all") q = q.in("actor_type", ["platform_admin", "system"]);
  const { data } = await q;
  const ids = [...new Set((data ?? []).map((a) => a.actor_id as string).filter(Boolean))];
  const { data: profs } = ids.length ? await db().from("profiles").select("id, email").in("id", ids) : { data: [] };
  const email = new Map((profs ?? []).map((p) => [p.id as string, p.email as string]));
  return (
    <>
      <PageHeader title="Audit log" description={sp.who === "all" ? "All audited actions" : "Privileged admin and system actions"}
        actions={<a href={sp.who === "all" ? "/audit" : "/audit?who=all"} className="text-sm text-primary">{sp.who === "all" ? "Show admin/system only" : "Show all"}</a>} />
      <Card className="overflow-hidden">
        <Table>
          <THead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></THead>
          <TBody>
            {(data ?? []).map((a) => (
              <TR key={a.id as string}>
                <td className="whitespace-nowrap text-sm">{formatDateTime(a.created_at as string)}</td>
                <td className="text-sm"><Badge tone={a.actor_type === "platform_admin" ? "warning" : "neutral"}>{a.actor_type as string}</Badge> {email.get(a.actor_id as string)}</td>
                <td className="font-mono text-xs">{a.action as string}</td>
                <td className="text-xs text-muted-foreground">{a.entity_type as string} {String(a.entity_id ?? "").slice(0, 8)}</td>
                <td className="max-w-sm truncate font-mono text-2xs text-muted-foreground">{JSON.stringify(a.metadata)}</td>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
