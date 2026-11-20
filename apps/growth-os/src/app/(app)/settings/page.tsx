import { requireWorkspace } from "@platform/auth";
import { getServerClient } from "@platform/database/server";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, DescriptionList } from "@platform/ui";
import { signedUrls } from "@/server/storage";
import { BusinessForm } from "./business-form";

export const metadata = { title: "Business settings" };

export default async function BusinessSettings() {
  const ws = await requireWorkspace();
  const supabase = await getServerClient();
  const [{ data: org }, { data: bp }] = await Promise.all([
    supabase.from("organizations").select("name, category, description, currency, timezone, country").eq("id", ws.organization.id).single(),
    supabase.from("business_profiles").select("*").eq("organization_id", ws.organization.id).maybeSingle(),
  ]);
  const logo = bp?.logo_path ? (await signedUrls(supabase, [bp.logo_path as string]))[bp.logo_path as string] ?? null : null;

  if (!ws.can("settings.manage")) {
    return (
      <Card>
        <CardHeader><CardTitle>Business details</CardTitle><CardDescription>Only owners and admins can change these.</CardDescription></CardHeader>
        <CardContent>
          <DescriptionList items={[
            { label: "Name", value: org?.name }, { label: "Category", value: org?.category }, { label: "Currency", value: org?.currency },
            { label: "Timezone", value: org?.timezone }, { label: "Phone", value: bp?.phone }, { label: "Email", value: bp?.business_email },
          ]} />
        </CardContent>
      </Card>
    );
  }
  return (
    <>
      {!ws.writable && <Alert tone="warning">Your workspace is read-only, so settings can&apos;t be changed until you choose a plan.</Alert>}
      <BusinessForm logoUrl={logo} values={{
        name: org?.name ?? "", category: org?.category ?? "", description: org?.description ?? "", currency: org?.currency ?? "NGN", timezone: org?.timezone ?? "Africa/Lagos",
        business_email: bp?.business_email ?? "", phone: bp?.phone ?? "", address: bp?.address ?? "", order_prefix: bp?.order_prefix ?? "ORD",
        stock_policy: bp?.stock_policy ?? "reserve_on_confirm", allow_negative_stock: Boolean(bp?.allow_negative_stock),
      }} />
    </>
  );
}
