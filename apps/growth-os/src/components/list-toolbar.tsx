"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input, Select, cn } from "@platform/ui";

/** Debounced search + filter controls bound to URL params (server-side filtering). */
export function ListToolbar({ placeholder, filters = [], children }: {
  placeholder: string;
  filters?: { name: string; label: string; options: { value: string; label: string }[] }[];
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const first = useRef(true);

  const push = (updates: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) (v ? p.set(k, v) : p.delete(k));
    p.delete("page");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => push({ q }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-9 pr-8" type="search" aria-label="Search" />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Clear search">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className={cn("flex gap-2", filters.length > 1 && "grid grid-cols-2 sm:flex")}>
        {filters.map((f) => (
          <Select key={f.name} aria-label={f.label} value={params.get(f.name) ?? ""} onChange={(e) => push({ [f.name]: e.target.value })} className="sm:w-44">
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        ))}
        {children}
      </div>
    </div>
  );
}
