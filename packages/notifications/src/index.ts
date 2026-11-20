/**
 * Transactional email via Resend (REST). Auth emails (verification, password
 * reset) are sent by Supabase Auth — configure Supabase SMTP to use Resend so
 * every email comes from the same domain. This module sends product emails.
 *
 * When RESEND_API_KEY is missing, sendEmail() returns { sent: false } and logs —
 * it never pretends an email was delivered.
 */
export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

export type SendResult = { sent: true; id: string } | { sent: false; reason: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(msg: EmailMessage, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.warn(`[notifications] email not sent (RESEND_API_KEY/EMAIL_FROM unset): ${msg.subject}`);
    return { sent: false, reason: "not_configured" };
  }
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, reply_to: msg.replyTo, tags: msg.tags }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) return { sent: false, reason: body.message ?? `HTTP ${res.status}` };
    return { sent: true, id: body.id };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "network_error" };
  }
}

/* ------------------------------------------------------------------ Templates */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(product: string, heading: string, paragraphs: string[], cta?: { label: string; url: string }): { html: string; text: string } {
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #e5e7eb;border-radius:12px">
<tr><td style="padding:28px 28px 8px"><div style="font-weight:600;color:#0b6b4f">${esc(product)}</div>
<h1 style="font-size:20px;margin:16px 0 8px">${esc(heading)}</h1>
${paragraphs.map((p) => `<p style="font-size:14px;line-height:22px;color:#334155;margin:0 0 12px">${esc(p)}</p>`).join("")}
${cta ? `<p style="margin:20px 0"><a href="${esc(cta.url)}" style="background:#0b6b4f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>` : ""}
</td></tr><tr><td style="padding:0 28px 24px;font-size:12px;color:#94a3b8">You're receiving this because you have a ${esc(product)} account.</td></tr></table>
</td></tr></table></body></html>`;
  const text = [heading, "", ...paragraphs, ...(cta ? ["", `${cta.label}: ${cta.url}`] : [])].join("\n");
  return { html, text };
}

const PRODUCT = "Growth OS";

export const templates = {
  welcome: (name: string, appUrl: string) => ({
    subject: "Welcome to Growth OS — your 7-day trial has started",
    ...layout(PRODUCT, `Welcome, ${name.split(" ")[0] || "there"}`, [
      "Your workspace is ready and your 7-day free trial has started. No card needed — we will never charge you automatically when the trial ends.",
      "Start by adding a few products and customers, then record your first order. Your dashboard and AI assistant will come alive with your numbers.",
    ], { label: "Open Growth OS", url: `${appUrl}/dashboard` }),
  }),
  invitation: (inviter: string, business: string, role: string, url: string) => ({
    subject: `${inviter} invited you to ${business} on Growth OS`,
    ...layout(PRODUCT, `Join ${business}`, [`${inviter} has invited you to join ${business} as ${role}.`, "This invitation expires in 7 days."], { label: "Accept invitation", url }),
  }),
  trialEnding: (business: string, days: number, url: string) => ({
    subject: days <= 0 ? "Your Growth OS trial has ended" : `Your Growth OS trial ends in ${days} day${days === 1 ? "" : "s"}`,
    ...layout(PRODUCT, days <= 0 ? "Your trial has ended" : "Your trial is ending soon", [
      `${business}'s trial ${days <= 0 ? "has ended. Your workspace is now read-only" : `ends in ${days} day${days === 1 ? "" : "s"}`}. All your records are safe.`,
      "Pick a plan to keep adding orders, customers and products.",
    ], { label: "Choose a plan", url }),
  }),
  paymentReceived: (business: string, plan: string, amount: string, until: string, url: string) => ({
    subject: `Payment received — ${plan} plan`,
    ...layout(PRODUCT, "Thank you for your payment", [`We received ${amount} for ${business}'s ${plan} plan.`, `Your subscription is active until ${until}.`], { label: "View billing", url }),
  }),
  paymentFailed: (business: string, url: string) => ({
    subject: "Action needed: subscription payment failed",
    ...layout(PRODUCT, "We couldn't process your payment", [`The renewal payment for ${business} failed. You have a short grace period before the workspace becomes read-only.`], { label: "Update payment", url }),
  }),
};
