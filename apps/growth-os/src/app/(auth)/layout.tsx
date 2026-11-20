import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/logo";

const POINTS = [
  "Customers, orders, stock and money in one place",
  "Know your real profit — not just your sales",
  "Ask questions about your business in plain English",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/login" className="w-fit"><Logo /></Link>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</main>
        <p className="text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Growth OS · Made for African businesses</p>
      </div>
      <aside className="relative hidden overflow-hidden bg-[#06372a] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(60%_50%_at_80%_10%,#10b981_0%,transparent_60%),radial-gradient(50%_40%_at_10%_90%,#0ea5e9_0%,transparent_60%)]" />
        <div className="relative">
          <p className="text-sm font-medium text-emerald-300">Growth OS</p>
          <h2 className="mt-4 max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Run your business. Understand your numbers. Grow with AI.
          </h2>
        </div>
        <ul className="relative space-y-3">
          {POINTS.map((p) => (
            <li key={p} className="flex items-center gap-3 text-sm text-emerald-50/90">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" /> {p}
            </li>
          ))}
        </ul>
        <div className="relative rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <p className="text-sm text-emerald-50/90">&ldquo;Which customers owe me money?&rdquo;</p>
          <p className="mt-2 text-sm text-white">
            5 customers owe you <span className="font-semibold">₦142,500</span>. The largest is Ngozi Eze (₦48,000, 12 days).
          </p>
          <p className="mt-3 text-2xs uppercase tracking-wide text-emerald-300/80">Example answer — from your own records</p>
        </div>
      </aside>
    </div>
  );
}
