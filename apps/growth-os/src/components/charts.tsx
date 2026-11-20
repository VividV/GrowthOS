"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatMoney } from "@platform/ui";

const C = { primary: "hsl(161 84% 30%)", blue: "hsl(217 80% 52%)", amber: "hsl(32 95% 50%)", grid: "hsl(220 13% 91%)", muted: "hsl(220 9% 46%)" };
const STATUS_COLORS: Record<string, string> = {
  draft: "hsl(220 9% 70%)", confirmed: "hsl(217 80% 52%)", processing: "hsl(260 60% 58%)", ready: "hsl(190 70% 42%)",
  dispatched: "hsl(32 95% 50%)", delivered: "hsl(161 84% 30%)", cancelled: "hsl(0 72% 55%)",
};

const shortDate = (s: string, bucket: string) =>
  new Intl.DateTimeFormat("en-GB", bucket === "month" ? { month: "short", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${s}T00:00:00Z`));
const axisMoney = (currency: string) => (v: number) => formatMoney(v, currency, { compact: true });

function ChartTooltip({ active, payload, label, currency, bucket }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; currency: string; bucket: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-pop">
      {label && <p className="mb-1 font-medium">{shortDate(label, bucket)}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-medium tabular">{formatMoney(p.value, currency)}</span>
        </p>
      ))}
    </div>
  );
}

export function SalesTrendChart({ data, currency, bucket }: { data: { bucket: string; sales: number; cash_received: number }[]; currency: string; bucket: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.primary} stopOpacity={0.25} />
            <stop offset="100%" stopColor={C.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={(v) => shortDate(v, bucket)} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tickFormatter={axisMoney(currency)} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} width={64} />
        <Tooltip content={<ChartTooltip currency={currency} bucket={bucket} />} />
        <Area type="monotone" dataKey="sales" name="Net sales" stroke={C.primary} strokeWidth={2} fill="url(#gSales)" />
        <Area type="monotone" dataKey="cash_received" name="Cash received" stroke={C.blue} strokeWidth={2} fill="transparent" strokeDasharray="4 3" />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RevenueExpenseChart({ data, currency, bucket }: { data: { bucket: string; sales: number; expenses: number | null }[]; currency: string; bucket: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={(v) => shortDate(v, bucket)} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tickFormatter={axisMoney(currency)} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} width={64} />
        <Tooltip content={<ChartTooltip currency={currency} bucket={bucket} />} cursor={{ fill: "hsl(220 14% 96%)" }} />
        <Bar dataKey="sales" name="Revenue" fill={C.primary} radius={[3, 3, 0, 0]} maxBarSize={22} />
        <Bar dataKey="expenses" name="Expenses" fill={C.amber} radius={[3, 3, 0, 0]} maxBarSize={22} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopProductsChart({ data, currency }: { data: { product_name: string; revenue: number; quantity: number }[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="product_name" width={130} tick={{ fontSize: 12, fill: "hsl(222 47% 20%)" }} axisLine={false} tickLine={false}
          tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)} />
        <Tooltip cursor={{ fill: "hsl(220 14% 96%)" }} formatter={(v: number, _n, item) => [`${formatMoney(v, currency)} · ${(item.payload as { quantity: number }).quantity} sold`, "Revenue"]} />
        <Bar dataKey="revenue" fill={C.primary} radius={[0, 4, 4, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusDonut({ data }: { data: { status: string; count: number }[] }) {
  const total = data.reduce((a, d) => a + d.count, 0);
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-36 w-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="status" innerRadius={44} outerRadius={64} paddingAngle={2} strokeWidth={0}>
              {data.map((d) => <Cell key={d.status} fill={STATUS_COLORS[d.status] ?? C.muted} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular">{total}</span>
          <span className="text-2xs text-muted-foreground">orders</span>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.status} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[d.status] ?? C.muted }} />
            <span className="capitalize text-muted-foreground">{d.status}</span>
            <span className="ml-auto font-medium tabular">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
