import Papa from "papaparse";
import { z } from "zod";

/** Normalises Nigerian phone numbers the same way the database does (phone_normalized). */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (/^0\d{10}$/.test(digits)) return `234${digits.slice(1)}`;
  return digits;
}

const HEADER_ALIASES: Record<string, string> = {
  name: "full_name", "full name": "full_name", fullname: "full_name", "customer name": "full_name", customer: "full_name",
  phone: "phone", "phone number": "phone", mobile: "phone", whatsapp: "phone", telephone: "phone",
  email: "email", "email address": "email", "e-mail": "email",
  location: "location", city: "location", state: "location", area: "location",
  address: "address", "delivery address": "address",
  notes: "notes", note: "notes", comments: "notes",
  source: "source", channel: "source",
};

const CANONICAL = new Set(Object.values(HEADER_ALIASES));

export const importRowSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(160, "Name is too long"),
  phone: z.string().trim().max(40).optional().transform((v) => v || null),
  email: z.string().trim().toLowerCase().max(254).optional().transform((v) => v || null)
    .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Invalid email"),
  location: z.string().trim().max(120).optional().transform((v) => v || null),
  address: z.string().trim().max(300).optional().transform((v) => v || null),
  notes: z.string().trim().max(1000).optional().transform((v) => v || null),
  source: z.string().trim().max(40).optional().transform((v) => v || "import"),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export interface PreviewRow {
  line: number;
  data: ImportRow | null;
  raw: Record<string, string>;
  status: "ok" | "invalid" | "duplicate_existing" | "duplicate_in_file";
  errors: string[];
}

export const MAX_IMPORT_ROWS = 2000;

/**
 * Parses a customer CSV and classifies every row. Duplicate detection uses the
 * normalised phone number and lower-cased email, against both the existing
 * customers and earlier rows in the same file.
 */
export function previewCustomerImport(
  csvText: string,
  existing: { phone_normalized: string | null; email: string | null }[],
): { rows: PreviewRow[]; unknownColumns: string[]; tooMany: boolean } {
  const parsed = Papa.parse<Record<string, string>>(csvText.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    // Must be idempotent: some Papa versions apply transformHeader more than once.
    transformHeader: (h) => {
      const t = h.trim();
      if (t.startsWith("?") || CANONICAL.has(t)) return t;
      return HEADER_ALIASES[t.toLowerCase()] ?? `?${t}`;
    },
  });
  const fields = parsed.meta.fields ?? [];
  const unknownColumns = fields.filter((f) => f.startsWith("?")).map((f) => f.slice(1));

  const phones = new Set(existing.map((e) => e.phone_normalized).filter(Boolean) as string[]);
  const emails = new Set(existing.map((e) => e.email?.toLowerCase()).filter(Boolean) as string[]);
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  const rows: PreviewRow[] = parsed.data.slice(0, MAX_IMPORT_ROWS).map((raw, idx) => {
    const clean = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith("?")));
    const res = importRowSchema.safeParse(clean);
    const line = idx + 2; // header is line 1
    if (!res.success) {
      return { line, data: null, raw, status: "invalid", errors: res.error.issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`) };
    }
    const phone = normalizePhone(res.data.phone);
    const email = res.data.email;
    if ((phone && phones.has(phone)) || (email && emails.has(email))) {
      return { line, data: res.data, raw, status: "duplicate_existing", errors: ["Already a customer (same phone or email)"] };
    }
    if ((phone && seenPhones.has(phone)) || (email && seenEmails.has(email))) {
      return { line, data: res.data, raw, status: "duplicate_in_file", errors: ["Repeated earlier in this file"] };
    }
    if (phone) seenPhones.add(phone);
    if (email) seenEmails.add(email);
    return { line, data: res.data, raw, status: "ok", errors: [] };
  });

  return { rows, unknownColumns, tooMany: parsed.data.length > MAX_IMPORT_ROWS };
}

/** RFC 4180 CSV with formula-injection protection for spreadsheet apps. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
