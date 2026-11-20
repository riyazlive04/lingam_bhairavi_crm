import { z } from "zod";

/** Shared zod pieces for vendor / customer forms. */
export const optStr = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
export const optEmail = z.union([z.literal(""), z.string().trim().email("Invalid email").max(160)]).optional().transform((v) => (v ? v : null));
export const optGstin = z.union([
  z.literal(""),
  z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]{3}$/, "GSTIN must be 15 characters (e.g. 33ABCDE1234F1Z5)"),
]).optional().transform((v) => (v ? v : null));

export const partyBase = {
  name: z.string().trim().min(1, "Name is required").max(200),
  contactPerson: optStr(120),
  phone: optStr(30),
  email: optEmail,
  gstin: optGstin,
  address: optStr(2000),
  city: optStr(80),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  notes: optStr(4000),
};

export const firstErr = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid input";

/** FormData → plain object (single values; repeated keys keep the last). */
export const formObj = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")));
