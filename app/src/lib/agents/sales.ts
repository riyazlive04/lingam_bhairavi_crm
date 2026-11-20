/** Sales agents: follow-ups, quote expiry, margin guard. Deterministic rules — no AI. */
import "server-only";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { customers, followUps, quotationLines, quotations } from "@/db/schema";
import { addDays, daysBetween, fmtDate, marginPct, moneyShort, pct } from "@/lib/format";
import { audit } from "@/lib/audit";
import { defineAgent, numericParams } from "./define";
import { describeDue, plural, severityForLateness } from "./rules";
import type { AlertDraft } from "./types";

// ---------------------------------------------------------------- followup
const followupMeta = {
  overdueDays: { label: "Alert when follow-up is overdue by (days)", hint: "0 = alert on the due date itself", min: 0, max: 60, unit: "days" },
  noFollowUpDays: { label: "Alert when a sent quote has no follow-up logged after (days)", min: 1, max: 90, unit: "days" },
};

export const followupAgent = defineAgent({
  key: "followup",
  name: "Follow-up Agent",
  description: "Watches every sent / under-negotiation quotation. Flags follow-ups that are due or overdue, and quotes that were sent but never followed up.",
  ownerRole: "sales",
  defaultParams: { overdueDays: 0, noFollowUpDays: 3 },
  paramSchema: numericParams(followupMeta),
  paramMeta: followupMeta,
  minutesSavedPerAlert: 5,
  async run({ db, today, params }) {
    const fu = db
      .select({
        qid: followUps.quotationId,
        n: sql<number>`count(*)`.mapWith(Number).as("n"),
        last: sql<string | null>`max(${followUps.date})::text`.as("last"),
      })
      .from(followUps)
      .groupBy(followUps.quotationId)
      .as("fu");
    const rows = await db
      .select({
        id: quotations.id, number: quotations.number, status: quotations.status, projectName: quotations.projectName,
        nextFollowUpDate: quotations.nextFollowUpDate, quoteDate: quotations.quoteDate, sentAt: quotations.sentAt,
        grandTotal: quotations.grandTotal, preparedBy: quotations.preparedBy,
        customer: customers.name, phone: customers.phone, n: fu.n, last: fu.last,
      })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .leftJoin(fu, eq(fu.qid, quotations.id))
      .where(inArray(quotations.status, ["sent", "negotiation"]));

    const out: AlertDraft[] = [];
    const dueCutoff = addDays(today, -params.overdueDays);
    for (const q of rows) {
      const nFu = Number(q.n ?? 0);
      const base = { entityType: "quotation", entityId: q.id, link: `/quotations/${q.id}`, assignedRole: "sales" as const, assignedUserId: q.preparedBy ?? null };
      if (q.nextFollowUpDate && q.nextFollowUpDate <= dueCutoff) {
        const late = daysBetween(q.nextFollowUpDate, today);
        out.push({
          ...base,
          dedupeKey: `fu:due:${q.id}:${q.nextFollowUpDate}`,
          severity: severityForLateness(late, 7),
          title: `Follow up ${q.number} · ${q.customer} — ${describeDue(q.nextFollowUpDate, today)}`,
          message: `${q.projectName ? q.projectName + " · " : ""}${moneyShort(q.grandTotal)} · status ${q.status}. ` +
            `${nFu ? `Last contact ${fmtDate(q.last)} (${plural(nFu, "follow-up")} so far).` : "No follow-up logged yet."}` +
            `${q.phone ? ` Call ${q.phone}.` : ""} Log the follow-up with the next date to clear this alert.`,
          dueDate: q.nextFollowUpDate,
        });
        continue;
      }
      if (q.status === "sent" && nFu === 0) {
        const sentOn = q.sentAt ? new Date(q.sentAt.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10) : q.quoteDate;
        const age = daysBetween(sentOn, today);
        if (age > params.noFollowUpDays) {
          out.push({
            ...base,
            dedupeKey: `fu:none:${q.id}`,
            severity: age > params.noFollowUpDays * 3 ? "critical" : "warning",
            title: `No follow-up on ${q.number} · ${q.customer} — sent ${plural(age, "day")} ago`,
            message: `${q.projectName ? q.projectName + " · " : ""}${moneyShort(q.grandTotal)}. The quote was sent on ${fmtDate(sentOn)} and nobody has followed up yet.${q.phone ? ` Call ${q.phone}.` : ""}`,
            dueDate: addDays(sentOn, params.noFollowUpDays),
          });
        }
      }
    }
    return { alerts: out };
  },
});

// ---------------------------------------------------------------- quote_expiry
const expiryMeta = {
  warnDays: { label: "Warn this many days before a quote's validity ends", min: 0, max: 60, unit: "days" },
};

export const quoteExpiryAgent = defineAgent({
  key: "quote_expiry",
  name: "Quote Validity Agent",
  description: "Warns sales before a quotation's validity runs out, and automatically marks quotes past their validity date as Expired so the pipeline stays honest.",
  ownerRole: "sales",
  defaultParams: { warnDays: 3 },
  paramSchema: numericParams(expiryMeta),
  paramMeta: expiryMeta,
  minutesSavedPerAlert: 4,
  minutesSavedPerAction: 3,
  async run({ db, today, params }) {
    // 1) auto-expire (atomic: only rows still open are updated, so concurrent runs can't double-count)
    const expired = await db
      .update(quotations)
      .set({ status: "expired", closedAt: new Date() })
      .where(and(inArray(quotations.status, ["sent", "negotiation"]), isNotNull(quotations.validUntil), lt(quotations.validUntil, today)))
      .returning({ id: quotations.id, number: quotations.number });
    for (const q of expired) await audit(db, null, "update", "quotation", q.id, { status: "expired", by: "agent:quote_expiry" });

    const rows = await db
      .select({
        id: quotations.id, number: quotations.number, status: quotations.status, validUntil: quotations.validUntil,
        grandTotal: quotations.grandTotal, preparedBy: quotations.preparedBy, customer: customers.name,
      })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .where(and(
        isNotNull(quotations.validUntil),
        sql`((${quotations.status} in ('sent','negotiation') and ${quotations.validUntil} between ${today} and ${addDays(today, params.warnDays)})
          or (${quotations.status} = 'expired' and ${quotations.validUntil} >= ${addDays(today, -30)}))`,
      ));

    const out: AlertDraft[] = rows.map((q) => {
      const vu = q.validUntil as string;
      const base = { entityType: "quotation", entityId: q.id, link: `/quotations/${q.id}`, assignedRole: "sales" as const, assignedUserId: q.preparedBy ?? null, dueDate: vu };
      if (q.status === "expired") {
        return {
          ...base,
          dedupeKey: `qe:exp:${q.id}:${vu}`,
          severity: "warning",
          title: `${q.number} · ${q.customer} expired on ${fmtDate(vu)} — revise & resend?`,
          message: `${moneyShort(q.grandTotal)} quotation was marked Expired automatically. If the customer is still interested, create a revision with current prices; otherwise mark it lost.`,
        };
      }
      return {
        ...base,
        dedupeKey: `qe:warn:${q.id}:${vu}`,
        severity: vu === today ? "warning" : "info",
        title: `${q.number} · ${q.customer} — validity ends ${vu === today ? "today" : fmtDate(vu)}`,
        message: `${moneyShort(q.grandTotal)} quote (${q.status}) ${describeDue(vu, today).replace("due", "expires")}. Push for the PO or extend validity.`,
      };
    });
    return {
      alerts: out,
      actions: expired.length,
      notes: expired.length ? [`Auto-expired ${plural(expired.length, "quote")}: ${expired.map((q) => q.number).join(", ")}`] : [],
    };
  },
});

// ---------------------------------------------------------------- margin_guard
const marginMeta = {
  minMarginPct: { label: "Minimum acceptable margin on a quotation (%)", min: 0, max: 90, unit: "%" },
};

export const marginGuardAgent = defineAgent({
  key: "margin_guard",
  name: "Margin Guard",
  description: "Checks every draft / sent / negotiation quotation against latest buying cost. Flags quotes below the minimum margin and any line priced below cost — before it reaches the customer.",
  ownerRole: "admin",
  defaultParams: { minMarginPct: 15 },
  paramSchema: numericParams(marginMeta),
  paramMeta: marginMeta,
  minutesSavedPerAlert: 10,
  async run({ db, params }) {
    const below = db
      .select({
        qid: quotationLines.quotationId,
        n: sql<number>`count(*)`.mapWith(Number).as("n"),
        sample: sql<string>`string_agg(${quotationLines.description}, ' | ' order by ${quotationLines.sortOrder})`.as("sample"),
      })
      .from(quotationLines)
      .where(and(sql`${quotationLines.qty} > 0`, sql`${quotationLines.supplyRate} < ${quotationLines.costRate}`, sql`${quotationLines.costRate} > 0`))
      .groupBy(quotationLines.quotationId)
      .as("below");
    const rows = await db
      .select({
        id: quotations.id, number: quotations.number, status: quotations.status, grandTotal: quotations.grandTotal,
        taxAmount: quotations.taxAmount, costTotal: quotations.costTotal, customer: customers.name,
        nBelow: below.n, sample: below.sample,
      })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .leftJoin(below, eq(below.qid, quotations.id))
      .where(inArray(quotations.status, ["draft", "sent", "negotiation"]));

    const out: AlertDraft[] = [];
    for (const q of rows) {
      const sell = Number(q.grandTotal) - Number(q.taxAmount);
      const cost = Number(q.costTotal);
      const m = cost > 0 && sell > 0 ? marginPct(sell, cost) : null;
      const nBelow = Number(q.nBelow ?? 0);
      const lowMargin = m != null && m < params.minMarginPct;
      if (!lowMargin && nBelow === 0) continue;
      const parts: string[] = [];
      if (lowMargin) parts.push(`margin ${pct(m)} (minimum ${pct(params.minMarginPct, 0)})`);
      if (nBelow) parts.push(`${plural(nBelow, "line")} below cost`);
      const sample = q.sample ? q.sample.split(" | ").slice(0, 3).join("; ") : "";
      out.push({
        dedupeKey: `mg:${q.id}`,
        severity: (m != null && m < 0) || nBelow > 0 ? "critical" : "warning",
        title: `${q.number} · ${q.customer} — ${parts.join(", ")}`,
        message: `Selling ${moneyShort(sell)} (excl. GST) vs cost ${moneyShort(cost)}. ${nBelow ? `Below-cost lines: ${sample}${nBelow > 3 ? "…" : ""}. ` : ""}Re-price before ${q.status === "draft" ? "sending" : "the next revision"}.`,
        entityType: "quotation",
        entityId: q.id,
        link: `/quotations/${q.id}`,
        assignedRole: "admin",
      });
    }
    return { alerts: out };
  },
});
