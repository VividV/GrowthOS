"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@platform/ui";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link href={href} className={cn("whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm", active ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-accent")}>
      {children}
    </Link>
  );
}
