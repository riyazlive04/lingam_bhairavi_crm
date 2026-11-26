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
import {
  approvalAfterChange, approvalBlocks, approvalReasons, computeQuoteTotals, costSnapshot, getPricingSettings, parseApprovalStatus,
  suggestRates, type ApprovalStatus, type CostSource, type PricingSettings,
} from "@/lib/pricing";
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
  revalidatePath("/");
}

// ---------------------------------------------------------------- approval helpers (rule 11)
type PricedLine = { itemId: number | null; qty: number; supplyRate: number; erectionRate: number; costRate: number };

/** Why this quote needs approval right now (empty = it does not), from its saved lines and the current settings. */
async function approvalReasonsFor(db: Awaited<ReturnType<typeof getDb>>, q: typeof quotations.$inferSelect, pricing?: PricingSettings) {
  const p = pricing ?? await getPricingSettings(db);
  const lines = await db.select().from(quotationLines).where(eq(quotationLines.quotationId, q.id));
  return approvalReasons(lines, { mode: p.approvalMode, minMarginPct: p.minMarginPct, discountPct: q.discountPct, gstPct: q.gstPct });
}

/** Throws a friendly error when sending / emailing / winning is blocked by rule 11. Checked on the server, never only in the UI. */
async function assertApprovedToSend(db: Awaited<ReturnType<typeof getDb>>, q: typeof quotations.$inferSelect, what: string) {
  // closed quotes (won / lost / expired) are history: re-emailing a copy is not "sending for approval"
  if (!isEditableStatus(q.status)) return;
  const reasons = await approvalReasonsFor(db, q);
  if (!approvalBlocks(reasons.length > 0, q.approvalStatus)) return;
  const st = parseApprovalStatus(q.approvalStatus);
  const why = reasons[0] ? ` (${reasons[0].charAt(0).toLowerCase()}${reasons[0].slice(1)})` : "";
  if (st === "pending") throw new Error(`This quotation is waiting for an admin's approval${why}. You can ${what} once it is approved`);
  if (st === "rejected") throw new Error(`This quotation was not approved. Update the prices and request approval again before you ${what}`);
  throw new Error(`This quotation needs an admin's approval before you ${what}${why}. Use “Request approval” first`);
}

/** Stable fingerprint of what an approver looked at: priced lines + discount + GST. */
function priceFingerprint(lines: readonly PricedLine[], discountPct: number, gstPct: number) {
  const ls = lines.filter((l) => l.qty > 0).map((l) => [l.itemId ?? 0, l.qty, l.supplyRate, l.erectionRate, l.costRate].join("|")).sort();
  return JSON.stringify([ls, Number(discountPct) || 0, Number(gstPct) || 0]);
}

/** Approval columns for a status change caused by an edit / price refresh. */
function approvalPatch(next: ApprovalStatus, prev: string, userId: number) {
  if (next === prev) return {};
  if (next === "pending") {
    return { approvalStatus: next, approvalRequestedAt: new Date(), approvalRequestedBy: userId, approvedBy: null, approvedAt: null, approvalNote: "Prices changed after approval, needs a fresh approval" };
  }
  if (next === "not_required") return { approvalStatus: next, approvedBy: null, approvedAt: null };
  return { approvalStatus: next };
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
  /** "Use latest price" was clicked: take a fresh cost snapshot (rule 10) instead of keeping the saved one */
  repriced: z.boolean().nullish(),
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
    if (!lines.length) throw new Error("Enter a quantity for at least one line. Lines with zero quantity are not saved");
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
      if (!isEditableStatus(existing.status)) throw new Error(`A ${existing.status} quotation can't be edited. Use Revise instead`);
      const pl = await db.select().from(quotationLines).where(eq(quotationLines.quotationId, id));
      for (const l of pl) prevLines.set(l.id, l);
    }

    // Cost snapshot is always computed server-side (never trusted from the client for item-linked lines).
    const priceMap = await itemPricing(db, lines.map((l) => l.itemId).filter((x): x is number => x != null));
    const showCost = canSeeCost(user.role);
    const today = todayIST();
    const rows = lines.map((l, i) => {
      const prev = l.lineId ? prevLines.get(l.lineId) : undefined;
      let costRate = 0, costDate: string | null = null, costVendorId: number | null = null, costSource: CostSource = "manual";
      if (l.itemId != null) {
        const it = priceMap.get(l.itemId);
        if (!it) throw new Error(`Item on line ${i + 1} no longer exists`);
        if (prev && prev.itemId === l.itemId && !l.repriced) {
          // keep the snapshot the line was priced with (rule 10)
          costRate = prev.costRate;
          costDate = prev.costDate;
          costVendorId = prev.costVendorId;
          costSource = prev.costSource === "purchase" || prev.costSource === "list" ? prev.costSource : costSnapshot(it).costSource;
        } else {
          const snap = costSnapshot(it);
          costRate = suggestRates(it, h.markupPct).costRate;
          costDate = snap.costDate;
          costVendorId = snap.costVendorId;
          costSource = snap.costSource;
        }
      } else {
        costRate = showCost && l.costRate != null ? round2(l.costRate) : prev?.costRate ?? 0;
        // typed by hand: date it when the figure was entered or changed
        costDate = prev && prev.itemId == null && prev.costRate === costRate && prev.costDate ? prev.costDate : today;
      }
      return {
        sortOrder: i + 1, boqRef: l.boqRef, section: l.section, itemId: l.itemId, description: l.description, qty: l.qty,
        uom: l.uom, costRate, costDate, costVendorId, costSource, supplyRate: round2(l.supplyRate), erectionRate: round2(l.erectionRate), remarks: l.remarks,
      };
    });
    const t = computeQuoteTotals(rows, h.discountPct, h.gstPct);
    const pricing = await getPricingSettings(db);
    const needs = approvalReasons(rows, { mode: pricing.approvalMode, minMarginPct: pricing.minMarginPct, discountPct: h.discountPct, gstPct: h.gstPct }).length > 0;
    const header = {
      customerId: h.customerId, projectName: h.projectName, siteLocation: h.siteLocation, system: h.system || null,
      templateId: typeof h.templateId === "number" ? h.templateId : null, quoteDate: h.quoteDate, validUntil: h.validUntil,
      markupPct: h.markupPct, discountPct: h.discountPct, gstPct: h.gstPct, terms: h.terms, notes: h.notes,
      subtotalSupply: t.supply, subtotalErection: t.erection, costTotal: t.cost, taxAmount: t.tax, grandTotal: t.grand,
    };

    let qid: number;
    let approvalNote = "";
    if (id && existing) {
      const ex = existing;
      // Rule 11: editing what was approved sends it back for approval (or clears it when no longer needed).
      const changed = priceFingerprint([...prevLines.values()], ex.discountPct, ex.gstPct) !== priceFingerprint(rows, h.discountPct, h.gstPct);
      const prevStatus = parseApprovalStatus(ex.approvalStatus);
      const nextStatus: ApprovalStatus = changed ? approvalAfterChange(prevStatus, needs) : (!needs && prevStatus === "pending" ? "not_required" : prevStatus);
      const patch = approvalPatch(nextStatus, prevStatus, user.id);
      await db.transaction(async (tx) => {
        await tx.update(quotations).set({ ...header, ...patch }).where(eq(quotations.id, id));
        await tx.delete(quotationLines).where(eq(quotationLines.quotationId, id));
        await tx.insert(quotationLines).values(rows.map((r) => ({ ...r, quotationId: id })));
      });
      qid = id;
      await audit(db, user.id, "update", "quotation", qid, { lines: rows.length, grandTotal: t.grand });
      if (nextStatus !== prevStatus) {
        await audit(db, user.id, "update", "quotation", qid, { approval: nextStatus, from: prevStatus, reason: "edited" });
        approvalNote = nextStatus === "pending" ? ". Prices changed after approval, so it is back with the admin for approval" : "";
      }
      if (needs && (nextStatus === "not_required" || nextStatus === "rejected")) approvalNote = ". This quotation needs approval before it can be sent";
    } else {
      const number = await nextNumber(db, "quotation", h.quoteDate);
      qid = await db.transaction(async (tx) => {
        const [q] = await tx.insert(quotations).values({ ...header, number, revision: 0, status: "draft", preparedBy: user.id }).returning({ id: quotations.id });
        await tx.insert(quotationLines).values(rows.map((r) => ({ ...r, quotationId: q.id })));
        return q.id;
      });
      await audit(db, user.id, "create", "quotation", qid, { number, lines: rows.length, grandTotal: t.grand });
    }
    if (!id && needs) approvalNote = ". This quotation needs approval before it can be sent";
    revalidateQuote(qid);
    const skipped = all.length - lines.length;
    target = `/quotations/${qid}?ok=${encodeURIComponent(`Quotation saved with ${rows.length} line${rows.length === 1 ? "" : "s"}${skipped ? ` (${skipped} zero-qty lines left out)` : ""}${approvalNote}`)}`;
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
    await assertApprovedToSend(db, q, "mark it as sent");
    const next = q.nextFollowUpDate && q.nextFollowUpDate >= todayIST() ? q.nextFollowUpDate : addDays(todayIST(), 2);
    await db.update(quotations).set({ status: "sent", sentAt: new Date(), nextFollowUpDate: next }).where(eq(quotations.id, id));
    await audit(db, user.id, "update", "quotation", id, { status: "sent", nextFollowUpDate: next });
    revalidateQuote(id);
    target = withMsg(back, "ok", `Marked as sent. Follow-up scheduled for ${next}`);
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
    await assertApprovedToSend(db, q, "mark it as won");
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
          name: (p.projectName || q.projectName || `${cust?.name ?? "Customer"}, ${q.number}`).slice(0, 200),
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
    if (q.status === "draft") throw new Error("A draft can be edited directly, no revision needed");
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
        qty: l.qty, uom: l.uom, costRate: l.costRate, costDate: l.costDate, costVendorId: l.costVendorId, costSource: l.costSource,
        supplyRate: l.supplyRate, erectionRate: l.erectionRate, remarks: l.remarks,
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
    target = `/quotations/${r.newId}/edit?ok=${encodeURIComponent(`Copied to new draft ${r.number}. Use “Refresh prices” for today's costs`)}`;
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
    if (q.status !== "draft") throw new Error("Prices can only be refreshed on a draft. Use Revise for a sent quotation");
    const changed = await refreshLinePrices(db, id, q.markupPct);
    const t = await recalcQuotation(db, id);
    await audit(db, user.id, "update", "quotation", id, { refreshPrices: changed, grandTotal: t?.grand });
    let extra = "";
    if (changed) {
      const needs = (await approvalReasonsFor(db, q)).length > 0;
      const prev = parseApprovalStatus(q.approvalStatus);
      const next = approvalAfterChange(prev, needs);
      if (next !== prev) {
        await db.update(quotations).set(approvalPatch(next, prev, user.id)).where(eq(quotations.id, id));
        await audit(db, user.id, "update", "quotation", id, { approval: next, from: prev, reason: "prices refreshed" });
        if (next === "pending") extra = ". It is back with the admin for approval";
      }
    }
    revalidateQuote(id);
    target = withMsg(`/quotations/${id}`, "ok", changed ? `Prices and price dates refreshed on ${changed} line${changed === 1 ? "" : "s"} from the latest costs${extra}` : "All prices were already up to date");
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
    await assertApprovedToSend(db, q, "email it");
    const [cust] = await db.select().from(customers).where(eq(customers.id, q.customerId));
    const lines = await db.select().from(quotationLines).where(eq(quotationLines.quotationId, id)).orderBy(asc(quotationLines.sortOrder));
    const company = await getCompanySettings(db);
    const html = quotationEmailHtml({ q, customer: cust, lines, company, message: p.message, senderName: user.name });
    await queueEmail(db, {
      to: p.to, cc: p.cc || undefined, subject: `Quotation ${q.number}${q.projectName ? `: ${q.projectName}` : ""} | ${company.name}`.slice(0, 250),
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

// ---------------------------------------------------------------- approval actions (rule 11)
const requestSchema = z.object({ id: idSchema, note: optText(1000) });

/** Sales asks an admin to approve a quotation that needs approval (not_required / rejected → pending). */
export async function requestApproval(form: FormData) {
  const user = await requireWrite("quotations");
  const id = idSchema.parse(form.get("id"));
  let target: string;
  try {
    const p = requestSchema.parse({ id: form.get("id"), note: form.get("note") });
    const { db, q } = await loadQuote(p.id);
    if (!isEditableStatus(q.status)) throw new Error(`A ${q.status} quotation doesn't need approval`);
    const reasons = await approvalReasonsFor(db, q);
    if (!reasons.length) throw new Error("This quotation doesn't need approval under the current pricing settings");
    const prev = parseApprovalStatus(q.approvalStatus);
    if (prev === "pending") throw new Error("Approval has already been requested");
    if (prev === "approved") throw new Error("This quotation is already approved");
    const upd = await db.update(quotations).set({
      approvalStatus: "pending", approvalRequestedAt: new Date(), approvalRequestedBy: user.id, approvedBy: null, approvedAt: null, approvalNote: p.note,
    }).where(and(eq(quotations.id, id), eq(quotations.approvalStatus, prev))).returning({ id: quotations.id });
    if (!upd.length) throw new Error("Someone else just changed this quotation's approval. Please reload and try again");
    await audit(db, user.id, "update", "quotation", id, { approval: "pending", from: prev, note: p.note, reasons });
    revalidateQuote(id);
    target = withMsg(`/quotations/${id}`, "ok", "Approval requested. An admin will review the prices");
  } catch (e) {
    target = withMsg(`/quotations/${id}`, "err", errMsg(e));
  }
  redirect(target);
}

const decideSchema = z.object({ id: idSchema, note: optText(1000) });
const rejectSchema = z.object({ id: idSchema, note: z.string().trim().min(3, "Please say why the quotation is not approved, so sales knows what to change").max(1000) });

async function requireApprover() {
  const user = await requireWrite("quotations");
  if (user.role !== "admin") throw new Error("Only an admin can approve or reject quotations");
  return user;
}

/** Admin approves (pending → approved). An admin may also approve directly without a request. */
export async function approveQuotation(form: FormData) {
  const user = await requireApprover();
  const id = idSchema.parse(form.get("id"));
  let target: string;
  try {
    const p = decideSchema.parse({ id: form.get("id"), note: form.get("note") });
    const { db, q } = await loadQuote(p.id);
    if (!isEditableStatus(q.status)) throw new Error(`A ${q.status} quotation can't be approved`);
    const prev = parseApprovalStatus(q.approvalStatus);
    if (prev === "approved") throw new Error("This quotation is already approved");
    const reasons = await approvalReasonsFor(db, q);
    if (prev === "not_required" && !reasons.length) throw new Error("This quotation doesn't need approval");
    const upd = await db.update(quotations).set({
      approvalStatus: "approved", approvedBy: user.id, approvedAt: new Date(),
      approvalNote: p.note ?? q.approvalNote,
      ...(q.approvalRequestedAt ? {} : { approvalRequestedAt: new Date(), approvalRequestedBy: user.id }),
    }).where(and(eq(quotations.id, id), eq(quotations.approvalStatus, prev))).returning({ id: quotations.id });
    if (!upd.length) throw new Error("Someone else just changed this quotation's approval. Please reload and try again");
    await audit(db, user.id, "update", "quotation", id, { approval: "approved", from: prev, note: p.note });
    revalidateQuote(id);
    target = withMsg(`/quotations/${id}`, "ok", "Approved. The quotation can now be sent");
  } catch (e) {
    target = withMsg(`/quotations/${id}`, "err", errMsg(e));
  }
  redirect(target);
}

/** Admin rejects a pending request with a note (pending → rejected). */
export async function rejectQuotation(form: FormData) {
  const user = await requireApprover();
  const id = idSchema.parse(form.get("id"));
  let target: string;
  try {
    const p = rejectSchema.parse({ id: form.get("id"), note: form.get("note") });
    const { db, q } = await loadQuote(p.id);
    if (!isEditableStatus(q.status)) throw new Error(`A ${q.status} quotation can't be rejected`);
    const prev = parseApprovalStatus(q.approvalStatus);
    if (prev !== "pending") throw new Error("Only a quotation waiting for approval can be rejected");
    const upd = await db.update(quotations).set({ approvalStatus: "rejected", approvedBy: user.id, approvedAt: new Date(), approvalNote: p.note })
      .where(and(eq(quotations.id, id), eq(quotations.approvalStatus, "pending"))).returning({ id: quotations.id });
    if (!upd.length) throw new Error("Someone else just changed this quotation's approval. Please reload and try again");
    await audit(db, user.id, "update", "quotation", id, { approval: "rejected", from: prev, note: p.note });
    revalidateQuote(id);
    target = withMsg(`/quotations/${id}`, "ok", "Marked as not approved. Sales can see your note");
  } catch (e) {
    target = withMsg(`/quotations/${id}`, "err", errMsg(e));
  }
  redirect(target);
}
