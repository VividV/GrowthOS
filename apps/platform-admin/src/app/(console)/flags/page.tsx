import { Card, PageHeader, TBody, THead, TR, Table, formatDateTime } from "@platform/ui";
import { db, requireStaff } from "@/lib/staff";
import { FlagToggle } from "../ui";

export const metadata = { title: "Feature flags" };

export default async function Flags() {
  await requireStaff("flags");
  const { data } = await db().from("feature_flags").select("*").order("key");
  return (
    <>
      <PageHeader title="Feature flags" description="Platform-wide switches. Turning off the AI assistant leaves all business operations working." />
      <Card className="overflow-hidden">
        <Table>
          <THead><tr><th>Enabled</th><th>Key</th><th>Description</th><th>Updated</th></tr></THead>
          <TBody>
            {(data ?? []).map((f) => (
              <TR key={f.key as string}>
                <td><FlagToggle flagKey={f.key as string} enabled={f.enabled as boolean} /></td>
                <td className="font-mono text-xs">{f.key as string}</td>
                <td className="text-sm">{f.description as string}</td>
                <td className="text-sm text-muted-foreground">{formatDateTime(f.updated_at as string)}</td>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
