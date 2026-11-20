import { Card, PageHeader, TBody, THead, TR, Table, formatDateTime } from "@platform/ui";
import { db, requireStaff } from "@/lib/staff";

export const metadata = { title: "Errors" };

export default async function Errors() {
  await requireStaff("errors");
  const { data } = await db().from("app_errors").select("id, app, message, context, created_at, organization_id").order("created_at", { ascending: false }).limit(200);
  return (
    <>
      <PageHeader title="Application errors" description="Unexpected server errors reported by the apps (most recent 200)." />
      <Card className="overflow-hidden">
        {(data ?? []).length === 0 ? <p className="p-6 text-sm text-muted-foreground">No errors recorded. 🎉</p> : (
          <Table>
            <THead><tr><th>When</th><th>App</th><th>Message</th><th>Context</th></tr></THead>
            <TBody>
              {(data ?? []).map((e) => (
                <TR key={e.id as string}>
                  <td className="whitespace-nowrap text-sm">{formatDateTime(e.created_at as string)}</td>
                  <td className="text-sm">{e.app as string}</td>
                  <td className="max-w-md text-sm">{e.message as string}</td>
                  <td className="max-w-xs truncate font-mono text-2xs text-muted-foreground">{JSON.stringify(e.context)}</td>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
