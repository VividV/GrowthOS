"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button } from "@platform/ui";
import { acceptInvitationAction } from "@/server/settings-actions";

export function AcceptInvite({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <Button className="w-full" loading={pending} onClick={() => start(async () => {
        const r = await acceptInvitationAction(token);
        if (r.ok) router.push("/dashboard"); else setError(r.error);
      })}>Accept invitation</Button>
    </div>
  );
}
