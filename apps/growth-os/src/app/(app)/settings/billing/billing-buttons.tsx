"use client";

import { useTransition } from "react";
import { Button, toast, type ButtonProps } from "@platform/ui";
import { ConfirmAction } from "@/components/confirm-action";
import { cancelSubscriptionAction, startCheckoutAction } from "@/server/billing-actions";

export function CheckoutButton({ planCode, label, disabled, variant }: { planCode: string; label: string; disabled?: boolean; variant?: ButtonProps["variant"] }) {
  const [pending, start] = useTransition();
  return (
    <Button className="w-full" variant={variant} disabled={disabled} loading={pending} onClick={() => start(async () => {
      const r = await startCheckoutAction(planCode);
      if (r.ok) window.location.href = r.data.url; // Paystack hosted checkout
      else toast.error(r.error);
    })}>{label}</Button>
  );
}

export function CancelButton() {
  return (
    <ConfirmAction label="Cancel subscription" variant="outline" size="sm" destructive title="Cancel your subscription?"
      description="You keep full access until the end of the period you've paid for. After that the workspace becomes read-only — no data is deleted, and you can resubscribe any time."
      confirmLabel="Cancel subscription" run={() => cancelSubscriptionAction()} />
  );
}
