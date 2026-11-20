/**
 * Maps database errors to safe, user-facing messages.
 * App error codes come from app.raise() in the migrations.
 */
export type AppErrorKind = "validation" | "subscription" | "forbidden" | "not_found" | "conflict" | "unknown";

export class AppError extends Error {
  constructor(public kind: AppErrorKind, message: string, public status: number) {
    super(message);
    this.name = "AppError";
  }
}

const MAP: Record<string, { kind: AppErrorKind; status: number }> = {
  GO400: { kind: "validation", status: 400 },
  GO402: { kind: "subscription", status: 402 },
  GO403: { kind: "forbidden", status: 403 },
  GO404: { kind: "not_found", status: 404 },
  GO409: { kind: "conflict", status: 409 },
  "42501": { kind: "forbidden", status: 403 },
  "23505": { kind: "conflict", status: 409 },
  "23514": { kind: "validation", status: 400 },
  "23503": { kind: "conflict", status: 409 },
};

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const e = (err ?? {}) as { code?: string; message?: string };
  const m = e.code ? MAP[e.code] : undefined;
  if (m) {
    let message = e.message ?? "Request failed";
    if (e.code === "42501" || /row-level security/i.test(message)) {
      message = "You don't have permission to do that — or your subscription is read-only.";
    } else if (e.code === "23505") {
      message = "That record already exists.";
    } else if (e.code === "23503") {
      message = "This record is in use and can't be removed. Archive it instead.";
    } else if (e.code === "23514") {
      message = "Some values are invalid. Please check the form.";
    }
    return new AppError(m.kind, message, m.status);
  }
  if (/row-level security/i.test(e.message ?? "")) {
    return new AppError("forbidden", "You don't have permission to do that — or your subscription is read-only.", 403);
  }
  return new AppError("unknown", "Something went wrong. Please try again.", 500);
}

/** Throws a mapped AppError when a Supabase response carries an error. */
export function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw toAppError(res.error);
  return res.data;
}
