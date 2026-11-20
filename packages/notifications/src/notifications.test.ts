import { describe, expect, it } from "vitest";
import { sendEmail, templates } from "./index";

describe("notifications", () => {
  it("does not claim delivery when unconfigured", async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendEmail({ to: "a@b.co", subject: "x", html: "x", text: "x" })).toEqual({ sent: false, reason: "not_configured" });
  });
  it("escapes user content in templates", () => {
    const t = templates.invitation("<script>alert(1)</script>", "Ada & Co", "staff", "https://app/invite?t=1");
    expect(t.html).not.toContain("<script>");
    expect(t.html).toContain("Ada &amp; Co");
    expect(t.text).toContain("https://app/invite?t=1");
  });
  it("sends via Resend when configured", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Growth OS <hello@example.com>";
    const fake = (async () => new Response(JSON.stringify({ id: "em_1" }))) as unknown as typeof fetch;
    expect(await sendEmail({ to: "a@b.co", ...templates.welcome("Ada Obi", "https://app") }, fake)).toEqual({ sent: true, id: "em_1" });
    delete process.env.RESEND_API_KEY;
  });
});
