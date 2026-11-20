/**
 * Billing domain helpers: receivables/payables ageing, customer ledger, invoice status (rule 6),
 * Indian amount-in-words, reminder/statement e-mail builders. Maintainer: Sirah Digital.
 *
 * `buildReminderEmail` is a pure function; the Automation Agents team imports it for automatic dunning,
 * so its signature must stay stable.
 */
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { customers, payments, purchaseInvoices, salesInvoices, settings, vendors } from "@/db/schema";
import { addDays, daysBetween, fmtDate, money, round2, todayIST } from "./format";

type DbLike = Pick<DB, "select">;

/** Invoices that still carry a receivable. */
export const OPEN_INVOICE_STATUSES = ["issued", "partially_paid"] as const;
/** Payments are considered settled within ₹0.50 (rule 6). */
export const PAID_TOLERANCE = 0.5;

// ---------------------------------------------------------------- status

/** Rule 6: status after a payment change. Cancelled/draft invoices are left alone. */
export function invoiceStatusFor(total: number, paidAmount: number, current: string): string {
  if (current === "cancelled" || current === "draft") return current;
  if (paidAmount >= total - PAID_TOLERANCE) return "paid";
  if (paidAmount > 0) return "partially_paid";
  return "issued";
}

export const outstandingOf = (total: number, paid: number) => Math.max(0, round2(Number(total) - Number(paid)));

// ---------------------------------------------------------------- ageing

export type Ageing = { notDue: number; d0_30: number; d31_60: number; d61_90: number; d90p: number };
export const AGEING_LABELS: [keyof Ageing, string][] = [
  ["notDue", "Not due"], ["d0_30", "0-30"], ["d31_60", "31-60"], ["d61_90", "61-90"], ["d90p", "90+"],
];
const emptyAgeing = (): Ageing => ({ notDue: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 });

/** Bucket by days past the due date (0 = due today). Negative = not yet due. */
export function ageingBucket(daysOverdue: number): keyof Ageing {
  if (daysOverdue < 0) return "notDue";
  if (daysOverdue <= 30) return "d0_30";
  if (daysOverdue <= 60) return "d31_60";
  if (daysOverdue <= 90) return "d61_90";
  return "d90p";
}

export type PartyOutstanding = {
  partyId: number;
  name: string;
  email: string | null;
  phone: string | null;
  invoiceCount: number;
  /** total outstanding (total − paid) */
  outstanding: number;
  /** portion past due date */
  overdue: number;
  /** portion falling due within the next 7 days (not yet overdue) */
  dueNext7: number;
  ageing: Ageing;
  maxDaysOverdue: number;
  oldestDueDate: string | null;
  autoReminders?: boolean;
};

export type OpenDoc = {
  id: number;
  partyId: number;
  partyName: string;
  number: string;
  invoiceDate: string;
  dueDate: string;
  total: number;
  paidAmount: number;
  outstanding: number;
  /** days past due (negative = days until due) */
  daysOverdue: number;
  status: string;
  reminderCount?: number;
  lastReminderAt?: Date | null;
};

function aggregate(docs: OpenDoc[], parties: Map<number, { name: string; email: string | null; phone: string | null; autoReminders?: boolean }>, today: string): PartyOutstanding[] {
  const by = new Map<number, PartyOutstanding>();
  for (const d of docs) {
    let p = by.get(d.partyId);
    if (!p) {
      const info = parties.get(d.partyId);
      p = {
        partyId: d.partyId, name: info?.name ?? d.partyName, email: info?.email ?? null, phone: info?.phone ?? null,
        invoiceCount: 0, outstanding: 0, overdue: 0, dueNext7: 0, ageing: emptyAgeing(), maxDaysOverdue: 0, oldestDueDate: null,
        autoReminders: info?.autoReminders,
      };
      by.set(d.partyId, p);
    }
    p.invoiceCount++;
    p.outstanding = round2(p.outstanding + d.outstanding);
    const b = ageingBucket(d.daysOverdue);
    p.ageing[b] = round2(p.ageing[b] + d.outstanding);
    if (d.daysOverdue > 0) p.overdue = round2(p.overdue + d.outstanding);
    else if (d.dueDate <= addDays(today, 7)) p.dueNext7 = round2(p.dueNext7 + d.outstanding);
    p.maxDaysOverdue = Math.max(p.maxDaysOverdue, d.daysOverdue);
    if (!p.oldestDueDate || d.dueDate < p.oldestDueDate) p.oldestDueDate = d.dueDate;
  }
  return [...by.values()].sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding);
}

/** Open (unpaid / part-paid) sales invoices with outstanding, oldest due first. */
export async function openSalesInvoices(db: DbLike, opts: { customerId?: number; today?: string } = {}): Promise<OpenDoc[]> {
  const today = opts.today ?? todayIST();
  const rows = await db
    .select({
      id: salesInvoices.id, partyId: salesInvoices.customerId, partyName: customers.name, number: salesInvoices.number,
      invoiceDate: salesInvoices.invoiceDate, dueDate: salesInvoices.dueDate, total: salesInvoices.total,
      paidAmount: salesInvoices.paidAmount, status: salesInvoices.status, reminderCount: salesInvoices.reminderCount,
      lastReminderAt: salesInvoices.lastReminderAt,
    })
    .from(salesInvoices)
    .leftJoin(customers, eq(customers.id, salesInvoices.customerId))
    .where(and(
      inArray(salesInvoices.status, [...OPEN_INVOICE_STATUSES]),
      opts.customerId ? eq(salesInvoices.customerId, opts.customerId) : undefined,
    ))
    .orderBy(asc(salesInvoices.dueDate), asc(salesInvoices.id));
  return rows
    .map((r) => {
      const total = Number(r.total), paidAmount = Number(r.paidAmount);
      return {
        ...r, partyName: r.partyName ?? "-", total, paidAmount, outstanding: outstandingOf(total, paidAmount),
        daysOverdue: daysBetween(r.dueDate, today),
      };
    })
    .filter((r) => r.outstanding > PAID_TOLERANCE);
}

/** Posted purchase invoices with an unpaid balance. Due date falls back to invoice date + vendor payment terms. */
export async function openPurchaseInvoices(db: DbLike, opts: { vendorId?: number; today?: string } = {}): Promise<OpenDoc[]> {
  const today = opts.today ?? todayIST();
  const rows = await db
    .select({
      id: purchaseInvoices.id, partyId: purchaseInvoices.vendorId, partyName: vendors.name, number: purchaseInvoices.invoiceNo,
      invoiceDate: purchaseInvoices.invoiceDate, dueDate: purchaseInvoices.dueDate, terms: vendors.paymentTermsDays,
      total: purchaseInvoices.total, paidAmount: purchaseInvoices.paidAmount, status: purchaseInvoices.status,
    })
    .from(purchaseInvoices)
    .leftJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId))
    .where(and(eq(purchaseInvoices.status, "posted"), opts.vendorId ? eq(purchaseInvoices.vendorId, opts.vendorId) : undefined))
    .orderBy(asc(purchaseInvoices.invoiceDate), asc(purchaseInvoices.id));
  return rows
    .map(({ terms, ...r }) => {
      const total = Number(r.total), paidAmount = Number(r.paidAmount);
      const dueDate = r.dueDate ?? addDays(r.invoiceDate, Number(terms ?? 30));
      return {
        ...r, partyName: r.partyName ?? "-", dueDate, total, paidAmount, outstanding: outstandingOf(total, paidAmount),
        daysOverdue: daysBetween(dueDate, today),
      };
    })
    .filter((r) => r.outstanding > PAID_TOLERANCE)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
}

/** Per-customer receivables with ageing (by days past due), most overdue first. */
export async function customerOutstanding(db: DbLike, today = todayIST()): Promise<PartyOutstanding[]> {
  const docs = await openSalesInvoices(db, { today });
  const ids = [...new Set(docs.map((d) => d.partyId))];
  const info = ids.length
    ? await db.select({ id: customers.id, name: customers.name, email: customers.email, phone: customers.phone, autoReminders: customers.autoReminders })
      .from(customers).where(inArray(customers.id, ids))
    : [];
  return aggregate(docs, new Map(info.map((c) => [c.id, c])), today);
}

/** Per-vendor payables with ageing (by days past due), most overdue first. */
export async function vendorOutstanding(db: DbLike, today = todayIST()): Promise<PartyOutstanding[]> {
  const docs = await openPurchaseInvoices(db, { today });
  const ids = [...new Set(docs.map((d) => d.partyId))];
  const info = ids.length
    ? await db.select({ id: vendors.id, name: vendors.name, email: vendors.email, phone: vendors.phone }).from(vendors).where(inArray(vendors.id, ids))
    : [];
  return aggregate(docs, new Map(info.map((v) => [v.id, v])), today);
}

export function sumAgeing(rows: PartyOutstanding[]): Ageing & { outstanding: number; overdue: number; dueNext7: number } {
  const t = { ...emptyAgeing(), outstanding: 0, overdue: 0, dueNext7: 0 };
  for (const r of rows) {
    t.outstanding += r.outstanding; t.overdue += r.overdue; t.dueNext7 += r.dueNext7;
    for (const [k] of AGEING_LABELS) t[k] += r.ageing[k];
  }
  for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] = round2(t[k]);
  return t;
}

// ---------------------------------------------------------------- customer ledger

export type LedgerEntry = {
  date: string;
  kind: "invoice" | "payment";
  ref: string;
  refId: number;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

/** Customer statement: issued invoices (debit) and receipts (credit) with running balance. */
export async function customerLedger(db: DbLike, customerId: number, opts: { from?: string; to?: string } = {}) {
  const inv = await db
    .select({ id: salesInvoices.id, number: salesInvoices.number, date: salesInvoices.invoiceDate, dueDate: salesInvoices.dueDate, total: salesInvoices.total })
    .from(salesInvoices)
    .where(and(eq(salesInvoices.customerId, customerId), ne(salesInvoices.status, "cancelled"), ne(salesInvoices.status, "draft")));
  const pay = await db
    .select({ id: payments.id, date: payments.date, amount: payments.amount, mode: payments.mode, reference: payments.reference, invNo: salesInvoices.number })
    .from(payments)
    .leftJoin(salesInvoices, eq(salesInvoices.id, payments.salesInvoiceId))
    .where(and(eq(payments.direction, "in"), eq(payments.customerId, customerId)));

  type Raw = Omit<LedgerEntry, "balance">;
  const raw: Raw[] = [
    ...inv.map((i): Raw => ({ date: i.date, kind: "invoice", ref: i.number, refId: i.id, description: `Invoice (due ${fmtDate(i.dueDate)})`, debit: Number(i.total), credit: 0 })),
    ...pay.map((p): Raw => ({
      date: p.date, kind: "payment", ref: p.reference || `RCPT-${p.id}`, refId: p.id,
      description: `Payment received (${p.mode})${p.invNo ? ` against ${p.invNo}` : ""}`, debit: 0, credit: Number(p.amount),
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === b.kind ? a.refId - b.refId : a.kind === "invoice" ? -1 : 1));

  let opening = 0;
  const visible: Raw[] = [];
  for (const r of raw) {
    if (opts.from && r.date < opts.from) opening = round2(opening + r.debit - r.credit);
    else if (!opts.to || r.date <= opts.to) visible.push(r);
  }
  let bal = opening;
  const entries: LedgerEntry[] = visible.map((r) => { bal = round2(bal + r.debit - r.credit); return { ...r, balance: bal }; });
  const debit = round2(visible.reduce((s, r) => s + r.debit, 0));
  const credit = round2(visible.reduce((s, r) => s + r.credit, 0));
  return { opening, entries, debit, credit, closing: bal };
}

// ---------------------------------------------------------------- company settings

export type Company = {
  name: string;
  address: string;
  gstin: string;
  state: string;
  phone: string;
  email: string;
  pan: string;
  bank: string;
};

const DEFAULT_COMPANY: Company = {
  name: "Linga Bhairavi Enterprise", address: "Hosur, Krishnagiri District, Tamil Nadu", gstin: "", state: "Tamil Nadu",
  phone: "", email: "", pan: "", bank: "",
};

function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

/** Reads settings key "company" tolerantly (any missing field falls back to defaults). */
export async function getCompany(db: DbLike): Promise<Company> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "company"));
  const v = (row?.value && typeof row.value === "object" ? row.value : {}) as Record<string, unknown>;
  let bank = str(v.bank);
  if (!bank && v.bank && typeof v.bank === "object") {
    const b = v.bank as Record<string, unknown>;
    bank = [str(b.name ?? b.bankName), str(b.account ?? b.accountNo ?? b.accountNumber) && `A/c ${str(b.account ?? b.accountNo ?? b.accountNumber)}`,
      str(b.ifsc) && `IFSC ${str(b.ifsc)}`, str(b.branch)].filter(Boolean).join(", ");
  }
  if (!bank) {
    bank = [str(v.bankName), str(v.bankAccount ?? v.accountNo) && `A/c ${str(v.bankAccount ?? v.accountNo)}`, str(v.ifsc) && `IFSC ${str(v.ifsc)}`]
      .filter(Boolean).join(", ");
  }
  return {
    name: str(v.name) || DEFAULT_COMPANY.name,
    address: str(v.address) || [str(v.addressLine1), str(v.addressLine2), str(v.city)].filter(Boolean).join(", ") || DEFAULT_COMPANY.address,
    gstin: str(v.gstin),
    state: str(v.state) || DEFAULT_COMPANY.state,
    phone: str(v.phone),
    email: str(v.email),
    pan: str(v.pan),
    bank,
  };
}

// ---------------------------------------------------------------- amount in words (Indian system)

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "");
}
function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? below100(r) : ""].filter(Boolean).join(" ");
}

/** Integer → words in the Indian numbering system (Crore, Lakh, Thousand). 0 → "Zero". */
export function numberToWordsIndian(value: number): string {
  let n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  if (crore) parts.push(`${numberToWordsIndian(crore)} Crore`); // supports > 99 crore recursively
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return (value < 0 ? "Minus " : "") + parts.join(" ");
}

/** e.g. 123456.78 → "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Eight Paise Only" */
export function amountInWords(amount: number): string {
  const v = round2(Math.abs(Number(amount) || 0));
  const rupees = Math.floor(v);
  const paise = Math.round((v - rupees) * 100);
  return `Rupees ${numberToWordsIndian(rupees)}${paise ? ` and ${below100(paise)} Paise` : ""} Only`;
}

// ---------------------------------------------------------------- e-mail builders

export function escapeHtml(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

const cell = "padding:6px 8px;border:1px solid #e3e6eb;font-size:13px;";
const cellR = cell + "text-align:right;white-space:nowrap;";

function signature(company: { name: string; phone?: string; email?: string; bank?: string }) {
  return `<p style="margin:16px 0 0">Warm regards,<br/><strong>Accounts Team</strong><br/>${escapeHtml(company.name)}`
    + (company.phone ? `<br/>Phone: ${escapeHtml(company.phone)}` : "")
    + (company.email ? `<br/>Email: ${escapeHtml(company.email)}` : "")
    + `</p>`;
}

function wrap(inner: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f7f9">`
    + `<div style="max-width:640px;margin:0 auto;padding:20px;font-family:Segoe UI,Arial,sans-serif;color:#16191f;background:#ffffff;line-height:1.5">${inner}</div>`
    + `</body></html>`;
}

/**
 * Polite payment reminder with a mini statement of the open invoices.
 * STABLE API: imported by the Receivables Dunning Agent.
 */
export function buildReminderEmail(opts: {
  customerName: string;
  invoices: { number: string; invoiceDate: string; dueDate: string; total: number; outstanding: number; daysOverdue: number }[];
  company: { name: string; phone?: string; email?: string; bank?: string };
}): { subject: string; html: string } {
  const { customerName, invoices, company } = opts;
  const totalOutstanding = round2(invoices.reduce((s, i) => s + Number(i.outstanding), 0));
  const overdue = invoices.filter((i) => i.daysOverdue > 0);
  const overdueAmt = round2(overdue.reduce((s, i) => s + Number(i.outstanding), 0));
  const single = invoices.length === 1 ? invoices[0] : null;

  const subject = single
    ? `${single.daysOverdue > 0 ? "Payment reminder" : "Payment due"}: Invoice ${single.number}, ${money(single.outstanding)} | ${company.name}`
    : `Payment reminder: ${money(totalOutstanding)} outstanding (${invoices.length} invoices) | ${company.name}`;

  const rows = invoices.map((i) => {
    const st = i.daysOverdue > 0 ? `<span style="color:#ad1a16">${i.daysOverdue} day${i.daysOverdue === 1 ? "" : "s"} overdue</span>`
      : i.daysOverdue === 0 ? "Due today" : `Due in ${-i.daysOverdue} day${i.daysOverdue === -1 ? "" : "s"}`;
    return `<tr><td style="${cell}">${escapeHtml(i.number)}</td><td style="${cell}">${escapeHtml(fmtDate(i.invoiceDate))}</td>`
      + `<td style="${cell}">${escapeHtml(fmtDate(i.dueDate))}</td><td style="${cellR}">${escapeHtml(money(i.total))}</td>`
      + `<td style="${cellR}"><strong>${escapeHtml(money(i.outstanding))}</strong></td><td style="${cell}">${st}</td></tr>`;
  }).join("");

  const intro = overdue.length
    ? `This is a gentle reminder that the following ${invoices.length === 1 ? "invoice is" : "invoices are"} pending for payment`
      + (overdueAmt ? `, of which <strong>${escapeHtml(money(overdueAmt))}</strong> is past the due date` : "") + "."
    : `This is a courteous reminder that the following ${invoices.length === 1 ? "invoice is" : "invoices are"} falling due for payment.`;

  const html = wrap(
    `<h2 style="margin:0 0 4px;font-size:18px;color:#ad1a16">${escapeHtml(company.name)}</h2>`
    + `<p style="margin:0 0 16px;color:#5b6472;font-size:13px">Statement of outstanding as on ${escapeHtml(fmtDate(todayIST()))}</p>`
    + `<p>Dear ${escapeHtml(customerName)},</p>`
    + `<p>Greetings from ${escapeHtml(company.name)}. Thank you for your continued business.</p>`
    + `<p>${intro}</p>`
    + `<table style="border-collapse:collapse;width:100%;margin:12px 0">`
    + `<thead><tr style="background:#f1f3f6"><th style="${cell}text-align:left">Invoice</th><th style="${cell}text-align:left">Date</th>`
    + `<th style="${cell}text-align:left">Due date</th><th style="${cellR}">Amount</th><th style="${cellR}">Outstanding</th><th style="${cell}text-align:left">Status</th></tr></thead>`
    + `<tbody>${rows}</tbody>`
    + `<tfoot><tr><td colspan="4" style="${cellR}"><strong>Total outstanding</strong></td><td style="${cellR}"><strong>${escapeHtml(money(totalOutstanding))}</strong></td><td style="${cell}"></td></tr></tfoot>`
    + `</table>`
    + `<p>We request you to kindly arrange the payment at the earliest${company.bank ? " to our bank account below" : ""}.`
    + ` If the payment has already been made, please share the transaction details so that we can update our records, and kindly ignore this reminder.</p>`
    + (company.bank ? `<p style="background:#f1f3f6;padding:10px 12px;border-radius:6px;font-size:13px"><strong>Bank details:</strong> ${escapeHtml(company.bank)}</p>` : "")
    + `<p>For any clarification regarding these invoices, please feel free to reply to this e-mail${company.phone ? ` or call us on ${escapeHtml(company.phone)}` : ""}.</p>`
    + signature(company),
  );
  return { subject: subject.slice(0, 250), html }; // email_outbox.subject is varchar(250)
}

/** Full customer ledger statement e-mail (used by "Email statement"). */
export function buildStatementEmail(opts: {
  customerName: string;
  ledger: { opening: number; entries: LedgerEntry[]; debit: number; credit: number; closing: number };
  company: { name: string; phone?: string; email?: string; bank?: string };
  asOn?: string;
}): { subject: string; html: string } {
  const { customerName, ledger, company } = opts;
  const asOn = opts.asOn ?? todayIST();
  const rows = ledger.entries.map((e) =>
    `<tr><td style="${cell}">${escapeHtml(fmtDate(e.date))}</td><td style="${cell}">${escapeHtml(e.ref)}</td><td style="${cell}">${escapeHtml(e.description)}</td>`
    + `<td style="${cellR}">${e.debit ? escapeHtml(money(e.debit)) : ""}</td><td style="${cellR}">${e.credit ? escapeHtml(money(e.credit)) : ""}</td>`
    + `<td style="${cellR}">${escapeHtml(money(e.balance))}</td></tr>`).join("");
  const subject = `Statement of account as on ${fmtDate(asOn)} | ${company.name}`;
  const html = wrap(
    `<h2 style="margin:0 0 4px;font-size:18px;color:#ad1a16">${escapeHtml(company.name)}</h2>`
    + `<p style="margin:0 0 16px;color:#5b6472;font-size:13px">Statement of account as on ${escapeHtml(fmtDate(asOn))}</p>`
    + `<p>Dear ${escapeHtml(customerName)},</p>`
    + `<p>Please find below your statement of account with us. `
    + (ledger.closing > PAID_TOLERANCE ? `The balance payable is <strong>${escapeHtml(money(ledger.closing))}</strong>. We request you to kindly clear the pending amount at the earliest.`
      : `There is no balance pending. Thank you for your prompt payments.`)
    + `</p>`
    + `<table style="border-collapse:collapse;width:100%;margin:12px 0"><thead><tr style="background:#f1f3f6">`
    + `<th style="${cell}text-align:left">Date</th><th style="${cell}text-align:left">Ref</th><th style="${cell}text-align:left">Particulars</th>`
    + `<th style="${cellR}">Debit</th><th style="${cellR}">Credit</th><th style="${cellR}">Balance</th></tr></thead><tbody>`
    + (ledger.opening ? `<tr><td style="${cell}" colspan="5">Opening balance</td><td style="${cellR}">${escapeHtml(money(ledger.opening))}</td></tr>` : "")
    + rows + `</tbody><tfoot><tr><td colspan="3" style="${cellR}"><strong>Total</strong></td><td style="${cellR}">${escapeHtml(money(ledger.debit))}</td>`
    + `<td style="${cellR}">${escapeHtml(money(ledger.credit))}</td><td style="${cellR}"><strong>${escapeHtml(money(ledger.closing))}</strong></td></tr></tfoot></table>`
    + (company.bank && ledger.closing > PAID_TOLERANCE ? `<p style="background:#f1f3f6;padding:10px 12px;border-radius:6px;font-size:13px"><strong>Bank details:</strong> ${escapeHtml(company.bank)}</p>` : "")
    + `<p>If you find any discrepancy, please let us know so that we can reconcile.</p>`
    + signature(company),
  );
  return { subject, html };
}

/** Collections (payments in) and vendor payments (out) between two dates inclusive. */
export async function paymentTotals(db: DbLike, from: string, to: string) {
  const rows = await db
    .select({
      direction: payments.direction,
      total: sql<number>`coalesce(sum(${payments.amount}),0)`.mapWith(Number),
      n: sql<number>`count(*)`.mapWith(Number),
    })
    .from(payments)
    .where(and(sql`${payments.date} >= ${from}`, sql`${payments.date} <= ${to}`))
    .groupBy(payments.direction);
  const get = (d: string) => rows.find((r) => r.direction === d) ?? { total: 0, n: 0 };
  return { in: { total: round2(get("in").total), count: get("in").n }, out: { total: round2(get("out").total), count: get("out").n } };
}
