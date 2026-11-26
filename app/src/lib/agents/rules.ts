/**
 * Pure, side-effect-free helpers used by the automation agents. Safe to unit test (no DB, no server-only).
 * All dates are 'YYYY-MM-DD' strings (IST calendar days).
 */
import { addDays, daysBetween } from "@/lib/format";
import type { AlertDraft, Severity } from "./types";

export const SEVERITY_RANK: Record<Severity, number> = { info: 1, warning: 2, critical: 3 };

/** Normalise a Date / ISO timestamp / date string to an IST calendar day 'YYYY-MM-DD'. */
export function toISTDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Start of an IST calendar day as an absolute instant. */
export function istDayStart(date: string): Date {
  return new Date(`${date}T00:00:00+05:30`);
}

/** Days `date` is past `today` (positive = overdue, 0 = due today, negative = days remaining). */
export function daysOverdue(date: string, today: string): number {
  return daysBetween(date, today);
}

/** True when `dueDate` is strictly before `today` minus `graceDays`. Null due date is never overdue. */
export function isOverdue(dueDate: string | null | undefined, today: string, graceDays = 0): boolean {
  if (!dueDate) return false;
  return dueDate < addDays(today, -Math.max(0, graceDays));
}

/** True when `date` falls within [today, today + days]. */
export function isDueWithin(date: string | null | undefined, today: string, days: number): boolean {
  if (!date) return false;
  return date >= today && date <= addDays(today, days);
}

export type AgeingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";
export const AGEING_BUCKETS: AgeingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

/** Receivable/payable ageing bucket by days past due. */
export function bucketAgeing(daysPastDue: number): AgeingBucket {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "90+";
}

/**
 * Date on which the next payment reminder becomes due for an invoice, or null if no more reminders.
 * - never reminded → dueDate + firstReminderDaysOverdue
 * - reminded before → max(lastReminder + repeatEveryDays, dueDate + firstReminderDaysOverdue)
 */
export function computeNextReminderDue(opts: {
  dueDate: string;
  lastReminderAt: Date | string | null | undefined;
  reminderCount: number;
  firstReminderDaysOverdue: number;
  repeatEveryDays: number;
  maxReminders: number;
}): string | null {
  if (opts.reminderCount >= opts.maxReminders) return null;
  const first = addDays(opts.dueDate, Math.max(0, opts.firstReminderDaysOverdue));
  const last = toISTDate(opts.lastReminderAt ?? null);
  if (!last) return first;
  const repeat = addDays(last, Math.max(1, opts.repeatEveryDays));
  return repeat > first ? repeat : first;
}

/** Whether a reminder should go out today. */
export function isReminderDue(opts: Parameters<typeof computeNextReminderDue>[0] & { today: string }): boolean {
  const next = computeNextReminderDue(opts);
  return next != null && next <= opts.today;
}

/** Severity of an overdue condition by days late. */
export function severityForLateness(days: number, criticalAfter = 7): Severity {
  if (days > criticalAfter) return "critical";
  if (days > 0) return "warning";
  return "info";
}

/** Merge stored params over defaults; drop unknown keys; coerce numerics; fall back to defaults when invalid. */
export function mergeParams<P extends Record<string, number>>(defaults: P, stored: Record<string, unknown> | null | undefined): P {
  const out = { ...defaults } as Record<string, number>;
  if (stored) {
    for (const k of Object.keys(defaults)) {
      const v = stored[k];
      const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  return out as P;
}

/** Group an array by a key function, preserving first-seen order. */
export function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/** Short stable hash (FNV-1a, base36) for dedupe keys built from free text. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)) + "…";
}

/** "a, b, c +2 more" */
export function listPreview(values: string[], max = 4): string {
  const uniq = [...new Set(values.filter(Boolean))];
  if (uniq.length <= max) return uniq.join(", ");
  return `${uniq.slice(0, max).join(", ")} +${uniq.length - max} more`;
}

export function plural(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "5 days overdue" / "due today" / "due in 3 days" */
export function describeDue(date: string, today: string): string {
  const d = daysBetween(date, today);
  if (d > 0) return `${plural(d, "day")} overdue`;
  if (d === 0) return "due today";
  return `due in ${plural(-d, "day")}`;
}

/** Fit a draft into the column limits of the alerts table. */
export function clampDraft(d: AlertDraft): AlertDraft {
  return {
    ...d,
    dedupeKey: truncate(d.dedupeKey, 160),
    title: truncate(d.title, 200),
    link: d.link ? truncate(d.link, 200) : d.link,
  };
}

/** Project actual cost (CONVENTIONS rules 5 and 13): issued − site returns − restocked customer returns + approved expenses. */
export function projectActualCost(issued: number, returned: number, approvedExpenses: number, customerReturned = 0): number {
  return Math.max(0, Number(issued) || 0) - Math.abs(Number(returned) || 0) - Math.abs(Number(customerReturned) || 0) + (Number(approvedExpenses) || 0);
}

/** Budget usage as % (0 when no budget). */
export function budgetUsedPct(actual: number, budget: number): number {
  return budget > 0 ? (actual / budget) * 100 : 0;
}

/** Decide what the engine does with an existing alert row when the agent re-emits its key. */
export function reconcileExisting(
  existing: { status: string; severity: string; snoozedUntil: string | null },
  draft: { severity: Severity },
  today: string,
): "keep" | "reopen" {
  if (existing.status === "open") return "keep";
  if (existing.status === "snoozed") return existing.snoozedUntil == null || existing.snoozedUntil <= today ? "reopen" : "keep";
  // done: stays done, unless the condition escalated (e.g. "due in 2 days" info → "5 days overdue" critical)
  const before = SEVERITY_RANK[existing.severity as Severity] ?? 0;
  return SEVERITY_RANK[draft.severity] > before ? "reopen" : "keep";
}

/** IST month start for a date: '2026-11-21' → '2026-11-01'. */
export function monthStart(date: string): string {
  return date.slice(0, 8) + "01";
}

/** Last n month keys 'YYYY-MM' ending with the month of `today` (oldest first). */
export function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}
