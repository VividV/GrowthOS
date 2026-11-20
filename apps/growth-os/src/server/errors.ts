import "server-only";

/**
 * Error monitoring: writes unexpected errors to public.app_errors (visible in
 * the admin panel). Swap/augment with Sentry by adding SENTRY_DSN handling here.
 * Never throws.
 */
export async function reportError(err: unknown, context: Record<string, unknown> = {}): Promise<void> {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error("[growth-os]", e.message, context);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  try {
    const { getServiceClient } = await import("@platform/database/service");
    await getServiceClient().from("app_errors").insert({
      app: "growth-os",
      message: e.message.slice(0, 2000),
      stack: e.stack?.slice(0, 8000) ?? null,
      context: JSON.parse(JSON.stringify(context)),
      user_id: typeof context.userId === "string" ? context.userId : null,
      organization_id: typeof context.orgId === "string" ? context.orgId : null,
    });
  } catch {
    /* error reporting must never cascade */
  }
}
