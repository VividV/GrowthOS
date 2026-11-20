import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getServerClient } from "@platform/database/server";
import { getServiceClient } from "@platform/database/service";

export type StaffRole = "super_admin" | "support" | "billing" | "analyst";

/** Which internal roles may open which admin areas. */
export const AREA_ROLES: Record<string, StaffRole[]> = {
  overview: ["super_admin", "support", "billing", "analyst"],
  workspaces: ["super_admin", "support", "billing", "analyst"],
  users: ["super_admin", "support"],
  subscriptions: ["super_admin", "billing"],
  plans: ["super_admin", "billing"],
  ai: ["super_admin", "analyst"],
  errors: ["super_admin", "support"],
  support: ["super_admin", "support"],
  flags: ["super_admin"],
  audit: ["super_admin"],
};
/** Roles allowed to perform changes (writes) per area. */
export const WRITE_ROLES: Record<string, StaffRole[]> = {
  workspaces: ["super_admin", "billing"], plans: ["super_admin", "billing"], support: ["super_admin", "support"],
  flags: ["super_admin"], ai: ["super_admin"],
};

export interface Staff { id: string; email: string | null; role: StaffRole }

/**
 * Authenticates with the user's session and checks platform_staff via RPC.
 * Being a staff member does NOT grant any RLS path into tenant business tables;
 * the admin app reads aggregates through service-role functions/views only.
 */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc("my_platform_role");
  if (!data) return null;
  return { id: user.id, email: user.email ?? null, role: data as StaffRole };
});

export async function requireStaff(area: keyof typeof AREA_ROLES): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!AREA_ROLES[area]!.includes(staff.role)) redirect("/?denied=" + area);
  return staff;
}

export async function requireStaffWrite(area: keyof typeof WRITE_ROLES): Promise<Staff> {
  const staff = await getStaff();
  if (!staff || !WRITE_ROLES[area]!.includes(staff.role)) throw new Error("Not permitted");
  return staff;
}

/** Every privileged change is written to audit_logs as actor_type = platform_admin. */
export async function audit(staff: Staff, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}, orgId: string | null = null) {
  await getServiceClient().rpc("admin_log", { p_actor: staff.id, p_action: action, p_entity_type: entityType, p_entity_id: entityId, p_metadata: metadata, p_org: orgId });
}

export const db = () => getServiceClient();
