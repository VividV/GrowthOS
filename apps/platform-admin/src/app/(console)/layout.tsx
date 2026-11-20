import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@platform/ui";
import { AREA_ROLES, getStaff } from "@/lib/staff";
import { signOutAction } from "@/lib/actions";
import { NavLink } from "./nav-link";

export const dynamic = "force-dynamic";

const AREAS: [string, string, string][] = [
  ["overview", "/", "Overview"], ["workspaces", "/workspaces", "Workspaces"], ["users", "/users", "Users"],
  ["subscriptions", "/subscriptions", "Subscriptions"], ["plans", "/plans", "Plans & entitlements"], ["ai", "/ai", "AI usage & providers"],
  ["errors", "/errors", "Errors"], ["support", "/support", "Support"], ["flags", "/flags", "Feature flags"], ["audit", "/audit", "Audit log"],
];

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  const allowed = AREAS.filter(([a]) => AREA_ROLES[a]!.includes(staff.role));
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[220px_1fr]">
      <aside className="border-b bg-background p-3 lg:border-b-0 lg:border-r">
        <div className="mb-3 flex items-center justify-between px-2">
          <span className="text-sm font-semibold">Platform Admin</span>
          <Badge tone="primary">{staff.role.replace("_", " ")}</Badge>
        </div>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {allowed.map(([, href, label]) => <NavLink key={href} href={href}>{label}</NavLink>)}
        </nav>
        <form action={signOutAction} className="mt-4 hidden px-2 lg:block">
          <p className="truncate text-xs text-muted-foreground">{staff.email}</p>
          <button className="text-xs font-medium text-primary">Sign out</button>
        </form>
      </aside>
      <main className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
        {children}
        <p className="pt-6 text-xs text-muted-foreground">Privacy boundary: this console shows platform metadata and aggregate counts only. Internal staff have no access to customers&apos; business records. <Link href="/audit" className="underline">Admin actions are audited.</Link></p>
      </main>
    </div>
  );
}
