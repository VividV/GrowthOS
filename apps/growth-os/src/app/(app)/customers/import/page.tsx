import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert, PageHeader } from "@platform/ui";
import { requirePermission } from "@platform/auth";
import { ImportFlow } from "./import-flow";

export const metadata = { title: "Import customers" };

export default async function ImportCustomers() {
  const ws = await requirePermission("customers.import");
  return (
    <div className="space-y-5">
      <Link href="/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Customers</Link>
      <PageHeader title="Import customers" description="Upload a CSV from Excel, Google Sheets or your phone contacts export. You'll review everything before it's saved." />
      {!ws.writable ? <Alert tone="danger">Your workspace is read-only. Choose a plan to import customers.</Alert> : <ImportFlow />}
    </div>
  );
}
