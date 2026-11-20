import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serviceRoleKey } from "./env";

/**
 * Service-role client: BYPASSES RLS. Only for webhooks, cron jobs, usage
 * logging and the internal admin app — never for answering a user's request
 * for tenant data.
 */
export function getServiceClient(): SupabaseClient {
  return createClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
