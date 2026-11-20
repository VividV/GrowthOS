import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "@platform/database/service";
import { daysLeft } from "@platform/billing";
import { sendEmail, templates } from "@platform/notifications";
import { appUrl } from "@/server/rate-limit";
import { reportError } from "@/server/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret); const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Daily maintenance (Vercel Cron, see vercel.json):
 *  - sync stored subscription status with the computed state (access is always computed live anyway)
 *  - trial reminders at 2 days left and on expiry — never an automatic charge
 */
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const service = getServiceClient();
  const out = { expired: 0, reminders: 0 };
  try {
    const { data: n } = await service.rpc("billing_sweep_expired");
    out.expired = Number(n ?? 0);

    const now = Date.now();
    const { data: trials } = await service.from("subscriptions")
      .select("organization_id, trial_ends_at, status, organizations(name, created_by)")
      .in("status", ["trialing", "expired"])
      .gte("trial_ends_at", new Date(now - 86_400_000).toISOString())
      .lte("trial_ends_at", new Date(now + 3 * 86_400_000).toISOString());
    for (const t of trials ?? []) {
      const left = daysLeft(t.trial_ends_at as string) ?? 0;
      if (left !== 2 && !(t.status === "expired" && left === 0)) continue;
      const org = t.organizations as unknown as { name: string; created_by: string } | null;
      if (!org?.created_by) continue;
      const kind = left === 0 ? "trial.expired_notice" : "trial.ending_notice";
      const { count } = await service.from("audit_logs").select("id", { count: "exact", head: true }).eq("organization_id", t.organization_id).eq("action", kind);
      if (count) continue; // send each reminder once
      const { data: prof } = await service.from("profiles").select("email").eq("id", org.created_by).maybeSingle();
      if (!prof?.email) continue;
      await sendEmail({ to: prof.email as string, ...templates.trialEnding(org.name, left, `${appUrl()}/settings/billing`) });
      await service.from("notifications").insert({ organization_id: t.organization_id, type: "billing", title: left === 0 ? "Your trial has ended" : "2 days left in your trial", body: "Choose a plan to keep making changes. Your data is safe.", link: "/settings/billing" });
      await service.from("audit_logs").insert({ organization_id: t.organization_id, actor_type: "system", action: kind });
      out.reminders += 1;
    }
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    await reportError(e, { where: "cron-daily" });
    return NextResponse.json({ ok: false, ...out }, { status: 500 });
  }
}
