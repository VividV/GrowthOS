import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a monetary amount. Values arrive from Postgres numeric as strings — never do maths on them here. */
export function formatMoney(
  value: number | string | null | undefined,
  currency = "NGN",
  opts: { compact?: boolean; signed?: boolean } = {},
): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const fmt = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    notation: opts.compact && Math.abs(n) >= 100_000 ? "compact" : "standard",
    minimumFractionDigits: opts.compact ? 0 : n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: opts.compact ? 1 : 2,
    signDisplay: opts.signed ? "exceptZero" : "auto",
  });
  return fmt.format(n);
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat("en-NG").format(n) : "—";
}

export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }, timeZone = "Africa/Lagos"): string {
  if (!value) return "—";
  // Plain dates (YYYY-MM-DD) are calendar dates: never shift them by timezone.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  }
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone }).format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined, timeZone = "Africa/Lagos"): string {
  return formatDate(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }, timeZone);
}

export function relativeDays(date: string, today: string): string {
  const d = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  return d < 0 ? `${-d} days ago` : `In ${d} days`;
}

export function initials(name: string | null | undefined): string {
  return (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "?";
}
