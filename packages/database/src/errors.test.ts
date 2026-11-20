import { describe, expect, it } from "vitest";
import { AppError, toAppError, unwrap } from "./errors";

describe("toAppError", () => {
  it("maps app SQLSTATEs to kinds and HTTP statuses, keeping the safe message", () => {
    const e = toAppError({ code: "GO409", message: "Insufficient stock for Kaftan (ADR-M): 1 available" });
    expect([e.kind, e.status, e.message]).toEqual(["conflict", 409, "Insufficient stock for Kaftan (ADR-M): 1 available"]);
    expect(toAppError({ code: "GO402", message: "upgrade" }).status).toBe(402);
    expect(toAppError({ code: "GO403", message: "no" }).kind).toBe("forbidden");
  });
  it("hides internal details of RLS and unknown errors", () => {
    expect(toAppError({ code: "42501", message: "new row violates row-level security policy for table customers" }).message).toMatch(/permission/);
    const unknown = toAppError({ code: "XX000", message: "internal: relation secret_table" });
    expect(unknown.message).not.toContain("secret_table");
    expect(unknown.status).toBe(500);
  });
  it("unwrap throws mapped errors and returns data otherwise", () => {
    expect(unwrap({ data: 5, error: null })).toBe(5);
    expect(() => unwrap({ data: null, error: { code: "GO404", message: "Order not found" } })).toThrow(AppError);
  });
});
