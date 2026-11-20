import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError, type ZodSchema } from "zod";
import { toAppError, AppError } from "@platform/database";
import { reportError } from "./errors";

export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; kind?: string };

/**
 * Wraps a server action: validates nothing on its own, but guarantees a
 * serialisable result, maps DB errors (GO4xx) to friendly messages, and
 * reports unexpected errors to the error log.
 */
export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn(), message };
  } catch (e) {
    unstable_rethrow(e); // let Next redirects / notFound propagate
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
      return { ok: false, error: "Please fix the highlighted fields.", fieldErrors, kind: "validation" };
    }
    const err = toAppError(e);
    if (err.kind === "unknown") await reportError(e, { where: "server-action" });
    return { ok: false, error: err.message, kind: err.kind };
  }
}

export function parse<T>(schema: ZodSchema<T>, input: unknown): T {
  return schema.parse(input);
}

export function fail(message: string, kind: ConstructorParameters<typeof AppError>[0] = "validation"): never {
  throw new AppError(kind, message, 400);
}

/** Converts FormData into a plain object (multi-value keys become arrays). */
export function formToObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}
