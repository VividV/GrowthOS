"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, UserMinus, UserPlus } from "lucide-react";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, Select, toast } from "@platform/ui";
import { ActionForm } from "@/components/action-form";
import { SelectField, TextField } from "@/components/form-fields";
import { ConfirmAction } from "@/components/confirm-action";
import { inviteMemberAction, removeMemberAction, revokeInvitationAction, updateMemberAction } from "@/server/settings-actions";

export function InviteForm({ canInviteAdmin }: { canInviteAdmin: boolean }) {
  const [link, setLink] = useState<{ link: string; emailed: boolean } | null>(null);
  return (
    <Card>
      <CardHeader><CardTitle>Invite a teammate</CardTitle></CardHeader>
      <CardContent>
        <ActionForm action={inviteMemberAction} resetOnSuccess className="space-y-3" onSuccess={(d) => setLink(d as { link: string; emailed: boolean })}>
          {({ pending }) => (
            <>
              <TextField name="email" label="Email" type="email" required placeholder="teammate@example.com" />
              <SelectField name="role" label="Role" defaultValue="staff">
                {canInviteAdmin && <option value="admin">Admin</option>}
                <option value="manager">Manager</option><option value="staff">Staff</option><option value="viewer">Viewer</option>
              </SelectField>
              <Button type="submit" className="w-full" loading={pending}><UserPlus /> Send invitation</Button>
            </>
          )}
        </ActionForm>
        {link && (
          <div className="mt-4 space-y-2">
            <Alert tone={link.emailed ? "success" : "info"}>{link.emailed ? "Invitation emailed." : "Email isn't configured — share this link directly (e.g. on WhatsApp)."}</Alert>
            <div className="flex gap-2">
              <Input readOnly value={link.link} className="text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button size="icon" variant="outline" aria-label="Copy link" onClick={() => { void navigator.clipboard.writeText(link.link); toast.success("Link copied"); }}><Copy /></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MemberControls({ memberId, role, canAssignAdmin, name }: { memberId: string; role: string; canAssignAdmin: boolean; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-1">
      <Select value={role} disabled={pending} className="h-8 w-32 text-xs" aria-label="Role" onChange={(e) => {
        const next = e.target.value;
        start(async () => { const r = await updateMemberAction(memberId, next); if (r.ok) { toast.success(r.message ?? "Updated"); router.refresh(); } else toast.error(r.error); });
      }}>
        {(canAssignAdmin || role === "admin") && <option value="admin">Admin</option>}
        <option value="manager">Manager</option><option value="staff">Staff</option><option value="viewer">Viewer</option>
      </Select>
      <ConfirmAction label="" icon={<UserMinus />} size="icon" variant="ghost" destructive title={`Remove ${name}?`}
        description="They lose access immediately. Their past records stay." confirmLabel="Remove" run={() => removeMemberAction(memberId)} />
    </div>
  );
}

export function RevokeInvite({ id }: { id: string }) {
  return <ConfirmAction label="Revoke" size="sm" variant="ghost" destructive title="Revoke this invitation?" run={() => revokeInvitationAction(id)} />;
}
