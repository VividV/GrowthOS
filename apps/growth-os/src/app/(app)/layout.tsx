import Link from "next/link";
import { listWorkspaces, requireWorkspace } from "@platform/auth";
import { subscriptionBanner } from "@platform/billing";
import { cn } from "@platform/ui";
import { AppShell } from "@/components/shell/app-shell";
import { NAV } from "@/components/shell/nav";
import { DemoBanner } from "./demo-banner";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ws = await requireWorkspace();
  const workspaces = await listWorkspaces();
  const nav = NAV.filter((n) => !n.permission || ws.can(n.permission));
  const name = (ws.user.user_metadata?.full_name as string | undefined) || ws.user.email?.split("@")[0] || "You";
  const sub = ws.subscription;
  const banner = ws.organization.is_demo ? null : subscriptionBanner(sub ? { ...sub, state: sub.state } : { state: "none" });
  const realWorkspace = workspaces.find((w) => !w.is_demo);
  const writable = ws.writable;

  return (
    <AppShell
      nav={nav}
      workspace={{ id: ws.organization.id, name: ws.organization.name, is_demo: ws.organization.is_demo, plan: sub ? `${sub.plan_name} plan${sub.state === "trialing" ? " · Trial" : ""}` : null }}
      workspaces={workspaces}
      user={{ name, email: ws.user.email ?? null, isAnonymous: Boolean(ws.user.is_anonymous) }}
      canCreate={{
        order: writable && ws.can("orders.write"),
        customer: writable && ws.can("customers.write"),
        product: writable && ws.can("products.write"),
        expense: writable && ws.can("finance.write"),
        task: writable && ws.can("tasks.write"),
      }}
      banner={
        ws.organization.is_demo ? (
          <DemoBanner canReset={ws.can("demo.reset")} realWorkspace={realWorkspace ?? null} isAnonymous={Boolean(ws.user.is_anonymous)} />
        ) : banner ? (
          <div className={cn("border-b px-4 py-2.5 text-sm sm:px-6 lg:px-8 no-print", {
            info: "bg-info-soft text-info", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger",
          }[banner.tone])}>
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
              <p><span className="font-semibold">{banner.title}.</span> <span className="text-foreground/80">{banner.body}</span></p>
              {ws.can("billing.manage") && <Link href="/settings/billing" className="font-semibold underline-offset-4 hover:underline">Choose a plan →</Link>}
            </div>
          </div>
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
