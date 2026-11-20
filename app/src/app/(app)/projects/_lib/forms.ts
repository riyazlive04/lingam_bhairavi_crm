/** Form/zod helpers shared by Team D modules (projects, expenses, refills, meeting notes, settings). */
import { z } from "zod";

/** Error whose message is safe to show to the user. */
export class UserError extends Error {}

const blankToUndef = (v: unknown) => (v === "" || v == null ? undefined : typeof v === "string" ? v.trim() : v);

export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
export const zOptDate = z.preprocess(blankToUndef, zDate.optional());
export const zOptText = (max = 500) => z.preprocess(blankToUndef, z.string().max(max).optional());
export const zText = (max = 200, label = "This field") => z.string().trim().min(1, `${label} is required`).max(max);
export const zOptId = z.preprocess(blankToUndef, z.coerce.number().int().positive().optional());
export const zId = z.coerce.number().int().positive();
export const zMoney = z.preprocess((v) => (v === "" || v == null ? 0 : v), z.coerce.number().min(0, "Amount cannot be negative").max(1e11));

/** Turn any thrown error into a short, safe message (never leak SQL / stack traces). */
export function errMsg(e: unknown, fallback = "Could not save. Please try again."): string {
  if (e instanceof z.ZodError) {
    const i = e.issues[0];
    const field = i?.path?.length ? String(i.path[i.path.length - 1]) : "";
    return field && !i.message.toLowerCase().includes(field.toLowerCase()) ? `${field}: ${i.message}` : i?.message ?? fallback;
  }
  if (e instanceof UserError) return e.message;
  console.error(e);
  return fallback;
}

/** Build a URL with ?ok= / ?err= flash param. */
export function flashUrl(path: string, kind: "ok" | "err", msg: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`;
}

/** Postgres unique violation detection (works for PGlite & Neon). */
export function isUniqueViolation(e: unknown) {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}
