/** Operations agents: pending deliveries, refills, low stock, stale prices. Deterministic rules, no AI. */
import "server-only";
import { and, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import {
  boqTemplateLines, boqTemplates, customers, extinguisherAssets, items, quotationLines, quotations,
  salesOrderLines, salesOrders, stockAllocations, stockMovements,
} from "@/db/schema";
import { addDays, daysBetween, fmtDate, qty } from "@/lib/format";
import { netDeliveredQty, pendingQtyOf } from "@/lib/orders";
import { defineAgent, numericParams } from "./define";
import { describeDue, groupBy, listPreview, plural, shortHash, truncate } from "./rules";
import type { AlertDraft, Severity } from "./types";

// ---------------------------------------------------------------- pending_delivery
const pdMeta = {
  graceDays: { label: "Grace period after the expected date before a line is critical (days)", min: 0, max: 30, unit: "days" },
  upcomingDays: { label: "Remind about deliveries due within (days)", min: 0, max: 30, unit: "days" },
};

/** Undelivered customer-PO lines with their effective expected date. Shared with dashboard & digest. */
export const PENDING_LINE_WHERE = and(
  inArray(salesOrders.status, ["open", "partial"]),
  notInArray(salesOrderLines.deliveryStatus, ["delivered", "cancelled"]),
  // rule 13: returned goods are owed again, so compare against net delivered (delivered − returned)
  sql`${salesOrderLines.qty} - (${salesOrderLines.deliveredQty} - ${salesOrderLines.returnedQty}) > 0.0001`,
);

export const pendingDeliveryAgent = defineAgent({
  key: "pending_delivery",
  name: "Pending Delivery Agent",
  description: "Tracks every undelivered line of every customer PO. Raises one alert per line: critical when past the expected date, warning when no delivery date was ever set, and a heads-up for deliveries due soon. Clears itself when the delivery is recorded.",
  ownerRole: "store",
  defaultParams: { graceDays: 0, upcomingDays: 3 },
  paramSchema: numericParams(pdMeta),
  paramMeta: pdMeta,
  minutesSavedPerAlert: 10,
  async run({ db, today, params }) {
    const rows = await db
      .select({
        lineId: salesOrderLines.id, description: salesOrderLines.description, qty: salesOrderLines.qty,
        deliveredQty: salesOrderLines.deliveredQty, returnedQty: salesOrderLines.returnedQty, uom: salesOrderLines.uom, lineExpected: salesOrderLines.expectedDate,
        lineStatus: salesOrderLines.deliveryStatus,
        orderId: salesOrders.id, orderNumber: salesOrders.number, poNumber: salesOrders.customerPoNumber,
        orderDate: salesOrders.orderDate, orderExpected: salesOrders.expectedDelivery, createdBy: salesOrders.createdBy,
        customer: customers.name,
      })
      .from(salesOrderLines)
      .innerJoin(salesOrders, eq(salesOrders.id, salesOrderLines.orderId))
      .innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .where(PENDING_LINE_WHERE);

    const out: AlertDraft[] = [];
    const graceCutoff = addDays(today, -params.graceDays);
    const upcomingCutoff = addDays(today, params.upcomingDays);
    for (const r of rows) {
      const expected = r.lineExpected ?? r.orderExpected;
      const pending = pendingQtyOf(r);
      const po = r.poNumber ? `PO ${r.poNumber}` : r.orderNumber;
      const what = `${truncate(r.description, 60)}: ${qty(pending)}${netDeliveredQty(r.deliveredQty, r.returnedQty) > 0 || Number(r.returnedQty) > 0 ? ` of ${qty(r.qty)}` : ""} ${r.uom} pending`;
      let severity: Severity, when: string;
      if (expected && expected < today) {
        severity = expected < graceCutoff ? "critical" : "warning";
        when = `${plural(daysBetween(expected, today), "day")} overdue`;
      } else if (!expected) {
        if (daysBetween(r.orderDate, today) <= 3) continue;
        severity = "warning";
        when = `no delivery date (ordered ${fmtDate(r.orderDate)})`;
      } else if (expected <= upcomingCutoff) {
        severity = "info";
        when = describeDue(expected, today);
      } else continue;
      out.push({
        dedupeKey: `pd:line:${r.lineId}`,
        severity,
        title: `${po} · ${r.customer}: ${what}, ${when}`,
        message: `Order ${r.orderNumber} dated ${fmtDate(r.orderDate)}. Line status: ${r.lineStatus.replace(/_/g, " ")}.` +
          `${expected ? ` Expected ${fmtDate(expected)}.` : " Set an expected date so the customer can be given a commitment."}` +
          ` Record the delivery (DC) to clear this alert.`,
        entityType: "sales_order",
        entityId: r.orderId,
        link: `/orders/${r.orderId}`,
        assignedRole: "store",
        assignedUserId: r.createdBy ?? null,
        dueDate: expected ?? null,
      });
    }
    return { alerts: out };
  },
});

// ---------------------------------------------------------------- refill_due
const refillMeta = {
  leadDays: { label: "Alert this many days before refill / HPT is due", min: 0, max: 90, unit: "days" },
};

export const refillDueAgent = defineAgent({
  key: "refill_due",
  name: "Refill & HPT Reminder Agent",
  description: "Scans every active extinguisher at every customer site. Groups those due for refilling (or hydraulic pressure test) by customer and due date so sales can call once and book the visit.",
  ownerRole: "sales",
  defaultParams: { leadDays: 10 },
  paramSchema: numericParams(refillMeta),
  paramMeta: refillMeta,
  minutesSavedPerAlert: 15,
  async run({ db, today, params }) {
    const horizon = addDays(today, params.leadDays);
    const rows = await db
      .select({
        id: extinguisherAssets.id, customerId: extinguisherAssets.customerId, extType: extinguisherAssets.extType,
        location: extinguisherAssets.location, qty: extinguisherAssets.qty, nextDueDate: extinguisherAssets.nextDueDate,
        hptDueDate: extinguisherAssets.hptDueDate, customer: customers.name, phone: customers.phone,
      })
      .from(extinguisherAssets)
      .innerJoin(customers, eq(customers.id, extinguisherAssets.customerId))
      .where(and(
        eq(extinguisherAssets.status, "active"),
        or(sql`${extinguisherAssets.nextDueDate} <= ${horizon}`, sql`${extinguisherAssets.hptDueDate} <= ${horizon}`),
      ));

    const out: AlertDraft[] = [];
    const emit = (kind: "refill" | "hpt", list: typeof rows, due: string) => {
      const first = list[0];
      const units = list.reduce((s, r) => s + Number(r.qty || 1), 0);
      const late = daysBetween(due, today);
      const label = kind === "refill" ? "Refill" : "HPT (pressure test)";
      out.push({
        dedupeKey: `${kind === "refill" ? "rf" : "hpt"}:${first.customerId}:${due}`,
        severity: late > 0 ? "critical" : late >= -3 ? "warning" : "info",
        title: `${label} ${describeDue(due, today)} · ${first.customer}: ${plural(units, "extinguisher")}`,
        message: `${listPreview(list.map((r) => `${r.qty > 1 ? r.qty + "× " : ""}${r.extType}${r.location ? " @ " + r.location : ""}`), 6)}. ` +
          `Due ${fmtDate(due)}.${first.phone ? ` Call ${first.phone} to schedule the visit.` : ""}`,
        entityType: "customer",
        entityId: first.customerId,
        link: `/refills?customer=${first.customerId}`,
        assignedRole: "sales",
        dueDate: due,
      });
    };
    const refill = rows.filter((r) => r.nextDueDate <= horizon);
    for (const list of groupBy(refill, (r) => `${r.customerId}|${r.nextDueDate}`).values()) emit("refill", list, list[0].nextDueDate);
    const hpt = rows.filter((r) => r.hptDueDate && r.hptDueDate <= horizon);
    for (const list of groupBy(hpt, (r) => `${r.customerId}|${r.hptDueDate}`).values()) emit("hpt", list, list[0].hptDueDate as string);
    return { alerts: out };
  },
});

// ---------------------------------------------------------------- low_stock
export const lowStockAgent = defineAgent({
  key: "low_stock",
  name: "Low Stock Agent",
  description: "Computes available stock (on-hand from stock movements minus reserved allocations) for every item with a re-order level and flags those below it.",
  ownerRole: "purchase",
  defaultParams: {},
  paramSchema: numericParams({}),
  paramMeta: {},
  minutesSavedPerAlert: 5,
  async run({ db }) {
    const onHand = db
      .select({
        itemId: stockMovements.itemId,
        qty: sql<number>`coalesce(sum(${stockMovements.qty}),0)`.mapWith(Number).as("on_hand"),
        lastIn: sql<number>`coalesce(max(case when ${stockMovements.qty} > 0 then ${stockMovements.id} end),0)`.mapWith(Number).as("last_in"),
      })
      .from(stockMovements)
      .groupBy(stockMovements.itemId)
      .as("oh");
    const reserved = db
      .select({ itemId: stockAllocations.itemId, qty: sql<number>`coalesce(sum(${stockAllocations.qty}),0)`.mapWith(Number).as("reserved") })
      .from(stockAllocations)
      .where(eq(stockAllocations.status, "reserved"))
      .groupBy(stockAllocations.itemId)
      .as("rs");
    const rows = await db
      .select({
        id: items.id, code: items.code, name: items.name, size: items.size, uom: items.uom, reorderLevel: items.reorderLevel,
        onHand: onHand.qty, lastIn: onHand.lastIn, reserved: reserved.qty,
      })
      .from(items)
      .leftJoin(onHand, eq(onHand.itemId, items.id))
      .leftJoin(reserved, eq(reserved.itemId, items.id))
      .where(and(eq(items.active, true), sql`${items.reorderLevel} > 0`));

    const out: AlertDraft[] = [];
    for (const r of rows) {
      const available = Number(r.onHand ?? 0) - Number(r.reserved ?? 0);
      if (available >= Number(r.reorderLevel)) continue;
      out.push({
        // key includes the last receipt so a fresh shortage after restocking raises a new alert
        dedupeKey: `ls:${r.id}:${Number(r.lastIn ?? 0)}`,
        severity: available <= 0 ? "critical" : "warning",
        title: `Low stock · ${r.name}${r.size ? " " + r.size : ""}: ${qty(available)} ${r.uom} available (re-order at ${qty(r.reorderLevel)})`,
        message: `On hand ${qty(r.onHand ?? 0)}, reserved ${qty(r.reserved ?? 0)}. Raise a purchase for item ${r.code}.`,
        entityType: "item",
        entityId: r.id,
        link: `/items/${r.id}`,
        assignedRole: "purchase",
      });
    }
    return { alerts: out };
  },
});

// ---------------------------------------------------------------- stale_price
const staleMeta = {
  volatileDays: { label: "Volatile items (pipes, cable…): price is stale after (days)", min: 1, max: 365, unit: "days" },
  normalDays: { label: "Other items in open quotes / templates: price is stale after (days)", min: 1, max: 1095, unit: "days" },
};

export const stalePriceAgent = defineAgent({
  key: "stale_price",
  name: "Stale Price Agent",
  description: "Finds items whose latest purchase price is too old to quote safely: volatile items (pipes etc.) on a short window, items used in open quotes or BOQ templates on a longer one. One alert per item group listing the sizes to re-confirm with vendors.",
  ownerRole: "purchase",
  defaultParams: { volatileDays: 7, normalDays: 90 },
  paramSchema: numericParams(staleMeta),
  paramMeta: staleMeta,
  minutesSavedPerAlert: 10,
  async run({ db, today, params }) {
    const inOpenQuotes = db
      .selectDistinct({ itemId: quotationLines.itemId })
      .from(quotationLines)
      .innerJoin(quotations, eq(quotations.id, quotationLines.quotationId))
      .where(and(inArray(quotations.status, ["draft", "sent", "negotiation"]), sql`${quotationLines.itemId} is not null`, sql`${quotationLines.qty} > 0`));
    const inTemplates = db
      .selectDistinct({ itemId: boqTemplateLines.itemId })
      .from(boqTemplateLines)
      .innerJoin(boqTemplates, eq(boqTemplates.id, boqTemplateLines.templateId))
      .where(and(eq(boqTemplates.active, true), sql`${boqTemplateLines.itemId} is not null`));

    const rows = await db
      .select({
        id: items.id, groupName: items.groupName, size: items.size, name: items.name, volatile: items.volatilePrice,
        lastPurchaseDate: items.lastPurchaseDate,
        inQuote: sql<boolean>`${items.id} in (${inOpenQuotes})`,
      })
      .from(items)
      .where(and(
        eq(items.active, true),
        or(eq(items.volatilePrice, true), sql`${items.id} in (${inOpenQuotes})`, sql`${items.id} in (${inTemplates})`),
      ));

    type Row = (typeof rows)[number] & { age: number | null };
    const stale: Row[] = [];
    for (const r of rows) {
      const limit = r.volatile ? params.volatileDays : params.normalDays;
      const age = r.lastPurchaseDate ? daysBetween(r.lastPurchaseDate, today) : null;
      if (age == null || age > limit) stale.push({ ...r, age });
    }

    const out: AlertDraft[] = [];
    for (const [group, list] of groupBy(stale, (r) => r.groupName)) {
      const ages = list.map((r) => r.age).filter((a): a is number => a != null);
      const oldest = ages.length ? Math.max(...ages) : null;
      const never = list.filter((r) => r.age == null).length;
      const anyVolatileQuoted = list.some((r) => r.volatile && r.inQuote);
      const sizes = listPreview(list.map((r) => r.size || r.name), 5);
      const minDate = list.map((r) => r.lastPurchaseDate ?? "never").sort()[0];
      const ageText = oldest != null ? `price ${plural(oldest, "day")} old` : "no purchase price on record";
      out.push({
        // key changes when the group's oldest price changes, so a re-stale after a refresh raises a new alert
        dedupeKey: `sp:${shortHash(group)}:${minDate}`,
        severity: anyVolatileQuoted ? "warning" : "info",
        title: `${group}${list.length === 1 ? ` ${list[0].size ?? ""}`.trimEnd() : ` (${plural(list.length, "size")})`}: ${ageText}, confirm with vendor`,
        message: `Sizes: ${sizes}.${never ? ` ${plural(never, "item")} never purchased (quoting from list price).` : ""}` +
          `${list.some((r) => r.inQuote) ? " Used in open quotations, so re-confirm before the quote goes out." : ""}` +
          ` Update the rate from the latest vendor quote / purchase invoice to clear this alert.`,
        entityType: "item",
        entityId: list[0].id,
        link: list.length === 1 ? `/items/${list[0].id}` : `/items?q=${encodeURIComponent(group)}`,
        assignedRole: "purchase",
      });
    }
    return { alerts: out };
  },
});
