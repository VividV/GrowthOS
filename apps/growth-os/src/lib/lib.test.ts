import { describe, expect, it } from "vitest";
import { bucketFor, percentChange, resolveRange, todayIn } from "./dates";
import { buildInsights, type InsightInput } from "./insights";
import { normalizePhone, previewCustomerImport, toCsv } from "./csv";

const NOW = new Date("2026-11-20T23:30:00Z"); // 00:30 on the 21st in Lagos (UTC+1)

describe("date ranges", () => {
  it("uses the workspace timezone for 'today'", () => {
    expect(todayIn("Africa/Lagos", NOW)).toBe("2026-11-21");
    expect(todayIn("UTC", NOW)).toBe("2026-11-20");
  });
  it("this month compares with the same span last month", () => {
    const r = resolveRange({ range: "month" }, "Africa/Lagos", NOW);
    expect([r.from, r.to, r.prevFrom, r.prevTo]).toEqual(["2026-11-01", "2026-11-21", "2026-10-01", "2026-10-21"]);
  });
  it("last month is the whole previous month", () => {
    const r = resolveRange({ range: "last_month" }, "Africa/Lagos", NOW);
    expect([r.from, r.to, r.prevFrom, r.prevTo]).toEqual(["2026-10-01", "2026-10-31", "2026-09-01", "2026-09-30"]);
  });
  it("this week starts Monday", () => {
    const r = resolveRange({ range: "week" }, "Africa/Lagos", NOW); // Sat 21 Nov
    expect([r.from, r.to, r.prevFrom, r.prevTo]).toEqual(["2026-11-16", "2026-11-21", "2026-11-10", "2026-11-15"]);
  });
  it("custom ranges are validated and fall back to this month", () => {
    expect(resolveRange({ range: "custom", from: "2026-01-01", to: "2026-01-31" }, "UTC", NOW).from).toBe("2026-01-01");
    expect(resolveRange({ range: "custom", from: "2026-02-01", to: "2026-01-01" }, "UTC", NOW).key).toBe("month");
    expect(resolveRange({ range: "custom", from: "nope", to: "x" }, "UTC", NOW).key).toBe("month");
    expect(resolveRange({ range: "garbage" }, "UTC", NOW).key).toBe("month");
  });
  it("buckets and percentage change", () => {
    expect(bucketFor(resolveRange({ range: "90d" }, "UTC", NOW))).toBe("week");
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(10, 0)).toBeNull(); // no fake infinite growth
    expect(percentChange(0, 0)).toBe(0);
  });
});

describe("insights", () => {
  const base: InsightInput = {
    currency: "NGN", rangeLabel: "This month",
    current: { net_sales: 120000, cash_received: 100000, order_count: 8, new_customers: 2 },
    previous: { net_sales: 100000, order_count: 6 },
    lowStock: [], balances: [], topProduct: null, overdueTasks: 0, draftEnquiries: 0, outstandingTotal: 0, hasAnyOrders: true,
  };
  it("asks for a first order when there is no data rather than inventing insights", () => {
    const r = buildInsights({ ...base, hasAnyOrders: false });
    expect(r.map((x) => x.id)).toEqual(["no-orders"]);
  });
  it("reports sales growth with evidence", () => {
    const [s] = buildInsights(base);
    expect(s?.title).toBe("Sales up 20% vs the previous period");
    expect(s?.evidence).toEqual({ current: 120000, previous: 100000 });
  });
  it("skips small changes and flags stock, balances and cash gaps", () => {
    const r = buildInsights({
      ...base,
      previous: { net_sales: 118000, order_count: 8 },
      current: { ...base.current, cash_received: 20000 },
      lowStock: [{ product_name: "Shea", variant_name: null, quantity_available: 0 }, { product_name: "Shirt", variant_name: "Blue / S", quantity_available: 1 }],
      balances: [{ customer_name: "Ngozi", outstanding: 30000 }],
      outstandingTotal: 30000,
    });
    const ids = r.map((x) => x.id);
    expect(ids).not.toContain("sales-trend");
    expect(ids).toEqual(expect.arrayContaining(["low-stock", "balances", "cash-gap"]));
    expect(r.find((x) => x.id === "low-stock")?.detail).toContain("1 out of stock");
  });
});

describe("customer CSV import", () => {
  const existing = [{ phone_normalized: "2348031234567", email: "old@x.com" }];
  it("maps common headers, validates, and detects duplicates", () => {
    const csv = "﻿Name,Phone Number,Email,City,Favourite colour\n" +
      "Ada Obi,0803 123 4567,,Lagos,red\n" +   // dup of existing phone
      "Bola,+234 802 000 0000,bola@x.com,Ibadan,\n" +
      "Bola Again,08020000000,,,\n" +          // dup within file (same normalised phone)
      ",0809,,,\n" +                           // invalid: no name
      "Chi,,OLD@X.com,,\n" +                   // dup of existing email (case-insensitive)
      "Dayo,,not-an-email,,\n";
    const { rows, unknownColumns } = previewCustomerImport(csv, existing);
    expect(unknownColumns).toEqual(["Favourite colour"]);
    expect(rows.map((r) => r.status)).toEqual(["duplicate_existing", "ok", "duplicate_in_file", "invalid", "duplicate_existing", "invalid"]);
    expect(rows[1]?.data).toMatchObject({ full_name: "Bola", email: "bola@x.com", location: "Ibadan", source: "import" });
    expect(rows[3]?.line).toBe(5);
  });
  it("normalises phones like the database", () => {
    expect(normalizePhone("0803-123-4567")).toBe("2348031234567");
    expect(normalizePhone("+234 803 123 4567")).toBe("2348031234567");
    expect(normalizePhone("")).toBeNull();
  });
});

describe("CSV export", () => {
  it("quotes properly and neutralises spreadsheet formulas", () => {
    const out = toCsv(["name", "note"], [["Ada, Obi", '=HYPERLINK("x")'], ["B", null], ["-5 debt", 12]]);
    expect(out).toBe('name,note\r\n"Ada, Obi","\'=HYPERLINK(""x"")"\r\nB,\r\n\'-5 debt,12\r\n');
  });
});
