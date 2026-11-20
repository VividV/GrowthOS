import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@platform/ui";

export const PAGE_SIZE = 25;

export function pageFrom(sp: { page?: string }): number {
  const p = Number(sp.page ?? 1);
  return Number.isInteger(p) && p > 0 && p < 10_000 ? p : 1;
}

export function Pagination({ page, total, basePath, params }: { page: number; total: number; basePath: string; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return <p className="px-4 py-3 text-xs text-muted-foreground">{total} result{total === 1 ? "" : "s"}</p>;
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    q.set("page", String(p));
    return `${basePath}?${q.toString()}`;
  };
  const btn = "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium";
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
      <span>Page {page} of {pages} · {total} results</span>
      <div className="flex gap-2">
        <Link href={href(page - 1)} aria-disabled={page <= 1} className={cn(btn, page <= 1 && "pointer-events-none opacity-40")}><ChevronLeft className="h-3.5 w-3.5" /> Prev</Link>
        <Link href={href(page + 1)} aria-disabled={page >= pages} className={cn(btn, page >= pages && "pointer-events-none opacity-40")}>Next <ChevronRight className="h-3.5 w-3.5" /></Link>
      </div>
    </div>
  );
}

/** Strips characters that have meaning in PostgREST filter syntax. */
export function sanitizeSearch(q: string | undefined): string {
  return (q ?? "").replace(/[,()*%\\:"']/g, " ").trim().slice(0, 80);
}
