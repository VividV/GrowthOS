import { requireWorkspace } from "@platform/auth";
import { getServerClient } from "@platform/database/server";
import { ROLE_LABELS, type Role } from "@platform/permissions";
import { Avatar, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress, formatDate } from "@platform/ui";
import { InviteForm, MemberControls, RevokeInvite } from "./team-controls";

export const metadata = { title: "Team" };

export default async function Team() {
  const ws = await requireWorkspace();
  const supabase = await getServerClient();
  const manage = ws.can("members.manage") && ws.writable;
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("organization_members").select("id, user_id, role, status, created_at, profiles(full_name, email)").eq("organization_id", ws.organization.id).order("created_at"),
    ws.can("members.manage") ? supabase.from("organization_invitations").select("id, email, role, expires_at, created_at").eq("organization_id", ws.organization.id).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()) : Promise.resolve({ data: [] }),
  ]);
  const rows = (members ?? []) as unknown as { id: string; user_id: string; role: Role; status: string; created_at: string; profiles: { full_name: string; email: string | null } | null }[];
  const seats = ws.entitlements.max_users?.limit ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Team members</CardTitle>
          <CardDescription>{seats === null ? `${rows.length} members` : `${rows.length} of ${seats} seats used on your plan`}</CardDescription>
          {seats !== null && <Progress value={rows.length} max={seats} tone={rows.length >= seats ? "warning" : "primary"} className="mt-2" />}
        </CardHeader>
        <CardContent className="pt-3">
          <ul className="divide-y">
            {rows.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={m.profiles?.full_name || m.profiles?.email} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.profiles?.full_name || "—"}{m.user_id === ws.user.id && <span className="text-muted-foreground"> (you)</span>}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.profiles?.email} · joined {formatDate(m.created_at)}</p>
                </div>
                {manage && m.role !== "owner" && m.user_id !== ws.user.id && (ws.role === "owner" || m.role !== "admin")
                  ? <MemberControls memberId={m.id} role={m.role} canAssignAdmin={ws.role === "owner"} name={m.profiles?.full_name || "this member"} />
                  : <Badge tone={m.role === "owner" ? "primary" : "neutral"}>{ROLE_LABELS[m.role].label}</Badge>}
              </li>
            ))}
          </ul>
          {(invites ?? []).length > 0 && (
            <>
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending invitations</p>
              <ul className="divide-y">
                {(invites ?? []).map((i) => (
                  <li key={i.id as string} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>{i.email as string} <Badge className="ml-1">{ROLE_LABELS[i.role as Role].label}</Badge></span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">expires {formatDate(i.expires_at as string)}{manage && <RevokeInvite id={i.id as string} />}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
      <div className="space-y-4">
        {manage && <InviteForm canInviteAdmin={ws.role === "owner"} />}
        <Card>
          <CardHeader><CardTitle>Roles</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <div key={r}><dt className="font-medium">{ROLE_LABELS[r].label}</dt><dd className="text-muted-foreground">{ROLE_LABELS[r].description}</dd></div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
