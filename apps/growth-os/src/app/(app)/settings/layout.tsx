import { requireWorkspace } from "@platform/auth";
import { PageHeader } from "@platform/ui";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ws = await requireWorkspace();
  const items = [
    { href: "/settings", label: "Business" },
    ...(ws.can("members.manage") || ws.role !== "viewer" ? [{ href: "/settings/team", label: "Team" }] : []),
    ...(ws.can("billing.manage") || ws.can("settings.manage") ? [{ href: "/settings/billing", label: "Plan & billing" }] : []),
    { href: "/settings/account", label: "Account" },
    { href: "/settings/support", label: "Help" },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description={ws.organization.name} />
      <SettingsNav items={items} />
      {children}
    </div>
  );
}
