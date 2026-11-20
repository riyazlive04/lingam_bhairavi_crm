/** Safe user-facing error messages. OWNED BY: Security. */
import { z } from "zod";

/**
 * Turns a thrown value into a message that is safe to show in a ?err= flash.
 * - zod errors → first issue message
 * - plain `new Error("…")` thrown deliberately by our code, or an instance of one of `allowed` → its message
 * - anything else (Drizzle "Failed query: <sql> params: …", Postgres/Neon errors with a SQLSTATE `code`,
 *   TypeError/SyntaxError, …) → logged server-side, generic `fallback` returned (never leak SQL/stack/internals).
 */
export function publicError(e: unknown, fallback = "Something went wrong. Please try again.", allowed: (abstract new (...a: never[]) => Error)[] = []): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback;
  if (e instanceof Error) {
    if (allowed.some((C) => e instanceof C)) return e.message;
    const plain = Object.getPrototypeOf(e) === Error.prototype;
    const dbish = "code" in e || e.cause != null;
    if (plain && !dbish && e.message.length <= 300) return e.message;
  }
  console.error(e);
  return fallback;
}
