/** Finance agents: receivables (dunning emails) and payables. Deterministic rules, no AI. */
import "server-only";
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { customers, emailOutbox, purchaseInvoices, salesInvoices, vendors } from "@/db/schema";
import { addDays, daysBetween, fmtDate, money, moneyShort } from "@/lib/format";
import { queueEmail } from "@/lib/email";
import { defineAgent, numericParams } from "./define";
import { describeDue, groupBy, isReminderDue, istDayStart, plural } from "./rules";
import { dunningEmail } from "./templates";
import type { AlertDraft } from "./types";

// ---------------------------------------------------------------- receivables
const rcvMeta = {
  firstReminderDaysOverdue: { label: "Send the first payment reminder when overdue by (days)", min: 0, max: 180, unit: "days" },
  repeatEveryDays: { label: "Repeat the reminder every (days)", min: 1, max: 90, unit: "days" },
  maxReminders: { label: "Stop emailing after this many reminders (then alert accounts to call)", min: 0, max: 20 },
};

export const receivablesAgent = defineAgent({
  key: "receivables",
  name: "Receivables & Dunning Agent",
  description: "Emails each customer ONE consolidated statement of their overdue invoices on a fixed schedule (only customers with auto-reminders on and an email address), and escalates invoices over 60 days overdue (or out of reminders) to accounts.",
  ownerRole: "accounts",
  defaultParams: { firstReminderDaysOverdue: 1, repeatEveryDays: 7, maxReminders: 3 },
  paramSchema: numericParams(rcvMeta),
  paramMeta: rcvMeta,
  minutesSavedPerAlert: 5,
  minutesSavedPerEmail: 15,
  async run({ db, today, params, company }) {
    const rows = await db
      .select({
        id: salesInvoices.id, number: salesInvoices.number, invoiceDate: salesInvoices.invoiceDate, dueDate: salesInvoices.dueDate,
        total: salesInvoices.total, paid: salesInvoices.paidAmount, lastReminderAt: salesInvoices.lastReminderAt,
        reminderCount: salesInvoices.reminderCount, customerId: customers.id, customer: customers.name, email: customers.email,
        contactPerson: customers.contactPerson, phone: customers.phone, autoReminders: customers.autoReminders,
      })
      .from(salesInvoices)
      .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
      .where(and(
        inArray(salesInvoices.status, ["issued", "partially_paid"]),
        sql`${salesInvoices.total} - ${salesInvoices.paidAmount} > 0.5`,
        lt(salesInvoices.dueDate, today),
      ));

    // Customers already emailed by this agent today (belt-and-braces idempotency on top of the atomic claim below).
    const emailedToday = new Set(
      (await db
        .select({ id: emailOutbox.entityId })
        .from(emailOutbox)
        .where(and(eq(emailOutbox.agent, "receivables"), eq(emailOutbox.entityType, "customer"), gte(emailOutbox.createdAt, istDayStart(today)))))
        .map((r) => r.id),
    );

    const out: AlertDraft[] = [];
    let emails = 0;
    const notes: string[] = [];
    const repeatCutoff = istDayStart(addDays(today, -params.repeatEveryDays + 1));

    for (const list of groupBy(rows, (r) => r.customerId).values()) {
      const c = list[0];
      const overdue = list.map((r) => ({ ...r, outstanding: Number(r.total) - Number(r.paid), late: daysBetween(r.dueDate, today) }));

      // ---- dunning email (one per customer)
      const email = c.email?.trim();
      if (c.autoReminders && email && params.maxReminders > 0 && !emailedToday.has(c.customerId)) {
        const eligible = overdue.filter((r) =>
          isReminderDue({
            dueDate: r.dueDate, lastReminderAt: r.lastReminderAt, reminderCount: r.reminderCount, today,
            firstReminderDaysOverdue: params.firstReminderDaysOverdue, repeatEveryDays: params.repeatEveryDays, maxReminders: params.maxReminders,
          }),
        );
        if (eligible.length) {
          // atomic claim: only invoices still eligible get stamped, so concurrent runs cannot both send
          const claimed = await db
            .update(salesInvoices)
            .set({ lastReminderAt: new Date(), reminderCount: sql`${salesInvoices.reminderCount} + 1` })
            .where(and(
              inArray(salesInvoices.id, eligible.map((r) => r.id)),
              lt(salesInvoices.reminderCount, params.maxReminders),
              or(isNull(salesInvoices.lastReminderAt), lt(salesInvoices.lastReminderAt, repeatCutoff)),
            ))
            .returning({ id: salesInvoices.id, reminderCount: salesInvoices.reminderCount });
          if (claimed.length) {
            const reminderNo = Math.max(...claimed.map((r) => r.reminderCount));
            const tpl = dunningEmail({
              customerName: c.customer,
              contactPerson: c.contactPerson,
              company,
              reminderNo,
              invoices: overdue
                .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                .map((r) => ({ number: r.number, invoiceDate: r.invoiceDate, dueDate: r.dueDate, total: Number(r.total), outstanding: r.outstanding, daysOverdue: Math.max(0, r.late) })),
            });
            await queueEmail(db, { to: email, subject: tpl.subject, html: tpl.html, agent: "receivables", entityType: "customer", entityId: c.customerId });
            emails++;
            notes.push(`Reminder #${reminderNo} → ${c.customer} (${money(overdue.reduce((s, r) => s + r.outstanding, 0))})`);
          }
        }
      }

      // ---- escalation alerts to accounts
      for (const r of overdue) {
        const base = { entityType: "sales_invoice", entityId: r.id, link: `/billing/invoices/${r.id}`, assignedRole: "accounts" as const, dueDate: r.dueDate };
        if (r.late > 60) {
          out.push({
            ...base,
            dedupeKey: `rcv:60:${r.id}`,
            severity: "critical",
            title: `${r.number} · ${c.customer}: ${moneyShort(r.outstanding)} unpaid, ${r.late} days overdue`,
            message: `Invoice dated ${fmtDate(r.invoiceDate)}, due ${fmtDate(r.dueDate)}. ${plural(r.reminderCount, "reminder")} sent so far.` +
              `${c.phone ? ` Call ${c.contactPerson ?? "the customer"} on ${c.phone}.` : ""} Consider holding further supplies.`,
          });
        } else if (params.maxReminders > 0 && r.reminderCount >= params.maxReminders) {
          out.push({
            ...base,
            dedupeKey: `rcv:max:${r.id}`,
            severity: "warning",
            title: `${r.number} · ${c.customer}: ${plural(r.reminderCount, "reminder")} sent, still unpaid (${moneyShort(r.outstanding)})`,
            message: `Automatic emails have stopped. ${r.late} days overdue.${c.phone ? ` Please call ${c.phone}.` : ""}`,
          });
        }
      }
    }
    return { alerts: out, emails, notes };
  },
});

// ---------------------------------------------------------------- payables
const payMeta = {
  leadDays: { label: "Alert when a vendor bill is due within (days)", min: 0, max: 60, unit: "days" },
};

export const payablesAgent = defineAgent({
  key: "payables",
  name: "Payables Agent",
  description: "Lists posted vendor bills that are due soon or already overdue (due date, or invoice date + vendor credit terms) so accounts can plan payments and protect vendor credit.",
  ownerRole: "accounts",
  defaultParams: { leadDays: 7 },
  paramSchema: numericParams(payMeta),
  paramMeta: payMeta,
  minutesSavedPerAlert: 5,
  async run({ db, today, params }) {
    const due = sql<string>`coalesce(${purchaseInvoices.dueDate}, ${purchaseInvoices.invoiceDate} + ${vendors.paymentTermsDays})::text`;
    const rows = await db
      .select({
        id: purchaseInvoices.id, invoiceNo: purchaseInvoices.invoiceNo, invoiceDate: purchaseInvoices.invoiceDate,
        total: purchaseInvoices.total, paid: purchaseInvoices.paidAmount, vendor: vendors.name, due,
      })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId))
      .where(and(
        eq(purchaseInvoices.status, "posted"),
        sql`${purchaseInvoices.total} - ${purchaseInvoices.paidAmount} > 0.5`,
        sql`coalesce(${purchaseInvoices.dueDate}, ${purchaseInvoices.invoiceDate} + ${vendors.paymentTermsDays}) <= ${addDays(today, params.leadDays)}::date`,
      ));
    const out: AlertDraft[] = rows.map((r) => {
      const outstanding = Number(r.total) - Number(r.paid);
      const late = daysBetween(r.due, today);
      return {
        dedupeKey: `pay:${r.id}:${r.due}`,
        severity: late > 30 ? "critical" : late > 0 ? "warning" : "info",
        title: `Pay ${r.vendor}: bill ${r.invoiceNo}, ${moneyShort(outstanding)} ${describeDue(r.due, today)}`,
        message: `Bill dated ${fmtDate(r.invoiceDate)}, due ${fmtDate(r.due)}. Outstanding ${money(outstanding)}. Record the payment to clear this alert.`,
        entityType: "purchase_invoice",
        entityId: r.id,
        link: `/purchases/${r.id}`,
        assignedRole: "accounts",
        dueDate: r.due,
      };
    });
    return { alerts: out };
  },
});
