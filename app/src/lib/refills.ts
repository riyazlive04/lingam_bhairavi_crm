/**
 * Extinguisher refill tracker helpers (business rule 8). Maintainer: Sirah Digital.
 * Internal reminders only; customers are never notified automatically.
 */
import "server-only";
import { and, asc, eq, lte } from "drizzle-orm";
import type { DB } from "@/db";
import { customers, extinguisherAssets } from "@/db/schema";
import { addDays, addMonths, daysBetween, todayIST } from "./format";

export const REFILL_INTERVALS = [12, 36] as const;
export const REFILL_KINDS = { refill: "Refill", service: "Service / inspection", hpt: "Hydraulic pressure test", replacement: "Replacement" } as const;
export type RefillKind = keyof typeof REFILL_KINDS;
/** Default HPT cycle when a pressure test is recorded without an explicit next date. */
export const HPT_INTERVAL_MONTHS = 60;

/** Rule 8: next due = date + interval months. */
export function computeNextDue(fromDate: string, intervalMonths: number) {
  return addMonths(fromDate, intervalMonths);
}

export type RefillBucket = "overdue" | "due10" | "due30" | "later";
export const BUCKET_LABELS: Record<RefillBucket, string> = {
  overdue: "Overdue", due10: "Due in 10 days", due30: "Due in 30 days", later: "Later",
};

export function refillBucket(nextDueDate: string, today = todayIST()): RefillBucket {
  const d = daysBetween(today, nextDueDate);
  if (d < 0) return "overdue";
  if (d <= 10) return "due10";
  if (d <= 30) return "due30";
  return "later";
}

export type RefillDueRow = {
  id: number;
  customerId: number;
  customerName: string;
  customerPhone: string | null;
  location: string | null;
  extType: string;
  make: string | null;
  serialNo: string | null;
  qty: number;
  lastRefillDate: string | null;
  refillIntervalMonths: number;
  nextDueDate: string;
  hptDueDate: string | null;
  /** negative = overdue by that many days */
  daysLeft: number;
};

/**
 * Active assets whose refill is due on/before today + `withinDays` (overdue ones included),
 * soonest first. Used by the dashboard and the Refill-Due automation agent (10-day rule).
 */
export async function refillsDue(db: DB, withinDays: number): Promise<RefillDueRow[]> {
  const today = todayIST();
  const until = addDays(today, Math.max(0, Math.floor(withinDays)));
  const rows = await db
    .select({
      id: extinguisherAssets.id,
      customerId: extinguisherAssets.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
      location: extinguisherAssets.location,
      extType: extinguisherAssets.extType,
      make: extinguisherAssets.make,
      serialNo: extinguisherAssets.serialNo,
      qty: extinguisherAssets.qty,
      lastRefillDate: extinguisherAssets.lastRefillDate,
      refillIntervalMonths: extinguisherAssets.refillIntervalMonths,
      nextDueDate: extinguisherAssets.nextDueDate,
      hptDueDate: extinguisherAssets.hptDueDate,
    })
    .from(extinguisherAssets)
    .innerJoin(customers, eq(customers.id, extinguisherAssets.customerId))
    .where(and(eq(extinguisherAssets.status, "active"), lte(extinguisherAssets.nextDueDate, until)))
    .orderBy(asc(extinguisherAssets.nextDueDate), asc(customers.name));
  return rows.map((r) => ({ ...r, qty: Number(r.qty), daysLeft: daysBetween(today, r.nextDueDate) }));
}

/** Internal WhatsApp/phone reminder text (client-safe implementation lives with the refills module). */
export { reminderText } from "@/app/(app)/refills/_lib/reminder";
