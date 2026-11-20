import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getServerClient } from "@platform/database/server";
import { toAppError, type WorkspaceContextRow } from "@platform/database";
import { can, type Permission } from "@platform/permissions";

export * from "./validation";

export const WORKSPACE_COOKIE = "gos_workspace";

/** Validated user for this request (cached per request). */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await getServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

export async function requireUser(next?: string): Promise<User> {
  const user = await getUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

export interface Workspace extends WorkspaceContextRow {
  user: User;
  can: (p: Permission) => boolean;
}

export interface WorkspaceSummary { id: string; name: string; is_demo: boolean; role: string }

export const listWorkspaces = cache(async (): Promise<WorkspaceSummary[]> => {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organizations!inner(id, name, is_demo, archived_at)")
    .eq("status", "active");
  if (error) throw toAppError(error);
  type Row = { role: string; organizations: { id: string; name: string; is_demo: boolean; archived_at: string | null } };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => !r.organizations.archived_at)
    .map((r) => ({ id: r.organizations.id, name: r.organizations.name, is_demo: r.organizations.is_demo, role: r.role }))
    .sort((a, b) => Number(a.is_demo) - Number(b.is_demo) || a.name.localeCompare(b.name));
});

/**
 * Resolves the active workspace for this request: cookie → profile default → first membership.
 * Authorisation comes from public.workspace_context (DB enforces membership).
 * Redirects to onboarding when the user has no workspace yet.
 */
export const requireWorkspace = cache(async (): Promise<Workspace> => {
  const user = await requireUser();
  const workspaces = await listWorkspaces();
  if (workspaces.length === 0) redirect("/onboarding");

  const store = await cookies();
  const fromCookie = store.get(WORKSPACE_COOKIE)?.value;
  let orgId = workspaces.find((w) => w.id === fromCookie)?.id;
  if (!orgId) {
    const supabase = await getServerClient();
    const { data: profile } = await supabase.from("profiles").select("default_organization_id").eq("id", user.id).maybeSingle();
    orgId = workspaces.find((w) => w.id === profile?.default_organization_id)?.id ?? workspaces[0]!.id;
  }

  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc("workspace_context", { p_org: orgId });
  if (error) throw toAppError(error);
  const ctx = data as WorkspaceContextRow;
  return { ...ctx, user, can: (p: Permission) => can(ctx.permissions, p) };
});

/** Server-side guard for pages/actions: throws/redirects when the permission is missing. */
export async function requirePermission(permission: Permission): Promise<Workspace> {
  const ws = await requireWorkspace();
  if (!ws.can(permission)) redirect("/dashboard?denied=" + encodeURIComponent(permission));
  return ws;
}
