export * from "./matrix";
import { ROLE_PERMISSIONS, type Permission, type Role } from "./matrix";

export function roleCan(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Checks a permission list returned by public.workspace_context (DB is authoritative). */
export function can(permissions: readonly string[] | undefined | null, permission: Permission): boolean {
  return Boolean(permissions?.includes(permission));
}
