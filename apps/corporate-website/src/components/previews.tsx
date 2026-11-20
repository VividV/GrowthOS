import { ArrowUpRight, Banknote, CreditCard, Sparkles, TrendingUp } from "lucide-react";

/** Faithful HTML recreations of Growth OS screens (fictional demo figures) — crisp at any size, no image weight. */
export function DashboardPreview() {
  const bars = [38, 52, 44, 61, 58, 72, 66, 80, 74, 91, 86, 98];
  return (
    <div className="overflow-hidden rounded-2xl border bg-background shadow-pop">
      <div className="flex items-center gap-1.5 border-b bg-subtle px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="ml-3 text-2xs text-muted-foreground">Dashboard · This month</span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-4">
        {[
          { l: "Sales recorded", v: "₦1,284,500", c: "+18%", i: TrendingUp },
          { l: "Money received", v: "₦1,046,000", c: "+12%", i: Banknote },
          { l: "Outstanding", v: "₦238,500", c: "6 customers", i: CreditCard },
          { l: "Est. net profit", v: "₦412,300", c: "32% margin", i: TrendingUp },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border p-3">
            <div className="flex items-center justify-between text-2xs text-muted-foreground">{s.l}<s.i className="h-3.5 w-3.5" /></div>
            <p className="mt-1.5 text-base font-semibold tabular">{s.v}</p>
            <p className="text-2xs font-medium text-success">{s.c}</p>
          </div>
        ))}
        <div className="rounded-xl border p-3 sm:col-span-3">
          <p className="text-xs font-medium">Sales trend</p>
          <div className="mt-3 flex h-28 items-end gap-1.5">
            {bars.map((b, i) => <div key={i} className="flex-1 rounded-t bg-primary/80" style={{ height: `${b}%` }} />)}
          </div>
        </div>
        <div className="space-y-2 rounded-xl border border-primary/20 bg-primary-soft/40 p-3">
          <p className="flex items-center gap-1 text-xs font-medium text-primary"><Sparkles className="h-3.5 w-3.5" /> Insights</p>
          {["Sales up 18% vs last month", "3 items at restock level", "Best seller: Adire Kaftan"].map((t) => <p key={t} className="rounded-md bg-background px-2 py-1.5 text-2xs">{t}</p>)}
        </div>
      </div>
    </div>
  );
}

export function ChatPreview() {
  return (
    <div className="space-y-3 rounded-2xl border bg-background p-4 shadow-pop">
      <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground">Which customers owe me money?</div>
      <div className="flex gap-2">
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft"><Sparkles className="h-3.5 w-3.5 text-primary" /></span>
        <div className="rounded-2xl rounded-tl-md border px-3 py-2.5 text-sm">
          <p><strong>6 customers</strong> owe you <strong>₦238,500</strong> in total.</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
            <li>Ngozi Eze — ₦48,000 (12 days)</li><li>Emeka Nwosu — ₦41,500 (9 days)</li><li>Bisola Johnson — ₦32,000 (5 days)</li>
          </ul>
          <p className="mt-1.5">Start with Ngozi — her balance is oldest. I can&apos;t send messages, but you&apos;ll find her WhatsApp link on her profile.</p>
          <div className="mt-2 flex gap-1 border-t pt-2"><span className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">Source: Customer balances</span></div>
        </div>
      </div>
    </div>
  );
}

export function PhonePreview() {
  return (
    <div className="mx-auto w-56 rounded-[2rem] border-[6px] border-slate-900 bg-background p-3 shadow-pop">
      <p className="text-center text-2xs text-muted-foreground">New order</p>
      <div className="mt-3 space-y-2">
        {[["Ankara Shirt · Blue / M", "₦12,000", 2], ["Satin Hair Bonnet", "₦3,500", 1]].map(([n, p, q]) => (
          <div key={n as string} className="rounded-lg border p-2">
            <p className="text-2xs font-medium">{n}</p>
            <div className="mt-1 flex items-center justify-between text-2xs"><span className="rounded border px-1.5">− {q} +</span><span className="tabular">{p}</span></div>
          </div>
        ))}
        <div className="flex justify-between border-t pt-2 text-xs font-semibold"><span>Total</span><span>₦30,000</span></div>
        <div className="rounded-lg bg-primary py-2 text-center text-2xs font-semibold text-primary-foreground">Confirm order</div>
        <p className="flex items-center justify-center gap-1 text-2xs text-success"><ArrowUpRight className="h-3 w-3" />Stock reserved automatically</p>
      </div>
    </div>
  );
}
