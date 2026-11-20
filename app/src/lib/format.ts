/** Formatting helpers (Indian locale). Safe on client and server. */
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const money = (n: number | null | undefined) => (n == null || Number.isNaN(Number(n)) ? "-" : inr.format(Number(n)));
export const money0 = (n: number | null | undefined) => (n == null || Number.isNaN(Number(n)) ? "-" : inr0.format(Number(n)));
export const qty = (n: number | null | undefined) => (n == null ? "-" : num.format(Number(n)));
export const pct = (n: number | null | undefined, d = 1) => (n == null || !Number.isFinite(Number(n)) ? "-" : `${Number(n).toFixed(d)}%`);

/** Compact INR: ₹1.25 L, ₹2.4 Cr */
export function moneyShort(n: number | null | undefined) {
  if (n == null) return "-";
  const v = Number(n), a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `₹${(v / 1e3).toFixed(1)} K`;
  return inr0.format(v);
}

/** Dates are stored as 'YYYY-MM-DD' strings (Postgres date). */
export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "-";
  const dt = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00" : d) : d;
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "-";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

/** Today's date in IST as YYYY-MM-DD */
export function todayIST(offsetDays = 0) {
  const now = new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400000);
  return now.toISOString().slice(0, 10);
}
export function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function addMonths(dateStr: string, months: number) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // clamp to the last day of the target month (31-Jan + 1 → 28/29-Feb, 29-Feb + 12 → 28-Feb)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
/** whole days from a to b (b - a) */
export function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);
}
/** Indian financial year label for a date, e.g. 2026-11-21 -> "2026-27" */
export function financialYear(dateStr: string = todayIST()) {
  const [y, m] = dateStr.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
export function marginPct(sell: number, cost: number) {
  if (!sell) return 0;
  return ((sell - cost) / sell) * 100;
}
