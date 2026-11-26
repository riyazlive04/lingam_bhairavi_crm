import "server-only";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db";
import {
  amcContracts, auditLog, deliveries, deliveryLines, expenseAllocations, expenses, followUps, items, payments, purchaseInvoices,
  purchaseOrders, quotations, salesInvoices, salesOrders, salesReturns, serviceCalls, stockMovements, users, vendors,
} from "@/db/schema";
import { canApproveExpenses, canRead } from "@/lib/rbac";
import type { SessionUser } from "@/lib/session";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { round2 } from "@/lib/format";

/** Event kinds shown in the project history feed (also the filter chips, in this order). */
export const HISTORY_TYPES = {
  quotation: "Quotation",
  order: "Customer PO",
  vendor_po: "Vendor PO",
  purchase: "Purchase bill",
  material: "Material",
  delivery: "Delivery",
  invoice: "Invoice",
  payment: "Payment",
  credit_note: "Credit note",
  expense: "Expense",
  amc: "AMC",
  service: "Service call",
  note: "Note",
  activity: "Activity",
} as const;
export type HistoryType = keyof typeof HISTORY_TYPES;
export const isHistoryType = (s: string): s is HistoryType => s in HISTORY_TYPES;

export type HistoryEvent = {
  key: string;
  type: HistoryType;
  /** UTC ISO instant used for sorting */
  sortAt: string;
  /** what to print: a 'YYYY-MM-DD' (date only) or an ISO timestamp */
  when: string;
  dateOnly: boolean;
  title: string;
  detail?: string | null;
  /** already filtered for the viewer: null when they may not see the money */
  amount?: number | null;
  status?: string | null;
  who?: string | null;
  /** null when the viewer cannot open that module: render a plain label */
  href?: string | null;
};

type ProjectLike = { id: number; quotationId: number | null; notes: string | null; createdAt: Date; code: string };

const NOTE_RE = /^\[(\d{4}-\d{2}-\d{2}) · (.+?)\] ?(.*)$/;
// date-only events sort at noon IST so they sit in the middle of that day
const dayAt = (d: string) => `${d}T06:30:00.000Z`;
const iso = (d: Date | string) => (typeof d === "string" ? new Date(d) : d).toISOString();
const n = (v: unknown) => Number(v ?? 0) || 0;
const label = (s: string) => s.replace(/_/g, " ");
const catLabel = (k: string) => EXPENSE_CATEGORIES[k as keyof typeof EXPENSE_CATEGORIES] ?? k;
const FIELD_LABEL: Record<string, string> = {
  name: "name", customerId: "customer", quotationId: "quotation", status: "status", siteAddress: "site address", startDate: "start date",
  endDate: "end date", notes: "notes", engineerId: "site engineer", contractValue: "contract value", budget: "budget",
};

/**
 * One chronological feed of everything that happened on a project.
 * `full` = the viewer may see selling values and buying prices (canSeeCost). Expense amounts show to anyone with spend access.
 */
export async function loadProjectHistory(db: DB, p: ProjectLike, viewer: SessionUser, full: boolean): Promise<HistoryEvent[]> {
  const pid = p.id;
  const role = viewer.role;
  const can = {
    quotes: canRead(role, "quotations"), orders: canRead(role, "orders"), pos: canRead(role, "purchaseOrders"),
    purchases: canRead(role, "purchases"), billing: canRead(role, "billing"), returns: canRead(role, "returns"), amc: canRead(role, "amc"),
  };
  const sell = (v: unknown) => (full ? round2(n(v)) : null);
  const buy = sell;

  const soIds = db.select({ id: salesOrders.id }).from(salesOrders).where(eq(salesOrders.projectId, pid));
  const soQuoteIds = db.select({ id: salesOrders.quotationId }).from(salesOrders).where(and(eq(salesOrders.projectId, pid), sql`${salesOrders.quotationId} is not null`));
  const invIds = db.select({ id: salesInvoices.id }).from(salesInvoices).where(eq(salesInvoices.projectId, pid));
  const quoteCond: SQL = p.quotationId ? or(eq(quotations.id, p.quotationId), inArray(quotations.id, soQuoteIds))! : inArray(quotations.id, soQuoteIds);
  const fuCond: SQL = p.quotationId ? or(eq(followUps.quotationId, p.quotationId), inArray(followUps.quotationId, soQuoteIds))! : inArray(followUps.quotationId, soQuoteIds);

  const [
    userRows, quoteRows, fuRows, orderRows, poRows, piRows, movRows, delRows, invRows, payRows, cnRows, expRows, amcRows, scRows, auditRows,
  ] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users),
    db.select({
      id: quotations.id, number: quotations.number, status: quotations.status, grandTotal: quotations.grandTotal, createdAt: quotations.createdAt,
      quoteDate: quotations.quoteDate, preparedBy: quotations.preparedBy, sentAt: quotations.sentAt, closedAt: quotations.closedAt,
      approvalStatus: quotations.approvalStatus, approvalRequestedAt: quotations.approvalRequestedAt, approvalRequestedBy: quotations.approvalRequestedBy,
      approvedAt: quotations.approvedAt, approvedBy: quotations.approvedBy, approvalNote: quotations.approvalNote, lostReason: quotations.lostReason,
    }).from(quotations).where(quoteCond),
    db.select({
      id: followUps.id, quotationId: followUps.quotationId, date: followUps.date, mode: followUps.mode, notes: followUps.notes,
      outcome: followUps.outcome, userId: followUps.userId, createdAt: followUps.createdAt, number: quotations.number,
    }).from(followUps).innerJoin(quotations, eq(quotations.id, followUps.quotationId)).where(fuCond),
    db.select({
      id: salesOrders.id, number: salesOrders.number, poNumber: salesOrders.customerPoNumber, orderDate: salesOrders.orderDate,
      total: salesOrders.total, createdBy: salesOrders.createdBy, status: salesOrders.status,
    }).from(salesOrders).where(eq(salesOrders.projectId, pid)),
    db.select({
      id: purchaseOrders.id, number: purchaseOrders.number, poDate: purchaseOrders.poDate, total: purchaseOrders.total, status: purchaseOrders.status,
      createdBy: purchaseOrders.createdBy, vendor: vendors.name,
    }).from(purchaseOrders).innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(or(eq(purchaseOrders.projectId, pid), inArray(purchaseOrders.salesOrderId, soIds))),
    db.select({
      id: purchaseInvoices.id, invoiceNo: purchaseInvoices.invoiceNo, invoiceDate: purchaseInvoices.invoiceDate, subtotal: purchaseInvoices.subtotal,
      status: purchaseInvoices.status, createdBy: purchaseInvoices.createdBy, vendor: vendors.name,
    }).from(purchaseInvoices).innerJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId)).where(eq(purchaseInvoices.projectId, pid)),
    db.select({
      date: stockMovements.date, type: stockMovements.type, refType: stockMovements.refType, refId: stockMovements.refId, createdBy: stockMovements.createdBy,
      lines: sql<number>`count(*)`.mapWith(Number),
      value: sql<number>`coalesce(sum(abs(${stockMovements.qty}) * ${stockMovements.rate}),0)`.mapWith(Number),
      firstItem: sql<string>`min(${items.name})`,
      minId: sql<number>`min(${stockMovements.id})`.mapWith(Number),
    }).from(stockMovements).innerJoin(items, eq(items.id, stockMovements.itemId))
      .where(and(eq(stockMovements.projectId, pid), inArray(stockMovements.type, ["issue_project", "return", "sales_return"])))
      .groupBy(stockMovements.date, stockMovements.type, stockMovements.refType, stockMovements.refId, stockMovements.createdBy),
    db.select({
      id: deliveries.id, number: deliveries.number, orderId: deliveries.orderId, date: deliveries.date, createdBy: deliveries.createdBy,
      receivedBy: deliveries.receivedBy, lines: sql<number>`count(${deliveryLines.id})`.mapWith(Number), orderNumber: salesOrders.number,
    }).from(deliveries)
      .innerJoin(salesOrders, eq(salesOrders.id, deliveries.orderId))
      .leftJoin(deliveryLines, eq(deliveryLines.deliveryId, deliveries.id))
      .where(eq(salesOrders.projectId, pid))
      .groupBy(deliveries.id, salesOrders.number),
    db.select({
      id: salesInvoices.id, number: salesInvoices.number, invoiceDate: salesInvoices.invoiceDate, total: salesInvoices.total,
      status: salesInvoices.status, createdBy: salesInvoices.createdBy,
    }).from(salesInvoices).where(eq(salesInvoices.projectId, pid)),
    db.select({
      id: payments.id, date: payments.date, amount: payments.amount, mode: payments.mode, reference: payments.reference, isAdvance: payments.isAdvance,
      salesInvoiceId: payments.salesInvoiceId, createdBy: payments.createdBy, invoiceNumber: salesInvoices.number,
    }).from(payments).leftJoin(salesInvoices, eq(salesInvoices.id, payments.salesInvoiceId))
      .where(and(eq(payments.direction, "in"), or(inArray(payments.salesInvoiceId, invIds), and(eq(payments.isAdvance, true), eq(payments.projectId, pid))))),
    db.select({
      id: salesReturns.id, number: salesReturns.number, date: salesReturns.date, total: salesReturns.total, status: salesReturns.status,
      reason: salesReturns.reason, createdBy: salesReturns.createdBy,
    }).from(salesReturns)
      .where(or(eq(salesReturns.projectId, pid), inArray(salesReturns.salesInvoiceId, invIds), inArray(salesReturns.orderId, soIds))),
    db.select({
      id: expenses.id, voucherNo: expenses.voucherNo, date: expenses.date, category: expenses.category, status: expenses.status,
      userId: expenses.userId, description: expenses.description, amount: expenseAllocations.amount,
    }).from(expenseAllocations).innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId)).where(eq(expenseAllocations.projectId, pid)),
    db.select({
      id: amcContracts.id, number: amcContracts.number, startDate: amcContracts.startDate, endDate: amcContracts.endDate, value: amcContracts.value,
      status: amcContracts.status, createdBy: amcContracts.createdBy, visits: amcContracts.visitsPerYear,
    }).from(amcContracts).where(eq(amcContracts.projectId, pid)),
    db.select({
      id: serviceCalls.id, number: serviceCalls.number, raisedAt: serviceCalls.raisedAt, resolvedAt: serviceCalls.resolvedAt, status: serviceCalls.status,
      priority: serviceCalls.priority, description: serviceCalls.description, createdBy: serviceCalls.createdBy, engineerId: serviceCalls.engineerId,
      chargeable: serviceCalls.chargeable, chargeAmount: serviceCalls.chargeAmount,
    }).from(serviceCalls).where(eq(serviceCalls.projectId, pid)),
    db.select({ id: auditLog.id, action: auditLog.action, details: auditLog.details, at: auditLog.at, userId: auditLog.userId })
      .from(auditLog).where(and(eq(auditLog.entityType, "project"), eq(auditLog.entityId, pid))),
  ]);

  const names = new Map(userRows.map((u) => [u.id, u.name]));
  const who = (id: number | null | undefined) => (id != null ? names.get(id) ?? null : null);
  const ev: HistoryEvent[] = [];
  const push = (e: Omit<HistoryEvent, "sortAt" | "dateOnly"> & { dateOnly?: boolean }) => {
    const dateOnly = e.dateOnly ?? /^\d{4}-\d{2}-\d{2}$/.test(e.when);
    ev.push({ ...e, dateOnly, sortAt: dateOnly ? dayAt(e.when) : iso(e.when) });
  };

  // ---- quotations & follow-ups
  for (const q of quoteRows) {
    const href = can.quotes ? `/quotations/${q.id}` : null;
    push({ key: `q:${q.id}:c`, type: "quotation", when: iso(q.createdAt), title: `Quotation ${q.number} prepared`, amount: sell(q.grandTotal), who: who(q.preparedBy), href });
    if (q.approvalRequestedAt) push({ key: `q:${q.id}:ar`, type: "quotation", when: iso(q.approvalRequestedAt), title: `Approval requested for ${q.number}`, who: who(q.approvalRequestedBy), href });
    if (q.approvedAt && (q.approvalStatus === "approved" || q.approvalStatus === "rejected")) {
      push({
        key: `q:${q.id}:ap`, type: "quotation", when: iso(q.approvedAt), title: `${q.number} ${q.approvalStatus === "approved" ? "approved" : "rejected"} for sending`,
        detail: q.approvalNote, status: q.approvalStatus, who: who(q.approvedBy), href,
      });
    }
    if (q.sentAt) push({ key: `q:${q.id}:s`, type: "quotation", when: iso(q.sentAt), title: `${q.number} sent to the customer`, href });
    if (q.closedAt && ["won", "lost", "expired"].includes(q.status)) {
      push({
        key: `q:${q.id}:cl`, type: "quotation", when: iso(q.closedAt), title: `${q.number} marked ${q.status}`, status: q.status,
        detail: q.status === "lost" ? q.lostReason : null, amount: q.status === "won" ? sell(q.grandTotal) : null, href,
      });
    }
  }
  for (const f of fuRows) {
    push({
      key: `fu:${f.id}`, type: "quotation", when: f.date, title: `Follow-up by ${f.mode} on ${f.number}`,
      detail: [f.outcome ? label(f.outcome) : null, f.notes].filter(Boolean).join(": ") || null, who: who(f.userId),
      href: can.quotes ? `/quotations/${f.quotationId}` : null,
    });
  }

  // ---- customer orders, vendor POs, purchase bills
  for (const o of orderRows) {
    push({
      key: `so:${o.id}`, type: "order", when: o.orderDate, title: `Customer PO ${o.poNumber ?? o.number} received`,
      detail: o.poNumber ? `Sales order ${o.number}` : null, amount: sell(o.total), status: o.status, who: who(o.createdBy),
      href: can.orders ? `/orders/${o.id}` : null,
    });
  }
  for (const po of poRows) {
    push({
      key: `po:${po.id}`, type: "vendor_po", when: po.poDate, title: `Vendor PO ${po.number} to ${po.vendor}`, amount: buy(po.total), status: po.status,
      who: who(po.createdBy), href: can.pos ? `/purchase-orders/${po.id}` : null,
    });
  }
  for (const pi of piRows) {
    push({
      key: `pi:${pi.id}`, type: "purchase", when: pi.invoiceDate, title: `Purchase bill ${pi.invoiceNo} from ${pi.vendor}`,
      detail: pi.status === "posted" ? "Materials booked straight to this site" : pi.status === "draft" ? "Draft, not counted in cost yet" : null,
      amount: buy(pi.subtotal), status: pi.status, who: who(pi.createdBy), href: can.purchases ? `/purchases/${pi.id}` : null,
    });
  }

  // ---- material movements (grouped per document / day)
  for (const m of movRows) {
    const more = m.lines > 1 ? ` and ${m.lines - 1} more` : "";
    const title = m.type === "issue_project" ? `Material issued to site: ${m.firstItem}${more}`
      : m.type === "return" ? `Material returned from site: ${m.firstItem}${more}`
        : `Customer return put back in stock: ${m.firstItem}${more}`;
    const fromPurchase = m.refType === "purchase_invoice" && m.refId;
    push({
      key: `mv:${m.minId}`, type: "material", when: m.date, title,
      detail: fromPurchase ? "Direct purchase to site" : m.refType && m.refType !== "manual" ? label(m.refType) : "Store entry",
      amount: buy(m.type === "issue_project" ? m.value : -m.value), who: who(m.createdBy),
      href: fromPurchase && can.purchases ? `/purchases/${m.refId}` : `/projects/${pid}?tab=costing`,
    });
  }

  // ---- deliveries, invoices, payments, credit notes
  for (const d of delRows) {
    push({
      key: `dl:${d.id}`, type: "delivery", when: d.date, title: `Delivery ${d.number} against ${d.orderNumber}`,
      detail: [`${d.lines} line${d.lines === 1 ? "" : "s"}`, d.receivedBy ? `received by ${d.receivedBy}` : null].filter(Boolean).join(", "),
      who: who(d.createdBy), href: can.orders ? `/orders/${d.orderId}/challan/${d.id}` : null,
    });
  }
  for (const i of invRows) {
    push({
      key: `si:${i.id}`, type: "invoice", when: i.invoiceDate, title: `Invoice ${i.number} raised`, amount: sell(i.total), status: i.status,
      who: who(i.createdBy), href: can.billing ? `/billing/invoices/${i.id}` : null,
    });
  }
  for (const pay of payRows) {
    push({
      key: `pay:${pay.id}`, type: "payment", when: pay.date,
      title: pay.isAdvance ? "Advance received" : `Payment received${pay.invoiceNumber ? ` for ${pay.invoiceNumber}` : ""}`,
      detail: [pay.mode.toUpperCase(), pay.reference].filter(Boolean).join(" · "), amount: sell(pay.amount), who: who(pay.createdBy),
      href: can.billing ? (pay.salesInvoiceId ? `/billing/invoices/${pay.salesInvoiceId}` : "/billing/payments") : null,
    });
  }
  for (const c of cnRows) {
    push({
      key: `cn:${c.id}`, type: "credit_note", when: c.date, title: `Credit note ${c.number}`, detail: `Reason: ${label(c.reason)}`,
      amount: sell(c.total), status: c.status, who: who(c.createdBy), href: can.returns ? `/returns/${c.id}` : null,
    });
  }

  // ---- expenses
  const openExpense = (ownerId: number | null) => canApproveExpenses(role) || ownerId === viewer.id;
  for (const e of expRows) {
    push({
      key: `ex:${e.id}`, type: "expense", when: e.date, title: `Expense ${e.voucherNo}: ${catLabel(e.category)}`, detail: e.description,
      amount: round2(n(e.amount)), status: e.status, who: who(e.userId), href: openExpense(e.userId) ? `/expenses/${e.id}` : null,
    });
  }

  // ---- AMC and service
  for (const a of amcRows) {
    push({
      key: `amc:${a.id}`, type: "amc", when: a.startDate, title: `AMC ${a.number} starts`,
      detail: `Runs to ${a.endDate}, ${a.visits} visit${a.visits === 1 ? "" : "s"} a year`, amount: sell(a.value), status: a.status,
      who: who(a.createdBy), href: can.amc ? `/amc/${a.id}` : null,
    });
  }
  for (const s of scRows) {
    const href = can.amc ? `/service-calls/${s.id}` : null;
    push({
      key: `sc:${s.id}`, type: "service", when: iso(s.raisedAt), title: `Service call ${s.number} raised (${s.priority} priority)`,
      detail: s.description, status: s.status, who: who(s.createdBy), href,
      amount: s.chargeable ? sell(s.chargeAmount) : null,
    });
    if (s.resolvedAt) push({ key: `sc:${s.id}:r`, type: "service", when: iso(s.resolvedAt), title: `Service call ${s.number} resolved`, who: who(s.engineerId), href });
  }

  // ---- notes written in the project log, then audit trail
  const freeText: string[] = [];
  (p.notes ?? "").split(/\r?\n/).forEach((line, i) => {
    const m = NOTE_RE.exec(line.trim());
    if (m) push({ key: `note:${i}`, type: "note", when: m[1], title: m[3] || "Note", who: m[2] });
    else if (line.trim()) freeText.push(line.trim());
  });
  if (freeText.length) push({ key: "note:intro", type: "note", when: iso(p.createdAt), title: "Project notes", detail: freeText.join(" ") });

  let sawCreate = false;
  for (const a of auditRows) {
    const d = (a.details && typeof a.details === "object" ? a.details : {}) as Record<string, unknown>;
    if (a.action === "update" && "note" in d) continue; // already shown as a note
    let title = `Project ${a.action}`;
    let detail: string | null = null;
    if (a.action === "create") { sawCreate = true; title = `Project ${p.code} created`; if (d.fromQuotation) detail = "Created from the won quotation"; }
    else if (a.action === "export") title = "Costing sheet exported to Excel";
    else if (a.action === "update" && Array.isArray(d.status)) title = `Status changed from ${label(String(d.status[0]))} to ${label(String(d.status[1]))}`;
    else if (a.action === "update") {
      const fields = Object.keys(d).filter((k) => full || (k !== "contractValue" && k !== "budget")).map((k) => FIELD_LABEL[k] ?? k);
      title = "Project details updated";
      detail = fields.length ? `Changed: ${fields.join(", ")}` : null;
    }
    push({ key: `au:${a.id}`, type: "activity", when: iso(a.at), title, detail, who: who(a.userId) });
  }
  if (!sawCreate) push({ key: "created", type: "activity", when: iso(p.createdAt), title: `Project ${p.code} created` });

  return ev.sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : a.key.localeCompare(b.key)));
}
