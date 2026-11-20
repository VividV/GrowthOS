import { describe, expect, it } from "vitest";
import { registerSchema, safeRedirect } from "./validation";

describe("auth validation", () => {
  it("rejects weak or mismatched passwords", () => {
    expect(registerSchema.safeParse({ fullName: "Ada Obi", email: "a@b.co", password: "short", confirmPassword: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ fullName: "Ada Obi", email: "a@b.co", password: "password1", confirmPassword: "password2" }).success).toBe(false);
    const ok = registerSchema.safeParse({ fullName: "Ada Obi", email: " A@B.CO ", password: "password1", confirmPassword: "password1" });
    expect(ok.success && ok.data.email).toBe("a@b.co");
  });
  it("prevents open redirects", () => {
    expect(safeRedirect("/orders?x=1")).toBe("/orders?x=1");
    expect(safeRedirect("https://evil.com")).toBe("/dashboard");
    expect(safeRedirect("//evil.com")).toBe("/dashboard");
    expect(safeRedirect("/\\evil.com")).toBe("/dashboard");
    expect(safeRedirect(null)).toBe("/dashboard");
  });
});
