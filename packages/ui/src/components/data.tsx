import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "../lib";

/* ------------------------------------------------------------------ Table
 * Desktop: real table. Mobile: callers render <MobileList> instead (cards),
 * because squeezing 7 columns onto a phone is not a real mobile experience.
 */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b bg-subtle [&_th]:h-9 [&_th]:px-4 [&_th]:text-left [&_th]:align-middle [&_th]:text-2xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground", className)} {...props} />;
}
export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b transition-colors hover:bg-subtle/80 [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle", className)} {...props} />;
}

export function MobileList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("divide-y", className)}>{children}</ul>;
}

/* ------------------------------------------------------------------ Page header */
export function PageHeader({ title, description, actions, className, eyebrow }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string; eyebrow?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && <div className="text-xs font-medium text-muted-foreground">{eyebrow}</div>}
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Empty state */
export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {Icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border bg-subtle">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Stat card */
export function StatCard({
  label, value, hint, icon: Icon, change, tone = "default", className,
}: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon;
  change?: { value: number | null; goodWhenUp?: boolean } | null; tone?: "default" | "warning" | "danger" | "success"; className?: string;
}) {
  const up = change?.value !== null && change?.value !== undefined && change.value > 0;
  const down = change?.value !== null && change?.value !== undefined && change.value < 0;
  const good = (up && change?.goodWhenUp !== false) || (down && change?.goodWhenUp === false);
  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-card", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <Icon className={cn("h-4 w-4", { default: "text-muted-foreground", warning: "text-warning", danger: "text-danger", success: "text-success" }[tone])} />
        )}
      </div>
      <p className="tabular mt-2 truncate text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
      <div className="mt-1 flex min-h-4 items-center gap-1.5 text-xs text-muted-foreground">
        {change && change.value !== null && change.value !== undefined && Number.isFinite(change.value) && (
          <span className={cn("inline-flex items-center font-medium", good ? "text-success" : up || down ? "text-danger" : "")}>
            {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : down ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
            {Math.abs(change.value).toFixed(0)}%
          </span>
        )}
        {hint && <span className="truncate">{hint}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Definition list */
export function DescriptionList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 truncate text-sm">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
