"use client";

import * as React from "react";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Alert, toast } from "@platform/ui";

type Result = { ok: true; data: unknown; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> } | null;

const FieldErrorsContext = React.createContext<Record<string, string>>({});
export const useFieldError = (name: string) => React.useContext(FieldErrorsContext)[name];

/**
 * Progressive-enhancement form bound to a server action returning ActionResult.
 * Shows a toast on success, an inline alert on failure, and exposes field errors
 * to nested inputs via useFieldError().
 */
export function ActionForm({
  action, children, className, onSuccess, resetOnSuccess, refresh = true, successToast = true, showErrorAlert = true,
}: {
  action: (state: Result, fd: FormData) => Promise<Result>;
  children: React.ReactNode | ((state: { pending: boolean; result: Result }) => React.ReactNode);
  className?: string;
  onSuccess?: (data: unknown) => void;
  resetOnSuccess?: boolean;
  refresh?: boolean;
  successToast?: boolean;
  showErrorAlert?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const lastHandled = useRef<Result>(null);

  useEffect(() => {
    if (!state || state === lastHandled.current) return;
    lastHandled.current = state;
    if (state.ok) {
      if (successToast && state.message) toast.success(state.message);
      if (resetOnSuccess) ref.current?.reset();
      if (refresh) router.refresh();
      onSuccess?.(state.data);
    }
  }, [state, onSuccess, resetOnSuccess, refresh, router, successToast]);

  return (
    <FieldErrorsContext.Provider value={state && !state.ok ? state.fieldErrors ?? {} : {}}>
      {/* Submit via a transition instead of <form action>: React 19 resets forms after an action,
          which would wipe what the user typed when validation fails. */}
      <form ref={ref} className={className} noValidate onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}>
        {showErrorAlert && state && !state.ok && <Alert tone="danger" className="mb-4">{state.error}</Alert>}
        {typeof children === "function" ? children({ pending, result: state }) : children}
      </form>
    </FieldErrorsContext.Provider>
  );
}
