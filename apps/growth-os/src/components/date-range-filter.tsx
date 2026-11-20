"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Button, Input, cn } from "@platform/ui";
import { RANGE_OPTIONS } from "@/lib/dates";

/** Range picker that writes to the URL so the server renders the right period (shareable, back-button friendly). */
export function DateRangeFilter({ current, from, to }: { current: string; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [custom, setCustom] = useState(current === "custom");
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  const go = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) (v === null ? p.delete(k) : p.set(k, v));
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:pb-0">
        {RANGE_OPTIONS.map((o) => (
          <button key={o.key} type="button" onClick={() => { setCustom(false); go({ range: o.key, from: null, to: null }); }}
            className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition",
              current === o.key && !custom ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}>
            {o.label}
          </button>
        ))}
        <button type="button" onClick={() => setCustom((c) => !c)}
          className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium",
            custom || current === "custom" ? "border-primary bg-primary-soft text-primary" : "bg-background hover:bg-accent")}>
          <CalendarRange className="h-3.5 w-3.5" /> Custom
        </button>
      </div>
      {custom && (
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); go({ range: "custom", from: f, to: t }); }}>
          <Input type="date" value={f} onChange={(e) => setF(e.target.value)} className="h-8 w-[140px] text-xs" aria-label="From" max={t} />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={t} onChange={(e) => setT(e.target.value)} className="h-8 w-[140px] text-xs" aria-label="To" min={f} />
          <Button size="sm" type="submit">Apply</Button>
        </form>
      )}
    </div>
  );
}
