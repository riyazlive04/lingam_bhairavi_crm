/** AMC & service agent: visit reminders, renewal reminders and service call SLA breaches. Deterministic rules, no AI. */
import "server-only";
import { and, eq, inArray, lt, lte, notInArray, sql } from "drizzle-orm";
import { amcContracts, amcVisits, customers, serviceCalls } from "@/db/schema";
import { addDays, daysBetween, fmtDate, fmtDateTime, money0 } from "@/lib/format";
import { fmtDuration, systemLabel } from "@/lib/amc";
import { defineAgent, numericParams } from "./define";
import { describeDue, plural, truncate } from "./rules";
import type { AlertDraft, Severity } from "./types";

const meta = {
  visitLeadDays: { label: "Remind about AMC visits due within (days)", min: 0, max: 60, unit: "days" },
  renewalLeadDays: { label: "Start renewal reminders this many days before an AMC ends", min: 1, max: 180, unit: "days" },
};

export const amcServiceAgent = defineAgent({
  key: "amc_service",
  name: "AMC & Service Agent",
  description: "Watches every AMC contract and breakdown call. Reminds the engineer about preventive visits due this week or overdue, asks sales to send a renewal quotation before a contract ends, and raises a critical alert when a service call passes its response deadline. Marks contracts expired once their end date passes.",
  ownerRole: "sales",
  defaultParams: { visitLeadDays: 7, renewalLeadDays: 30 },
  paramSchema: numericParams(meta),
  paramMeta: meta,
  minutesSavedPerAlert: 10,
  minutesSavedPerAction: 2,
  async run({ db, today, params }) {
    const out: AlertDraft[] = [];
    const now = new Date();

    // Contracts whose end date has passed are expired (conditional update: a no-op on the second run).
    const expired = await db.update(amcContracts).set({ status: "expired" })
      .where(and(eq(amcContracts.status, "active"), lt(amcContracts.endDate, today)))
      .returning({ id: amcContracts.id });

    // ------------------------------------------------ preventive visits due soon or overdue
    const visitHorizon = addDays(today, params.visitLeadDays);
    const visits = await db
      .select({
        id: amcVisits.id, date: amcVisits.scheduledDate, engineerId: amcVisits.engineerId,
        contractId: amcContracts.id, number: amcContracts.number, systems: amcContracts.systems, contractEngineer: amcContracts.engineerId,
        createdBy: amcContracts.createdBy, customer: customers.name, phone: customers.phone,
      })
      .from(amcVisits)
      .innerJoin(amcContracts, eq(amcContracts.id, amcVisits.contractId))
      .innerJoin(customers, eq(customers.id, amcContracts.customerId))
      .where(and(eq(amcVisits.status, "scheduled"), eq(amcContracts.status, "active"), lte(amcVisits.scheduledDate, visitHorizon)));
    for (const v of visits) {
      const late = daysBetween(v.date, today);
      const engineer = v.engineerId ?? v.contractEngineer;
      const severity: Severity = late > 7 ? "critical" : late >= -1 ? "warning" : "info";
      out.push({
        // key includes the date so a reschedule raises a fresh reminder and the old one clears itself
        dedupeKey: `amc:visit:${v.id}:${v.date}`,
        severity,
        title: `AMC visit ${describeDue(v.date, today)} · ${v.customer} (${v.number})`,
        message: `Preventive maintenance visit scheduled for ${fmtDate(v.date)}. Systems: ${(v.systems ?? []).map(systemLabel).join(", ") || "not set"}.` +
          `${v.phone ? ` Confirm the visit with the customer on ${v.phone}.` : ""}` +
          `${engineer ? "" : " No engineer is assigned yet."} Record the visit report (or reschedule it) to clear this alert.`,
        entityType: "amc_contract",
        entityId: v.contractId,
        link: `/amc/${v.contractId}/visits/${v.id}`,
        assignedRole: engineer ? "engineer" : "sales",
        assignedUserId: engineer ?? v.createdBy ?? null,
        dueDate: v.date,
      });
    }

    // ------------------------------------------------ renewals
    const ending = await db
      .select({
        id: amcContracts.id, number: amcContracts.number, endDate: amcContracts.endDate, value: amcContracts.value,
        createdBy: amcContracts.createdBy, customer: customers.name, phone: customers.phone,
      })
      .from(amcContracts)
      .innerJoin(customers, eq(customers.id, amcContracts.customerId))
      .where(and(
        inArray(amcContracts.status, ["active", "expired"]),
        lte(amcContracts.endDate, addDays(today, params.renewalLeadDays)),
        // stop nagging 90 days after a lapse; also skip contracts that already have a (non-cancelled) renewal
        sql`${amcContracts.endDate} >= ${addDays(today, -90)}`,
        sql`not exists (select 1 from amc_contracts r where r.renewal_of = ${amcContracts.id} and r.status <> 'cancelled')`,
      ));
    for (const c of ending) {
      const left = daysBetween(today, c.endDate);
      const severity: Severity = left < 0 ? "critical" : left <= 7 ? "warning" : "info";
      out.push({
        dedupeKey: `amc:renew:${c.id}:${c.endDate}`,
        severity,
        title: left < 0
          ? `AMC lapsed ${plural(-left, "day")} ago · ${c.customer} (${c.number}): renewal pending`
          : `AMC ends ${left === 0 ? "today" : `in ${plural(left, "day")}`} · ${c.customer} (${c.number}): send a renewal quotation`,
        message: `Contract ${c.number} ends on ${fmtDate(c.endDate)}. Current value ${money0(Number(c.value))} (excl. GST).` +
          `${c.phone ? ` Call ${c.phone} to confirm the renewal.` : ""} Use Renew on the contract page to clear this alert.`,
        entityType: "amc_contract",
        entityId: c.id,
        link: `/amc/${c.id}`,
        assignedRole: "sales",
        assignedUserId: c.createdBy ?? null,
        dueDate: c.endDate,
      });
    }

    // ------------------------------------------------ service calls past their response deadline
    const calls = await db
      .select({
        id: serviceCalls.id, number: serviceCalls.number, dueBy: serviceCalls.dueBy, priority: serviceCalls.priority,
        system: serviceCalls.system, description: serviceCalls.description, engineerId: serviceCalls.engineerId,
        status: serviceCalls.status, customer: customers.name,
      })
      .from(serviceCalls)
      .innerJoin(customers, eq(customers.id, serviceCalls.customerId))
      .where(and(notInArray(serviceCalls.status, ["resolved", "closed"]), lt(serviceCalls.dueBy, now)));
    for (const c of calls) {
      if (!c.dueBy) continue;
      const late = (now.getTime() - new Date(c.dueBy).getTime()) / 60000;
      out.push({
        dedupeKey: `amc:sla:${c.id}`,
        severity: "critical",
        title: `Service call SLA breached · ${c.customer} (${c.number}): overdue by ${fmtDuration(late)}`,
        message: `${truncate(c.description, 140)}${c.system ? ` (${systemLabel(c.system)})` : ""}. Response was due by ${fmtDateTime(c.dueBy)}. ` +
          `Status: ${c.status.replace(/_/g, " ")}, priority ${c.priority}.${c.engineerId ? "" : " No engineer assigned."} Resolve the call to clear this alert.`,
        entityType: "service_call",
        entityId: c.id,
        link: `/service-calls/${c.id}`,
        assignedRole: c.engineerId ? "engineer" : "sales",
        assignedUserId: c.engineerId ?? null,
      });
    }

    return {
      alerts: out,
      actions: expired.length,
      notes: expired.length ? [`${plural(expired.length, "contract")} marked expired`] : [],
    };
  },
});
