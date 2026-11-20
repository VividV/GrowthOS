"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BarChart3, Boxes, Check, ChevronsUpDown, ClipboardList, Home, ListTodo, LogOut, Menu, Package, Plus, Settings, ShoppingBag,
  Sparkles, UserPlus, Users, Wallet,
} from "lucide-react";
import {
  Avatar, Badge, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger, SheetContent, cn,
} from "@platform/ui";
import { LogoMark } from "@/components/logo";
import { signOutAction } from "@/server/auth-actions";
import { switchWorkspaceAction } from "@/server/workspace-actions";
import type { NavItem } from "./nav";

const ICONS = { home: Home, orders: ShoppingBag, customers: Users, products: Package, inventory: Boxes, finance: Wallet, tasks: ListTodo, ai: Sparkles, settings: Settings };

export interface ShellProps {
  nav: NavItem[];
  workspace: { id: string; name: string; is_demo: boolean; plan: string | null };
  workspaces: { id: string; name: string; is_demo: boolean; role: string }[];
  user: { name: string; email: string | null; isAnonymous: boolean };
  canCreate: { order: boolean; customer: boolean; product: boolean; expense: boolean; task: boolean };
  banner?: React.ReactNode;
  children: React.ReactNode;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function WorkspaceSwitcher({ workspace, workspaces, compact }: Pick<ShellProps, "workspace" | "workspaces"> & { compact?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", pending && "opacity-60")}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
          {workspace.name.slice(0, 1).toUpperCase()}
        </span>
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{workspace.name}</span>
            <span className="block truncate text-2xs text-muted-foreground">{workspace.is_demo ? "Demo workspace" : workspace.plan ?? "Workspace"}</span>
          </span>
        )}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => w.id !== workspace.id && start(() => switchWorkspaceAction(w.id))}>
            <span className="flex-1 truncate">{w.name}</span>
            {w.is_demo && <Badge tone="info">Demo</Badge>}
            {w.id === workspace.id && <Check className="text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/onboarding?new=1"><Plus /> Add a business</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavLinks({ nav, pathname, onNavigate }: { nav: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-0.5" aria-label="Main">
      {nav.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
            {item.icon === "ai" && <span className="ml-auto rounded bg-primary/10 px-1.5 text-2xs font-semibold text-primary">AI</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu({ user, side = "top" }: { user: ShellProps["user"]; side?: "top" | "bottom" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent">
        <Avatar name={user.name} className="h-7 w-7" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="block truncate text-2xs text-muted-foreground">{user.isAnonymous ? "Guest (demo)" : user.email}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="start" className="w-56">
        <DropdownMenuItem asChild><Link href="/settings/account"><Settings /> Account settings</Link></DropdownMenuItem>
        {user.isAnonymous && <DropdownMenuItem asChild><Link href="/settings/account"><UserPlus /> Save as a real account</Link></DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOutAction()}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function QuickCreate({ canCreate, trigger }: { canCreate: ShellProps["canCreate"]; trigger: React.ReactNode }) {
  const items = [
    canCreate.order && { href: "/orders/new", label: "New order", icon: ShoppingBag },
    canCreate.customer && { href: "/customers?new=1", label: "New customer", icon: UserPlus },
    canCreate.product && { href: "/products/new", label: "New product", icon: Package },
    canCreate.expense && { href: "/finance?new=expense", label: "Record expense", icon: Wallet },
    canCreate.task && { href: "/tasks?new=1", label: "New follow-up", icon: ClipboardList },
  ].filter(Boolean) as { href: string; label: string; icon: typeof Plus }[];
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="center" side="top" className="w-52">
        {items.map((i) => (
          <DropdownMenuItem key={i.href} asChild><Link href={i.href}><i.icon /> {i.label}</Link></DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ nav, workspace, workspaces, user, canCreate, banner, children }: ShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const bottom = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/orders", label: "Orders", icon: ShoppingBag },
    null,
    { href: "/customers", label: "Customers", icon: Users },
    { href: "/assistant", label: "Ask AI", icon: Sparkles },
  ].filter((b) => b === null || nav.some((n) => n.href === b.href));

  return (
    <div className="min-h-dvh bg-subtle">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-background lg:flex">
        <div className="flex h-14 items-center gap-2 px-4">
          <LogoMark className="h-6 w-6" />
          <span className="text-sm font-semibold tracking-tight">Growth OS</span>
        </div>
        <div className="px-2"><WorkspaceSwitcher workspace={workspace} workspaces={workspaces} /></div>
        <div className="mt-4 flex-1 overflow-y-auto px-2"><NavLinks nav={nav} pathname={pathname} /></div>
        <div className="space-y-1 border-t p-2">
          <QuickCreate canCreate={canCreate} trigger={
            <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" /> Create</button>
          } />
          <UserMenu user={user} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur lg:hidden no-print">
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger className="rounded-md p-2 hover:bg-accent" aria-label="Open menu"><Menu className="h-5 w-5" /></Dialog.Trigger>
          <SheetContent title="Navigation" className="p-3">
            <div className="mb-3 flex items-center gap-2 px-2 py-1"><LogoMark className="h-6 w-6" /><span className="text-sm font-semibold">Growth OS</span></div>
            <WorkspaceSwitcher workspace={workspace} workspaces={workspaces} />
            <div className="mt-4 flex-1 overflow-y-auto"><NavLinks nav={nav} pathname={pathname} onNavigate={() => setOpen(false)} /></div>
            <div className="border-t pt-2"><UserMenu user={user} /></div>
          </SheetContent>
        </Dialog.Root>
        <div className="min-w-0 flex-1"><WorkspaceSwitcher workspace={workspace} workspaces={workspaces} /></div>
      </header>

      <div className="lg:pl-60">
        {banner}
        <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
      </div>

      {/* Mobile bottom navigation with a central quick-create button */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur pb-safe lg:hidden no-print" aria-label="Quick">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5">
          {bottom.map((b, i) =>
            b === null ? (
              <div key="create" className="flex justify-center">
                <QuickCreate canCreate={canCreate} trigger={
                  <button aria-label="Create" className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-pop active:scale-95">
                    <Plus className="h-6 w-6" />
                  </button>
                } />
              </div>
            ) : (
              <Link key={b.href + i} href={b.href} className={cn("flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-2xs font-medium", isActive(pathname, b.href) ? "text-primary" : "text-muted-foreground")}>
                <b.icon className="h-5 w-5" />
                {b.label}
              </Link>
            ),
          )}
        </div>
      </nav>
    </div>
  );
}

export function ReportIcon() {
  return <BarChart3 className="h-4 w-4" />;
}
