"use server";
import { publicError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, like, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  boqTemplates, customers, followUps, priceHistory, projects, quotationLines, quotations, salesOrderLines, salesOrders,
} from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { SYSTEMS } from "@/lib/constants";
import { queueEmail } from "@/lib/email";
import { addDays, round2, todayIST } from "@/lib/format";
import { canSeeCost } from "@/lib/rbac";
import { nextNumber } from "@/lib/sequence";
import { computeQuoteTotals, getPricingSettings, suggestRates } from "@/lib/pricing";
import { getCompanySettings, isEditableStatus, revisionNumber } from "@/lib/quotations";
import { itemPricing, recalcQuotation, refreshLinePrices } from "./_lib/data";
import { quotationEmailHtml } from "./_lib/email-html";

// ---------------------------------------------------------------- helpers
const systemKeys = Object.keys(SYSTEMS) as [string, ...string[]];
const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const optDate = z.union([dateStr, z.literal("")]).nullish().transform((v) => (v ? v : null));
const idSchema = z.coerce.number().int().positive();

function errMsg(e: unknown) {
  if (e instanceof z.ZodError) {
    const i = e.issues[0];
    return i ? `${i.path.length ? i.path.join(".") + ": " : ""}${i.message}` : "Invalid input";
  }
  if (e instanceof SyntaxError) return "Invalid line data";
  return publicError(e, "Something went wrong");
}
/** Only same-app relative paths are allowed as redirect targets. */
function safeBack(v: FormDataEntryValue | null, fallback: string) {
  const s = typeof v === "string" ? v : "";
  return /^\/[a-z0-9/_\-?=&%.]*$/i.test(s) && !s.startsWith("//") ? s : fallback;
}
function withMsg(path: string, key: "ok" | "err", msg: string) {
  const clean = path.replace(/([?&])(ok|err)=[^&]*/g, "$1").replace(/[?&]+$/, "").replace(/\?&/, "?");
  return `${clean}${clean.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`;
}
async function loadQuote(id: number) {
  const db = await getDb();
  const [q] = await db.select().from(quotations).where(eq(quotations.id, id));
  if (!q) throw new Error("Quotation not found");
  return { db, q };
}
function revalidateQuote(id: number) {
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  revalidatePath("/follow-ups");
}

// ---------------------------------------------------------------- step 1: header → step 2 grid
const startSchema = z.object({
  customerId: z.union([idSchema, z.literal("")]).nullish(),
  newName: optText(200),
  newPhone: optText(30),
  newEmail: z.union([z.string().trim().email("Invalid customer email").max(160), z.literal("")]).nullish(),
  newCity: optText(80),
  projectName: optText(200),
  siteLocation: optText(200),
  templateId: z.union([idSchema, z.literal("")]).nullish(),
  markupPct: z.coerce.number().min(0, "Markup cannot be negative").max(500),
  validityDays: z.coerce.number().int().min(1).max(365),
});

export async function startQuotation(form: FormData) {
  const user = await requireWrite("quotations");
  let target: string;
  try {
    const p = startSchema.parse(Object.fromEntries(form));
    const db = await getDb();
    let customerId = typeof p.customerId === "number" ? p.customerId : null;
    if (p.newName) {
      const [c] = await db.insert(customers).values({
        name: p.newName, phone: p.newPhone, email: p.newEmail || null, city: p.newCity, type: "customer",
      }).returning({ id: customers.id });
      customerId = c.id;
      await audit(db, user.id, "create", "customer", c.id, { name: p.newName, via: "quotation" });
      revalidatePath("/customers");
    }
    if (!customerId) throw new Error("Choose a customer or enter a new customer name");
    const [c] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
    if (!c) throw new Error("Customer not found");
    if (typeof p.templateId === "number") {
      const [t] = await db.select({ id: boqTemplates.id }).from(boqTemplates).where(eq(boqTemplates.id, p.templateId));
      if (!t) throw new Error("BOQ template not found");
    }
    const qs = new URLSearchParams({
      step: "2", customerId: String(customerId), markup: String(p.markupPct), validity: String(p.validityDays),
    });
    if (typeof p.templateId === "number") qs.set("templateId", String(p.templateId));
    if (p.projectName) qs.set("projectName", p.projectName);
    if (p.siteLocation) qs.set("site", p.siteLocation);
    target = `/quotations/new?${qs.toString()}`;
  } catch (e) {
    target = `/quotations/new?err=${encodeURIComponent(errMsg(e))}`;
  }
  redirect(target);
}

// ---------------------------------------------------------------- save (create / update) from the BOQ grid
const lineSchema = z.object({
  lineId: z.coerce.number().int().positive().nullish(),
  section: optText(120),
  boqRef: optText(20),
  itemId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  description: z.string().trim().min(1, "Every line needs a description").max(4000),
  uom: z.string().trim().min(1).max(20).catch("Nos"),
  qty: z.coerce.number().min(0, "Quantity cannot be negative").max(1e8),
  supplyRate: z.coerce.number().min(0, "Rates cannot be negative").max(1e10),
  erectionRate: z.coerce.number().min(0, "Rates cannot be negative").max(1e10),
  costRate: z.coerce.number().min(0).max(1e10).nullish(),
  remarks: optText(1000),
});

const saveSchema = z.object({
  id: z.union([idSchema, z.literal("")]).nullish(),
  customerId: idSchema,
  templateId: z.union([idSchema, z.literal("")]).nullish(),
  projectName: optText(200),
  siteLocation: optText(200),
  system: z.union([z.enum(systemKeys), z.literal("")]).nullish(),
  quoteDate: dateStr,
  validUntil: optDate,
  markupPct: z.coerce.number().min(0).max(500),
  discountPct: z.coerce.number().min(0, "Discount cannot be negative").max(100),
  gstPct: z.coerce.number().min(0).max(100),
  terms: optText(8000),
  notes: optText(4000),
});

export async function saveQuotation(form: FormData) {
  const user = await requireWrite("quotations");
  const rawId = form.get("id");
  let target: string;
  try {
    const h = saveSchema.parse({
      id: form.get("id"), customerId: form.get("customerId"), templateId: form.get("templateId"),
      projectName: form.get("projectName"), siteLocation: form.get("siteLocation"), system: form.get("system"),
      quoteDate: form.get("quoteDate"), validUntil: form.get("validUntil"), markupPct: form.get("markupPct"),
      discountPct: form.get("discountPct"), gstPct: form.get("gstPct"), terms: form.get("terms"), notes: form.get("notes"),
    });
    const all = z.array(lineSchema).max(2000).parse(JSON.parse(String(form.get("lines") ?? "[]")));
    // Rule 3: lines with qty 0 are never saved.
    const lines = all.filter((l) => l.qty > 0);
    if (!lines.length) throw new Error("Enter a quantity for at least one line — zero-quantity lines are not saved");
    if (h.validUntil && h.validUntil < h.quoteDate) throw new Error("Valid-until date must be on or after the quotation date");

    const db = await getDb();
    const [cust] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, h.customerId));
    if (!cust) throw new Error("Customer not found");
    const id = typeof h.id === "number" ? h.id : null;
    let existing: (typeof quotations.$inferSelect) | undefined;
    const prevLines = new Map<number, typeof quotationLines.$inferSelect>();
    if (id) {
      [existing] = await db.select().from(quotations).where(eq(quotations.id, id));
      if (!existing) throw new Error("Quotation not found");
      if (!isEditableStatus(existing.status)) throw new Error(`A ${existing.status} quotation cannot be edited — use Revise`);
      const pl = await db.select().from(quotationLines).where(eq(quotationLines.quotationId, id));
      for (const l of pl) prevLines.set(l.id, l);
    }

    // Cost snapshot is always computed server-side (never trusted from the client for item-linked lines).
    const priceMap = await itemPricing(db, lines.map((l) => l.itemId).filter((x): x is number => x != null));
    const showCost = canSeeCost(user.role);
    const rows = lines.map((l, i) => {
      const prev = l.lineId ? prevLines.get(l.lineId) : undefined;
      let costRate = 0;
      if (l.itemId != null) {
        const it = priceMap.get(l.itemId);
        if (!it) throw new Error(`Item on line ${i + 1} no longer exists`);
        costRate = prev && prev.itemId === l.itemId ? prev.costRate : suggestRates(it, h.markupPct).costRate;
      } else {
        costRate = showCost && l.costRate != null ? round2(l.costRate) : prev?.costRate ?? 0;
      }
      return {
        sortOrder: i + 1, boqRef: l.boqRef, section: l.section, itemId: l.itemId, description: l.description, qty: l.qty,
        uom: l.uom, costRate, supplyRate: round2(l.supplyRate), erectionRate: round2(l.erectionRate), remarks: l.remarks,
      };
    });
    const t = computeQuoteTotals(rows, h.discountPct, h.gstPct);
    const header = {
      customerId: h.customerId, projectName: h.projectName, siteLocation: h.siteLocation, system: h.system || null,
      templateId: typeof h.templateId === "number" ? h.templateId : null, quoteDate: h.quoteDate, validUntil: h.validUntil,
      markupPct: h.markupPct, discountPct: h.discountPct, gstPct: h.gstPct, terms: h.terms, notes: h.notes,
      subtotalSupply: t.supply, subtotalErection: t.erection, costTotal: t.cost, taxAmount: t.tax, grandTotal: t.grand,
    };

    let qid: number;
    if (id && existing) {
      await db.transaction(async (tx) => {
        await tx.update(quotations).set(header).where(eq(quotations.id, id));
        await tx.delete(quotationLines).where(eq(quotationLines.quotationId, id));
        await tx.insert(quotationLines).values(rows.map((r) => ({ ...r, quotationId: id })));
      });
      qid = id;
      await audit(db, user.id, "update", "quotation", qid, { lines: rows.length, grandTotal: t.grand });
    } else {
      const number = await nextNumber(db, "quotation", h.quoteDate);
      qid = await db.transaction(async (tx) => {
        const [q] = await tx.insert(quotations).values({ ...header, number, revision: 0, status: "draft", preparedBy: user.id }).returning({ id: quotations.id });
        await tx.insert(quotationLines).values(rows.map((r) => ({ ...r, quotationId: q.id })));
        return q.id;
      });
      await audit(db, user.id, "create", "quotation", qid, { number, lines: rows.length, grandTotal: t.grand });
    }
    revalidateQuote(qid);
    const skipped = all.length - lines.length;
    target = `/quotations/${qid}?ok=${encodeURIComponent(`Quotation saved — ${rows.length} line${rows.length === 1 ? "" : "s"}${skipped ? ` (${skipped} zero-qty lines left out)` : ""}`)}`;
  } catch (e) {
    const back = rawId ? `/quotations/${rawId}/edit` : safeBack(form.get("back"), "/quotations/new");
    target = withMsg(back, "err", errMsg(e));
  }
  redirect(target);
}

// ---------------------------------------------------------------- status transitions
export async function markSent(form: FormData) {
  const user = await requireWrite("quotations");
  const id = idSchema.parse(form.get("id"));
  const back = safeBack(form.get("back"), `/quotations/${id}`);
  let target: string;
  try {
    const { db, q } = await loadQuote(id);
    if (q.status !== "draft") throw new Error("Only a draft quotation can be marked as sent");
    const next = q.nextFollowUpDate && q.nextFollowUpDate >= todayIST() ? q.nextFollowUpDate : addDays(todayIST(), 2);
    await db.update(quotations).set({ status: "sent", sentAt: new Date(), nextFollowUpDate: next }).where(eq(quotations.id, id));
    await audit(db, user.id, "update", "quotation", id, { status: "sent", nextFollowUpDate: next });
    revalidateQuote(id);
    target = withMsg(back, "ok", `Marked as sent — follow-up scheduled for ${next}`);
  } catch (e) {
    target = withMsg(back, "err", errMsg(e));
  }
  redirect(target);
}

export async function markNegotiation(form: FormData) {
  const user = await requireWrite("quotations");
  const id = idSchema.parse(form.get("id"));
  const back = safeBack(form.get("back"), `/quotations/${id}`);
  let target: string;
  try {
    const { db, q } = await loadQuote(id);
    if (q.status !== "sent") throw new Error("Only a sent quotation can move to negotiation");
    await db.update(quotations).set({ status: "negotiation", nextFollowUpDate: q.nextFollowUpDate ?? addDays(todayIST(), 2) }).where(eq(quotations.id, id));
    await audit(db, user.id, "update", "quotation", id, { status: "negotiation" });
    revalidateQuote(id);
    target = withMsg(back, "ok", "Moved to negotiation");
  } catch (e) {
    target = withMsg(back, "err", errMsg(e));
  }
  redirect(target);
}

const lostSchema = z.object({ id: idSchema, reason: z.string().trim().min(3, "Please give the reason the quotation was lost").max(1000) });

export async function markLost(form: FormData) {
  const user = await requireWrite("quotations");
  const id = idSchema.parse(form.get("id"));
  const back = safeBack(form.get("back"), `/quotations/${id}`);
  let target: string;
  try {
    const p = lostSchema.parse({ id: form.get("id"), reason: form.get("reason") });
    const { db, q } = await loadQuote(p.id);
    if (!isEditableStatus(q.status)) throw new Error(`Quotation is already ${q.status}`);
    await db.update(quotations).set({ status: "lost", lostReason: p.reason, closedAt: new Date(), nextFollowUpDate: null }).where(eq(quotations.id, id));
    await audit(db, user.id, "update", "quotation", id, { status: "lost", reason: p.reason });
    revalidateQuote(id);
    target = withMsg(back, "ok", `${q.number} marked as lost`);
  } catch (e) {
    target = withMsg(back, "err", errMsg(e));
  }
  redirect(target);
}

const wonSchema = z.object({
  id: idSchema,
  customerPoNumber: optText(80),
  customerPoDate: optDate,
  expectedDelivery: optDate,
  createProject: z.boolean(),
  projectName: optText(200),
  budget: z.union([z.literal(""), z.coerce.number().min(0, "Budget cannot be negative").max(1e11)]).nullish(),
});

/** Won → sales order (+ optional project) + price_history(kind 'quote'). */
export async function markWon(form: FormData) {
  const user = await requireWrite("quotations");
  const id = idSchema.parse(form.get("id"));
  const back = safeBack(form.get("back"), `/quotations/${id}`);
  let target: string;
  try {
    const p = wonSchema.parse({
      id: form.get("id"), customerPoNumber: form.get("customerPoNumber"), customerPoDate: form.get("customerPoDate"),
      expectedDelivery: form.get("expectedDelivery"),
      createProject: form.get("createProject") === "on", projectName: form.get("projectName"), budget: form.get("budget"),
    });
    const { db, q } = await loadQuote(p.id);
    if (!isEditableStatus(q.status)) throw new Error(`Quotation is already ${q.status}`);
    const lines = (await db.select().from(quotationLines).where(eq(quotationLines.quotationId, id)).orderBy(asc(quotationLines.sortOrder)))
      .filter((l) => l.qty > 0);
    if (!lines.length) throw new Error("Quotation has no lines");
    const [cust] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, q.customerId));
    const today = todayIST();
    const t = computeQuoteTotals(lines, q.discountPct, q.gstPct);
    const factor = 1 - (q.discountPct || 0) / 100;
    const soNumber = await nextNumber(db, "sales_order", today);
    const projectCode = p.createProject ? await nextNumber(db, "project", today) : null;

    const result = await db.transaction(async (tx) => {
      const upd = await tx.update(quotations)
        .set({ status: "won", closedAt: new Date(), nextFollowUpDate: null, sentAt: q.sentAt ?? new Date() })
        .where(and(eq(quotations.id, id), inArray(quotations.status, ["draft", "sent", "negotiation"])))
        .returning({ id: quotations.id });
      if (!upd.length) throw new Error("Quotation was already closed by someone else");
      let projectId: number | null = null;
      if (projectCode) {
        const budget = typeof p.budget === "number" ? p.budget : round2(t.cost + t.erection * factor);
        const [pr] = await tx.insert(projects).values({
          code: projectCode,
          name: (p.projectName || q.projectName || `${cust?.name ?? "Customer"} — ${q.number}`).slice(0, 200),
          customerId: q.customerId, quotationId: id, status: "planning", siteAddress: q.siteLocation,
          contractValue: t.taxable, budget, notes: `Created from quotation ${q.number}`,
        }).returning({ id: projects.id });
        projectId = pr.id;
      }
      // Line rate = supply + erection (net of the quotation discount so the order total equals the quoted value excl. GST).
      const soLines = lines.map((l, i) => ({
        sortOrder: i + 1, itemId: l.itemId,
        description: [l.boqRef, l.description].filter(Boolean).join(" ").slice(0, 4000),
        qty: l.qty, uom: l.uom, rate: round2((l.supplyRate + l.erectionRate) * factor), remarks: l.remarks,
      }));
      const total = round2(soLines.reduce((s, l) => s + l.qty * l.rate, 0));
      const [so] = await tx.insert(salesOrders).values({
        number: soNumber, customerId: q.customerId, customerPoNumber: p.customerPoNumber, customerPoDate: p.customerPoDate,
        quotationId: id, projectId, status: "open", orderDate: today, expectedDelivery: p.expectedDelivery, total,
        notes: `From quotation ${q.number}`, createdBy: user.id,
      }).returning({ id: salesOrders.id });
      await tx.insert(salesOrderLines).values(soLines.map((l) => ({ ...l, orderId: so.id })));
      const ph = lines.filter((l) => l.itemId != null).map((l) => ({
        itemId: l.itemId!, kind: "quote", rate: l.supplyRate, date: today, customerId: q.customerId,
        refType: "quotation", refId: id, qty: l.qty,
      }));
      if (ph.length) await tx.insert(priceHistory).values(ph);
      return { soId: so.id, projectId };
    });
    await audit(db, user.id, "update", "quotation", id, { status: "won", salesOrderId: result.soId, projectId: result.projectId });
    await audit(db, user.id, "create", "sales_order", result.soId, { number: soNumber, fromQuotation: id });
    if (result.projectId) await audit(db, user.id, "create", "project", result.projectId, { code: projectCode, fromQuotation: id });
    revalidateQuote(id);
    revalidatePath("/orders");
    revalidatePath("/projects");
    target = withMsg(`/quotations/${id}`, "ok", `Won! Sales order ${soNumber} created${projectCode ? ` and project ${projectCode}` : ""}`);
  } catch (e) {
    target = withMsg(back, "err", errMsg(e));
  }
  redirect(target);
}

// ---------------------------------------------------------------- copy / revise / delete / prices / email
async function copyQuotation(userId: number, srcId: number, mode: "revise" | "duplicate") {
  const db = await getDb();
  const [q] = await db.select().from(quotations).where(eq(quotations.id, srcId));
  if (!q) throw new Error("Quotation not found");
  const lines = await db.select().from(quotationLines).where(eq(quotationLines.quotationId, srcId)).orderBy(asc(quotationLines.sortOrder));
  const pricing = await getPricingSettings(db);
  const today = todayIST();
  let number: string, revision: number;
  if (mode === "revise") {
    if (q.status === "draft") throw new Error("A draft can be edited directly — no revision needed");
    if (q.status === "won") throw new Error("A won quotation cannot be revised");
    const base = q.number.replace(/-R\d+$/, "");
    const fam = await db.select({ revision: quotations.revision }).from(quotations)
      .where(or(eq(quotations.number, base), like(quotations.number, `${base}-R%`)));
    revision = Math.max(q.revision, ...fam.map((f) => f.revision)) + 1;
    number = revisionNumber(base, revision);
  } else {
    number = await nextNumber(db, "quotation", today);
    revision = 0;
  }
  const newId = await db.transaction(async (tx) => {
    const [n] = await tx.insert(quotations).values({
      number, revision, customerId: q.customerId, projectName: q.projectName, siteLocation: q.siteLocation, system: q.system,
      templateId: q.templateId, status: "draft", quoteDate: today, validUntil: addDays(today, pricing.quoteValidityDays),
      preparedBy: userId, markupPct: q.markupPct, discountPct: q.discountPct, gstPct: q.gstPct,
      subtotalSupply: q.subtotalSupply, subtotalErection: q.subtotalErection, costTotal: q.costTotal, taxAmount: q.taxAmount,
      grandTotal: q.grandTotal, terms: q.terms,
      notes: mode === "revise" ? [q.notes, `Revision of ${q.number}`].filter(Boolean).join("\n") : q.notes,
    }).returning({ id: quotations.id });
    if (lines.length) {
      await tx.insert(quotationLines).values(lines.map((l) => ({
        quotationId: n.id, sortOrder: l.sortOrder, boqRef: l.boqRef, section: l.section, itemId: l.itemId, description: l.description,
        qty: l.qty, uom: l.uom, costRate: l.costRate, supplyRate: l.supplyRate, erectionRate: l.erectionRate, remarks: l.remarks,
      })));
    }
    if (mode === "revise" && (q.status === "sent" || q.status === "negotiation")) {
      // superseded: drop the old revision from the open pipeline / follow-up tracker
      await tx.update(quotations).set({
        status: "expired", nextFollowUpDate: null, closedAt: new Date(),
        notes: [q.notes, `Superseded by revision ${number}`].filter(Boolean).join("\n"),
      }).where(eq(quotations.id, srcId));
    }
    return n.id;
  });
  await audit(db, userId, "create", "quotation", newId, { number, [mode === "revise" ? "revisionOf" : "duplicateOf"]: srcId });
  return { newId, number };
}

export async function reviseQuotation(form: FormData) {
  const user = await requireWrite("quotations");
  const id = idSchema.parse(form.get("id"));
  let target: string;
  try {
    const r = await copyQuotation(user.id, id, "revise");
    revalidateQuote(id);
    target = `/quotations/${r.newId}/edit?ok=${encodeURIComponent(`Revision ${r.number} created as draft`)}`;
  } catch (e) {
    target = withMsg(`/quotations/${id}`, "err", errMsg(e));
  }
  redirect(target);
}

export async function duplicateQuotation(form: FormData) {
  const user = await requireWrite("quotations");
  const id = idSchema.parse(form.get("id"));
  let target: string;
  try {
    const r = await copyQuotation(user.id, id, "duplicate");
    revalidatePath("/quotations");
    target = `/quotations/${r.newId}/edit?ok=${encodeURIComponent(`Copied to new draft ${r.number} — use “Refresh prices” for today's costs`)}`;
  } catch (e) {
    target = withMsg(`/quotations/${id}`, "err", errMsg(e));
  }
  redirect(target);
}

export async function deleteDraft(form: FormData) {
  const user = await requireWrite("quotations");
  const id = idSchema.parse(form.get("id"));
  let target: string;
  try {
    const { db, q } = await loadQuote(id);
    if (q.status !== "draft") throw new Error("Only draft quotations can be deleted");
    await db.transaction(async (tx) => {
      await tx.delete(quotationLines).where(eq(quotationLines.quotationId, id));
      await tx.delete(followUps).where(eq(followUps.quotationId, id));
      await tx.delete(quotations).where(and(eq(quotations.id, id), eq(quotations.status, "draft")));
    });
    await audit(db, user.id, "delete", "quotation", id, { number: q.number });
    revalidatePath("/quotations");
    target = `/quotations?ok=${encodeURIComponent(`Draft ${q.number} deleted`)}`;
  } catch (e) {
    target = withMsg(`/quotations/${id}`, "err", errMsg(e));
  }
  redirect(target);
}

export async function refreshPrices(form: FormData) {
  const user = await requireWrite("quotations");
  const id = idSchema.parse(form.get("id"));
  let target: string;
  try {
    const { db, q } = await loadQuote(id);
    if (q.status !== "draft") throw new Error("Prices can only be refreshed on a draft — use Revise for a sent quotation");
    const changed = await refreshLinePrices(db, id, q.markupPct);
    const t = await recalcQuotation(db, id);
    await audit(db, user.id, "update", "quotation", id, { refreshPrices: changed, grandTotal: t?.grand });
    revalidateQuote(id);
    target = withMsg(`/quotations/${id}`, "ok", changed ? `Prices refreshed on ${changed} line${changed === 1 ? "" : "s"} from the latest costs` : "All prices were already up to date");
  } catch (e) {
    target = withMsg(`/quotations/${id}`, "err", errMsg(e));
  }
  redirect(target);
}

const emailSchema = z.object({
  id: idSchema,
  to: z.string().trim().email("Enter a valid email address").max(200),
  cc: z.union([z.string().trim().email("Invalid CC address").max(200), z.literal("")]).nullish(),
  message: optText(2000),
});

/** Queues an HTML summary to the customer (no attachment). A draft is marked as sent. */
export async function emailQuotation(form: FormData) {
  const user = await requireWrite("quotations");
  const id = idSchema.parse(form.get("id"));
  let target: string;
  try {
    const p = emailSchema.parse({ id: form.get("id"), to: form.get("to"), cc: form.get("cc"), message: form.get("message") });
    const { db, q } = await loadQuote(id);
    const [cust] = await db.select().from(customers).where(eq(customers.id, q.customerId));
    const lines = await db.select().from(quotationLines).where(eq(quotationLines.quotationId, id)).orderBy(asc(quotationLines.sortOrder));
    const company = await getCompanySettings(db);
    const html = quotationEmailHtml({ q, customer: cust, lines, company, message: p.message, senderName: user.name });
    await queueEmail(db, {
      to: p.to, cc: p.cc || undefined, subject: `Quotation ${q.number}${q.projectName ? ` — ${q.projectName}` : ""} | ${company.name}`.slice(0, 250),
      html, entityType: "quotation", entityId: id,
    });
    let extra = "";
    if (q.status === "draft") {
      const next = addDays(todayIST(), 2);
      await db.update(quotations).set({ status: "sent", sentAt: new Date(), nextFollowUpDate: q.nextFollowUpDate ?? next }).where(eq(quotations.id, id));
      extra = " and marked as sent";
    }
    await audit(db, user.id, "email", "quotation", id, { to: p.to });
    revalidateQuote(id);
    revalidatePath("/emails");
    target = withMsg(`/quotations/${id}`, "ok", `Quotation emailed to ${p.to}${extra}`);
  } catch (e) {
    target = withMsg(`/quotations/${id}`, "err", errMsg(e));
  }
  redirect(target);
}
