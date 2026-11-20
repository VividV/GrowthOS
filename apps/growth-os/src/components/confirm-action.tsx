"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Dialog, DialogContent, DialogTrigger, Textarea, toast, type ButtonProps } from "@platform/ui";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/**
 * Button → confirmation dialog → server action. Optionally collects a reason
 * (required for voids/cancellations so the audit log is meaningful).
 */
export function ConfirmAction({
  label, title, description, confirmLabel = "Confirm", destructive, run, redirectTo, reason, variant, size, icon, className,
}: {
  label: React.ReactNode; title: string; description?: React.ReactNode; confirmLabel?: string; destructive?: boolean;
  run: (reason: string) => Promise<Result>; redirectTo?: string; reason?: { label: string; required?: boolean; placeholder?: string };
  variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; icon?: React.ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const go = () =>
    start(async () => {
      const r = await run(text.trim());
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(r.message ?? "Done");
      setOpen(false);
      setText("");
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant ?? (destructive ? "outline" : "default")} size={size} className={className}>{icon}{label}</Button>
      </DialogTrigger>
      <DialogContent title={title} description={description} size="sm">
        {reason && (
          <div className="mb-4 space-y-1.5">
            <label className="text-sm font-medium" htmlFor="confirm-reason">{reason.label}{reason.required && <span className="text-danger"> *</span>}</label>
            <Textarea id="confirm-reason" value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder} className="min-h-[70px]" />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={go} loading={pending} disabled={Boolean(reason?.required && !text.trim())}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
