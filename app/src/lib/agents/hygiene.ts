/** Accountability agents: data hygiene (skipped entries) and project budget watch. Deterministic rules — no AI. */
import "server-only";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  customers, deliveries, expenseAllocations, expenses, followUps, projects, purchaseInvoices, quotations,
  salesInvoices, salesOrderLines, salesOrders, stockMovements, vendors,
} from "@/db/schema";
import { addDays, daysBetween, fmtDate, money, moneyShort, pct } from "@/lib/format";
import { defineAgent, numericParams } from "./define";
import { budgetUsedPct, listPreview, plural, projectActualCost, toISTDate } from "./rules";
import type { AlertDraft } from "./types";

/**
 * Project actual cost per CONVENTIONS rule 5, for many projects in 2 queries.
 * Returns Map<projectId, { material, expenses, actual, lastActivity }>.
 */
export async function projectCosts(db: DB, projectIds: number[]) {
  const res = new Map<number, { material: number; expenses: number; actual: number; lastActivity: string | null }>();
  if (!projectIds.length) return res;
  const mats = await db
    .select({
      projectId: stockMovements.projectId,
      issued: sql<number>`coalesce(sum(case when ${stockMovements.type} = 'issue_project' then abs(${stockMovements.qty}) * ${stockMovements.rate} else 0 end),0)`.mapWith(Number),
      returned: sql<number>`coalesce(sum(case when ${stockMovements.type} = 'return' then abs(${stockMovements.qty}) * ${stockMovements.rate} else 0 end),0)`.mapWith(Number),
      last: sql<string | null>`max(${stockMovements.date})::text`,
    })
    .from(stockMovements)
    .where(inArray(stockMovements.projectId, projectIds))
    .groupBy(stockMovements.projectId);
  const exps = await db
    .select({
      projectId: expenseAllocations.projectId,
      approved: sql<number>`coalesce(sum(case when ${expenses.status} = 'approved' then ${expenseAllocations.amount} else 0 end),0)`.mapWith(Number),
      last: sql<string | null>`max(${expenses.date})::text`,
    })
    .from(expenseAllocations)
    .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
    .where(inArray(expenseAllocations.projectId, projectIds))
    .groupBy(expenseAllocations.projectId);
  const matMap = new Map(mats.map((m) => [Number(m.projectId), m]));
  const expMap = new Map(exps.map((e) => [Number(e.projectId), e]));
  for (const id of projectIds) {
    const m = matMap.get(id), e = expMap.get(id);
    const material = (m?.issued ?? 0) - (m?.returned ?? 0);
    const expense = e?.approved ?? 0;
    const dates = [m?.last, e?.last].filter((d): d is string => !!d).sort();
    res.set(id, { material, expenses: expense, actual: projectActualCost(m?.issued ?? 0, m?.returned ?? 0, expense), lastActivity: dates.at(-1) ?? null });
  }
  return res;
}

// ---------------------------------------------------------------- data_hygiene
const dhMeta = {
  quoteNoFollowUpDays: { label: "Quote gone quiet: no next follow-up date and no contact for (days)", min: 1, max: 90, unit: "days" },
  wonNoOrderDays: { label: "Won quote with no order / project entered after (days)", min: 0, max: 60, unit: "days" },
  deliveredNotInvoicedDays: { label: "Fully delivered order not fully invoiced after (days)", min: 0, max: 60, unit: "days" },
  expensePendingDays: { label: "Expense vouchers waiting for approval longer than (days)", min: 0, max: 60, unit: "days" },
};

export const dataHygieneAgent = defineAgent({
  key: "data_hygiene",
  name: "Accountability Agent (Data Hygiene)",
  description: "Catches skipped entries — the reason most CRMs fail: won quotes without an order, deliveries not billed, expenses stuck in approval, purchase bills left in draft, active sites with no cost entries, quotes with no next follow-up, and customers with unpaid bills but no email for reminders.",
  ownerRole: "admin",
  defaultParams: { quoteNoFollowUpDays: 7, wonNoOrderDays: 3, deliveredNotInvoicedDays: 2, expensePendingDays: 3 },
  paramSchema: numericParams(dhMeta),
  paramMeta: dhMeta,
  minutesSavedPerAlert: 8,
  async run({ db, today, params }) {
    const out: AlertDraft[] = [];

    // 1) quotes gone quiet: had contact, but no next date set and nothing recent
    const quiet = await db
      .select({
        id: quotations.id, number: quotations.number, customer: customers.name, preparedBy: quotations.preparedBy,
        grandTotal: quotations.grandTotal, last: sql<string>`max(${followUps.date})::text`,
      })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .innerJoin(followUps, eq(followUps.quotationId, quotations.id))
      .where(and(inArray(quotations.status, ["sent", "negotiation"]), sql`${quotations.nextFollowUpDate} is null`))
      .groupBy(quotations.id, customers.name)
      .having(sql`max(${followUps.date}) <= ${addDays(today, -params.quoteNoFollowUpDays)}::date`);
    for (const q of quiet) {
      out.push({
        dedupeKey: `dh:quiet:${q.id}:${q.last}`,
        severity: "warning",
        title: `${q.number} · ${q.customer} — no next follow-up date, last contact ${plural(daysBetween(q.last, today), "day")} ago`,
        message: `${moneyShort(q.grandTotal)} quote is drifting. Log a follow-up with a next date, or mark it won/lost.`,
        entityType: "quotation", entityId: q.id, link: `/quotations/${q.id}`, assignedRole: "sales", assignedUserId: q.preparedBy ?? null,
      });
    }

    // 2) won quotes with no order and no project
    const won = await db
      .select({
        id: quotations.id, number: quotations.number, customer: customers.name, preparedBy: quotations.preparedBy,
        grandTotal: quotations.grandTotal, closedAt: quotations.closedAt, quoteDate: quotations.quoteDate,
      })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .where(and(
        eq(quotations.status, "won"),
        sql`not exists (select 1 from ${salesOrders} where ${salesOrders.quotationId} = ${quotations.id})`,
        sql`not exists (select 1 from ${projects} where ${projects.quotationId} = ${quotations.id})`,
      ));
    for (const q of won) {
      const wonOn = toISTDate(q.closedAt) ?? q.quoteDate;
      const age = daysBetween(wonOn, today);
      if (age < params.wonNoOrderDays) continue;
      out.push({
        dedupeKey: `dh:won:${q.id}`,
        severity: age > params.wonNoOrderDays * 3 ? "critical" : "warning",
        title: `${q.number} · ${q.customer} won ${plural(age, "day")} ago — no order / PO entered`,
        message: `${moneyShort(q.grandTotal)} won quotation has no sales order or project. Enter the customer PO so delivery and billing can be tracked.`,
        entityType: "quotation", entityId: q.id, link: `/quotations/${q.id}`, assignedRole: "sales", assignedUserId: q.preparedBy ?? null,
        dueDate: addDays(wonOn, params.wonNoOrderDays),
      });
    }

    // 3) orders fully delivered but not fully invoiced
    const lastDel = db
      .select({ orderId: deliveries.orderId, last: sql<string>`max(${deliveries.date})::text`.as("last_del") })
      .from(deliveries)
      .groupBy(deliveries.orderId)
      .as("ld");
    const dni = await db
      .select({
        id: salesOrders.id, number: salesOrders.number, poNumber: salesOrders.customerPoNumber, customer: customers.name,
        orderDate: salesOrders.orderDate, lastDelivery: lastDel.last,
        uninvoicedValue: sql<number>`sum(greatest(${salesOrderLines.qty} - ${salesOrderLines.invoicedQty}, 0) * ${salesOrderLines.rate})`.mapWith(Number),
      })
      .from(salesOrders)
      .innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .innerJoin(salesOrderLines, and(eq(salesOrderLines.orderId, salesOrders.id), sql`${salesOrderLines.deliveryStatus} <> 'cancelled'`))
      .leftJoin(lastDel, eq(lastDel.orderId, salesOrders.id))
      .where(inArray(salesOrders.status, ["open", "partial", "delivered"]))
      .groupBy(salesOrders.id, customers.name, lastDel.last)
      .having(sql`bool_and(${salesOrderLines.deliveredQty} >= ${salesOrderLines.qty} - 0.0001)
        and bool_or(${salesOrderLines.invoicedQty} < ${salesOrderLines.qty} - 0.0001)`);
    for (const o of dni) {
      const since = o.lastDelivery ?? o.orderDate;
      const age = daysBetween(since, today);
      if (age < params.deliveredNotInvoicedDays) continue;
      out.push({
        dedupeKey: `dh:dni:${o.id}`,
        severity: age > 7 ? "critical" : "warning",
        title: `${o.poNumber ? "PO " + o.poNumber : o.number} · ${o.customer} — delivered ${plural(age, "day")} ago, not fully invoiced`,
        message: `About ${money(o.uninvoicedValue)} (before GST) is delivered but not billed. Raise the invoice so the payment clock starts.`,
        entityType: "sales_order", entityId: o.id, link: `/orders/${o.id}`, assignedRole: "accounts",
        dueDate: addDays(since, params.deliveredNotInvoicedDays),
      });
    }

    // 4) expenses pending approval (one grouped alert; key follows the oldest pending voucher)
    const pend = await db
      .select({ id: expenses.id, voucherNo: expenses.voucherNo, date: expenses.date, amount: expenses.amount, createdAt: expenses.createdAt })
      .from(expenses)
      .where(and(eq(expenses.status, "pending"), lte(expenses.createdAt, new Date(Date.now() - params.expensePendingDays * 86400e3))))
      .orderBy(expenses.createdAt, expenses.id);
    if (pend.length) {
      const total = pend.reduce((s, e) => s + Number(e.amount), 0);
      const oldestAge = daysBetween(toISTDate(pend[0].createdAt) ?? pend[0].date, today);
      out.push({
        dedupeKey: `dh:exp:${pend[0].id}`,
        severity: oldestAge > params.expensePendingDays * 3 ? "critical" : "warning",
        title: `${plural(pend.length, "expense voucher")} awaiting approval > ${plural(params.expensePendingDays, "day")} (${moneyShort(total)})`,
        message: `Vouchers: ${listPreview(pend.map((e) => e.voucherNo), 6)}. Oldest waiting ${plural(oldestAge, "day")}. Approve or reject so project costs are accurate.`,
        entityType: "expense", entityId: pend[0].id, link: `/expenses?status=pending`, assignedRole: "accounts",
      });
    }

    // 5) purchase invoices left in draft > 3 days
    const drafts = await db
      .select({
        id: purchaseInvoices.id, invoiceNo: purchaseInvoices.invoiceNo, total: purchaseInvoices.total, createdAt: purchaseInvoices.createdAt,
        createdBy: purchaseInvoices.createdBy, vendor: vendors.name,
      })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId))
      .where(and(eq(purchaseInvoices.status, "draft"), lte(purchaseInvoices.createdAt, new Date(Date.now() - 3 * 86400e3))));
    for (const p of drafts) {
      const age = daysBetween(toISTDate(p.createdAt) ?? today, today);
      out.push({
        dedupeKey: `dh:pidraft:${p.id}`,
        severity: "warning",
        title: `Purchase bill ${p.invoiceNo} · ${p.vendor} still in draft (${plural(age, "day")})`,
        message: `${moneyShort(p.total)}. Until it is posted, item prices, stock and project costs are NOT updated. Post it or delete it.`,
        entityType: "purchase_invoice", entityId: p.id, link: `/purchases/${p.id}`, assignedRole: "purchase", assignedUserId: p.createdBy ?? null,
      });
    }

    // 6) active projects with no material / expense entry in 14 days
    const active = await db
      .select({ id: projects.id, code: projects.code, name: projects.name, engineerId: projects.engineerId, startDate: projects.startDate, createdAt: projects.createdAt })
      .from(projects)
      .where(eq(projects.status, "active"));
    const costs = await projectCosts(db, active.map((p) => p.id));
    for (const p of active) {
      const candidates = [costs.get(p.id)?.lastActivity, p.startDate, toISTDate(p.createdAt)].filter((d): d is string => !!d).sort();
      const last = candidates.at(-1) ?? today;
      const idle = daysBetween(last, today);
      if (idle < 14) continue;
      out.push({
        dedupeKey: `dh:idle:${p.id}:${last}`,
        severity: "info",
        title: `${p.code} · ${p.name} — no material or expense entry for ${plural(idle, "day")}`,
        message: `Last activity ${fmtDate(last)}. If work is going on, enter material issues and site expenses; if it is paused, set the project On hold.`,
        entityType: "project", entityId: p.id, link: `/projects/${p.id}`, assignedRole: "engineer", assignedUserId: p.engineerId ?? null,
      });
    }

    // 7) customers with unpaid invoices but no email (dunning impossible)
    const noEmail = await db
      .select({
        id: customers.id, name: customers.name, phone: customers.phone,
        n: sql<number>`count(*)`.mapWith(Number),
        outstanding: sql<number>`sum(${salesInvoices.total} - ${salesInvoices.paidAmount})`.mapWith(Number),
      })
      .from(customers)
      .innerJoin(salesInvoices, eq(salesInvoices.customerId, customers.id))
      .where(and(
        sql`coalesce(trim(${customers.email}), '') = ''`,
        inArray(salesInvoices.status, ["issued", "partially_paid"]),
        sql`${salesInvoices.total} - ${salesInvoices.paidAmount} > 0.5`,
      ))
      .groupBy(customers.id);
    for (const c of noEmail) {
      out.push({
        dedupeKey: `dh:noemail:${c.id}`,
        severity: "info",
        title: `${c.name} has no email — ${plural(c.n, "unpaid invoice")} (${moneyShort(c.outstanding)}) can't be auto-reminded`,
        message: `Add the accounts email of this customer so the Receivables agent can send payment reminders automatically.${c.phone ? ` Phone: ${c.phone}.` : ""}`,
        entityType: "customer", entityId: c.id, link: `/customers/${c.id}`, assignedRole: "accounts",
      });
    }

    return { alerts: out };
  },
});

// ---------------------------------------------------------------- project_budget
const pbMeta = {
  warnPct: { label: "Warn when actual cost reaches (% of budget)", min: 1, max: 500, unit: "%" },
  criticalPct: { label: "Critical when actual cost reaches (% of budget)", min: 1, max: 500, unit: "%" },
};

export const projectBudgetAgent = defineAgent({
  key: "project_budget",
  name: "Project Budget Watch",
  description: "Recomputes every active project's actual cost (materials issued − returns + approved expenses) against its budget daily and warns before the project goes into loss.",
  ownerRole: "admin",
  defaultParams: { warnPct: 80, criticalPct: 100 },
  paramSchema: numericParams(pbMeta),
  paramMeta: pbMeta,
  minutesSavedPerAlert: 20,
  async run({ db, params }) {
    const rows = await db
      .select({
        id: projects.id, code: projects.code, name: projects.name, budget: projects.budget, contractValue: projects.contractValue,
        customer: customers.name,
      })
      .from(projects)
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .where(and(eq(projects.status, "active"), sql`${projects.budget} > 0`));
    const costs = await projectCosts(db, rows.map((r) => r.id));
    const warn = Math.min(params.warnPct, params.criticalPct);
    const out: AlertDraft[] = [];
    for (const p of rows) {
      const c = costs.get(p.id);
      const actual = c?.actual ?? 0;
      const used = budgetUsedPct(actual, Number(p.budget));
      if (used < warn) continue;
      const critical = used >= params.criticalPct;
      const margin = Number(p.contractValue) - actual;
      out.push({
        dedupeKey: `pb:${p.id}:${critical ? "crit" : "warn"}`,
        severity: critical ? "critical" : "warning",
        title: `${p.code} · ${p.name} — ${pct(used, 0)} of budget used`,
        message: `${p.customer}. Actual ${money(actual)} (materials ${money(c?.material ?? 0)}, expenses ${money(c?.expenses ?? 0)}) vs budget ${money(p.budget)}. ` +
          `Margin on contract ${money(margin)}${margin < 0 ? " — PROJECT IN LOSS" : ""}.`,
        entityType: "project", entityId: p.id, link: `/projects/${p.id}`, assignedRole: "admin",
      });
    }
    return { alerts: out };
  },
});
