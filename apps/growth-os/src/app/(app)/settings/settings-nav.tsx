"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@platform/ui";

export function SettingsNav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0" aria-label="Settings">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={path === i.href ? "page" : undefined}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium", path === i.href ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
