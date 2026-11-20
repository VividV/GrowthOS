"use client";

import Link from "next/link";
import { useTransition } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { Button, toast } from "@platform/ui";
import { resetDemoAction, switchWorkspaceAction } from "@/server/workspace-actions";

export function DemoBanner({ canReset, realWorkspace, isAnonymous }: { canReset: boolean; realWorkspace: { id: string; name: string } | null; isAnonymous: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="border-b border-info/20 bg-info-soft px-4 py-2 text-sm text-info sm:px-6 lg:px-8 no-print">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4" />
          <span><span className="font-semibold">Demo workspace</span> <span className="text-foreground/80">— all customers, orders and figures here are fictional.</span></span>
        </p>
        <div className="flex items-center gap-2">
          {canReset && (
            <Button size="sm" variant="ghost" loading={pending} onClick={() => start(async () => {
              const r = await resetDemoAction();
              if (r.ok) toast.success(r.message ?? "Demo reset"); else toast.error(r.error);
            })}>
              <RotateCcw /> Reset demo
            </Button>
          )}
          {realWorkspace ? (
            <Button size="sm" onClick={() => start(() => switchWorkspaceAction(realWorkspace.id))}>Go to {realWorkspace.name}</Button>
          ) : isAnonymous ? (
            <Button size="sm" asChild><Link href="/settings/account">Create your account</Link></Button>
          ) : (
            <Button size="sm" asChild><Link href="/onboarding?new=1">Set up my business</Link></Button>
          )}
        </div>
      </div>
    </div>
  );
}
