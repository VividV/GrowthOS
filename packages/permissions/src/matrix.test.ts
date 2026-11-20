import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, ROLE_PERMISSIONS, roleCan } from "./index";

describe("permission matrix", () => {
  it("owner holds every permission", () => {
    expect([...ROLE_PERMISSIONS.owner].sort()).toEqual([...PERMISSIONS].sort());
  });
  it("only the owner manages billing", () => {
    for (const r of ["admin", "manager", "staff", "viewer"] as const) expect(roleCan(r, "billing.manage")).toBe(false);
  });
  it("staff cannot see finance or delete", () => {
    expect(roleCan("staff", "finance.read")).toBe(false);
    expect(roleCan("staff", "customers.delete")).toBe(false);
    expect(roleCan("staff", "payments.record")).toBe(true);
  });
  it("viewer has no write permissions", () => {
    const writes = ROLE_PERMISSIONS.viewer.filter((p) => !p.endsWith(".read"));
    expect(writes).toEqual([]);
  });
  it("every role's permissions are known permissions", () => {
    for (const perms of Object.values(ROLE_PERMISSIONS)) for (const p of perms) expect(PERMISSIONS).toContain(p);
  });
  it("can() works on DB-provided lists", () => {
    expect(can(["orders.read"], "orders.read")).toBe(true);
    expect(can(null, "orders.read")).toBe(false);
  });
});
