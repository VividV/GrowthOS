/**
 * Date-range handling for reports. All ranges are calendar dates (YYYY-MM-DD)
 * in the workspace timezone, matching how the database buckets records.
 */
export type RangeKey = "today" | "week" | "month" | "last_month" | "90d" | "custom";

export interface DateRange {
  key: RangeKey;
  from: string;
  to: string;
  label: string;
  /** Previous period of equal length, for comparisons. */
  prevFrom: string;
  prevTo: string;
}

export const RANGE_OPTIONS: { key: Exclude<RangeKey, "custom">; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "90d", label: "Last 90 days" },
];

/** Today's date in the given IANA timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function addDays(s: string, n: number): string {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}
const isIsoDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toDate(s).getTime());

export function resolveRange(params: { range?: string; from?: string; to?: string }, timeZone: string, now: Date = new Date()): DateRange {
  const today = todayIn(timeZone, now);
  const t = toDate(today);
  let key = (params.range ?? "month") as RangeKey;
  let from: string;
  let to = today;
  let label: string;

  switch (key) {
    case "today":
      from = today;
      label = "Today";
      break;
    case "week": {
      const dow = (t.getUTCDay() + 6) % 7; // Monday = 0
      from = addDays(today, -dow);
      label = "This week";
      break;
    }
    case "last_month": {
      const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0));
      from = iso(first);
      to = iso(last);
      label = first.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
      break;
    }
    case "90d":
      from = addDays(today, -89);
      label = "Last 90 days";
      break;
    case "custom":
      if (isIsoDate(params.from) && isIsoDate(params.to) && params.from <= params.to && daysBetween(params.from, params.to) <= 3650) {
        from = params.from;
        to = params.to;
        label = `${from} → ${to}`;
        break;
      }
      key = "month";
    // falls through to the default month range when the custom input is invalid
    default:
      key = "month";
      from = iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)));
      label = "This month";
  }

  // Comparable previous period: for whole months compare with the whole previous month,
  // otherwise the same number of days immediately before.
  let prevFrom: string;
  let prevTo: string;
  if (key === "month" || key === "last_month") {
    const f = toDate(from);
    const pf = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() - 1, 1));
    prevFrom = iso(pf);
    // month-to-date compares against the same number of days last month
    const span = daysBetween(from, to);
    const prevMonthEnd = iso(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 0)));
    prevTo = key === "month" ? (addDays(prevFrom, span) < prevMonthEnd ? addDays(prevFrom, span) : prevMonthEnd) : prevMonthEnd;
  } else {
    const span = daysBetween(from, to) + 1;
    prevTo = addDays(from, -1);
    prevFrom = addDays(from, -span);
  }
  return { key, from, to, label, prevFrom, prevTo };
}

export function bucketFor(range: DateRange): "day" | "week" | "month" {
  const span = daysBetween(range.from, range.to);
  return span > 120 ? "month" : span > 45 ? "week" : "day";
}

export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null; // undefined growth from zero — don't show a fake %
  return ((current - previous) / Math.abs(previous)) * 100;
}
