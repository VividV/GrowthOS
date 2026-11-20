import { Badge, Card, PageHeader, TBody, THead, TR, Table, formatDate } from "@platform/ui";
import { db, requireStaff } from "@/lib/staff";

export const metadata = { title: "Users" };

export default async function Users() {
  await requireStaff("users");
  const [{ data: profiles }, { data: members }, { data: staff }] = await Promise.all([
    db().from("profiles").select("id, full_name, email, created_at").order("created_at", { ascending: false }).limit(300),
    db().from("organization_members").select("user_id, role"),
    db().from("platform_staff").select("user_id, role"),
  ]);
  const count = new Map<string, number>();
  for (const m of members ?? []) count.set(m.user_id as string, (count.get(m.user_id as string) ?? 0) + 1);
  const staffRole = new Map((staff ?? []).map((s) => [s.user_id as string, s.role as string]));
  return (
    <>
      <PageHeader title="Registered users" description={`${profiles?.length ?? 0} most recent users`} />
      <Card className="overflow-hidden">
        <Table>
          <THead><tr><th>Name</th><th>Email</th><th>Joined</th><th className="text-right">Workspaces</th><th /></tr></THead>
          <TBody>
            {(profiles ?? []).map((p) => (
              <TR key={p.id as string}>
                <td className="text-sm font-medium">{(p.full_name as string) || "—"}</td>
                <td className="text-sm">{(p.email as string) ?? <span className="text-muted-foreground">guest (demo)</span>}</td>
                <td className="text-sm">{formatDate(p.created_at as string)}</td>
                <td className="text-right tabular">{count.get(p.id as string) ?? 0}</td>
                <td className="text-right">{staffRole.has(p.id as string) && <Badge tone="primary">staff: {staffRole.get(p.id as string)}</Badge>}</td>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
