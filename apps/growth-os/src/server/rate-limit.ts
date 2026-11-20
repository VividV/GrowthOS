import "server-only";
import { headers } from "next/headers";

const memory = new Map<string, { windowStart: number; hits: number }>();

/**
 * Fixed-window rate limiter. Uses the shared DB limiter (works across
 * serverless instances) when the service role is configured, else a
 * per-instance in-memory fallback.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { getServiceClient } = await import("@platform/database/service");
      const { data, error } = await getServiceClient().rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSeconds, p_max: max });
      if (!error) return Boolean(data);
    } catch {
      /* fall through to memory */
    }
  }
  const now = Date.now();
  const windowStart = Math.floor(now / (windowSeconds * 1000));
  const entry = memory.get(key);
  if (!entry || entry.windowStart !== windowStart) {
    memory.set(key, { windowStart, hits: 1 });
    return true;
  }
  entry.hits += 1;
  return entry.hits <= max;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
