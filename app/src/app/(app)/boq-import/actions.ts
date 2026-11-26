"use server";
/** Consultant BOQ import: analyse an uploaded file, then create a draft quotation (and optionally a BOQ template). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { boqTemplateLines, boqTemplates, customers, items, quotationLines, quotations } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  BOQ_MAX_DESCRIPTION, BOQ_MAX_FILE_BYTES, BOQ_MAX_ITEM_ROWS, cleanText, dominantSystem, fileTypeProblem, matchDescription,
  prepareItem, shortText,
} from "@/lib/boq-import";
import { publicError } from "@/lib/errors";
import { addDays, round2, todayIST } from "@/lib/format";
import { approvalReasons, computeQuoteTotals, costSnapshot, getPricingSettings } from "@/lib/pricing";
import { getCompanySettings } from "@/lib/quotations";
import { canWrite } from "@/lib/rbac";
import { nextNumber } from "@/lib/sequence";
import { loadMatchItems, loadQuoteHistory, makeList } from "./_lib/data";
import type { AnalyseState, CreateState, ReviewSheet } from "./_lib/types";
import { BoqFileError, readBoqFile } from "./_lib/workbook";

const optText = (max: number) => z.string().nullish().transform((v) => shortText(v ?? "", max) ?? "");

// ---------------------------------------------------------------- step 1: upload and analyse
const analyseSchema = z.object({
  customerId: z.coerce.number({ message: "Choose a customer" }).int().positive("Choose a customer"),
  projectName: optText(200),
  siteLocation: optText(200),
});

export async function analyseBoq(_prev: AnalyseState, form: FormData): Promise<AnalyseState> {
  try {
    await requireWrite("quotations");
    const h = analyseSchema.parse({ customerId: form.get("customerId"), projectName: form.get("projectName"), siteLocation: form.get("siteLocation") });
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new BoqFileError("Choose the BOQ file to upload.");
    if (file.size > BOQ_MAX_FILE_BYTES) throw new BoqFileError("The file is larger than 8 MB. Remove pictures or extra sheets and try again.");
    const fileName = (shortText(file.name, 160) ?? "BOQ").replace(/[\\/]/g, "_");
    const typeProblem = fileTypeProblem(fileName);
    if (typeProblem) throw new BoqFileError(typeProblem);

    const db = await getDb();
    const [cust] = await db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.id, h.customerId));
    if (!cust) throw new BoqFileError("That customer was not found. Please choose again.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = await readBoqFile(fileName, bytes);
    const itemRows = parsed.sheets.reduce((n, s) => n + s.rows.filter((r) => r.kind === "item").length, 0);
    if (!itemRows) {
      throw new BoqFileError("We could not find any BOQ rows in this file. Check that it has a header row with Description and Quantity (or Unit) columns.");
    }

    const [catalogue, history] = await Promise.all([loadMatchItems(db), loadQuoteHistory(db)]);
    const prepared = catalogue.map(prepareItem);
    const makes = makeList(catalogue);
    const sheets: ReviewSheet[] = parsed.sheets.map((s) => ({
      name: s.name,
      headerRow: s.headerRow,
      columns: s.columns,
      rows: s.rows.map((r) => ({ ...r, match: r.kind === "item" ? matchDescription(r.description, prepared, { history, makes }) : null })),
    }));
    return {
      status: "ok",
      token: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      data: { fileName, customer: cust, projectName: h.projectName, siteLocation: h.siteLocation, warnings: parsed.warnings, sheets },
    };
  } catch (e) {
    if (e instanceof BoqFileError) return { status: "error", message: e.message };
    return { status: "error", message: publicError(e, "We could not read this file. Please check it and try again.") };
  }
}

// ---------------------------------------------------------------- step 2: create the quotation / template
const num = (max: number) => z.coerce.number().refine(Number.isFinite, "Enter a valid number").min(0, "Numbers cannot be negative").max(max);

const lineSchema = z.object({
  sheet: z.string().max(80).catch(""),
  rowNo: z.coerce.number().int().min(0).max(1_000_000).catch(0),
  section: z.string().nullish().transform((v) => shortText(v ?? "", 120)),
  boqRef: z.string().nullish().transform((v) => shortText(v ?? "", 20)),
  itemId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  description: z.string().max(20000).transform((v) => {
    const t = cleanText(v);
    return t.length > BOQ_MAX_DESCRIPTION ? t.slice(0, BOQ_MAX_DESCRIPTION - 1) + "…" : t;
  }),
  qty: num(1e8),
  uom: z.string().nullish().transform((v) => shortText(v ?? "", 20)),
  supplyRate: num(1e10),
  erectionRate: num(1e10),
  remarks: z.string().nullish().transform((v) => shortText(v ?? "", 1000)),
  include: z.boolean(),
});

const payloadSchema = z.object({
  intent: z.enum(["quote", "template"]),
  customerId: z.coerce.number().int().positive("Choose a customer"),
  projectName: optText(200),
  siteLocation: optText(200),
  fileName: optText(160),
  markupPct: z.coerce.number().min(0, "Markup cannot be negative").max(500, "Markup looks too high"),
  gstPct: z.coerce.number().min(0).max(100),
  saveTemplate: z.boolean(),
  templateName: optText(160),
  rowCount: z.coerce.number().int().min(0).max(BOQ_MAX_ITEM_ROWS).catch(0),
  lines: z.array(lineSchema).max(BOQ_MAX_ITEM_ROWS, `A quotation can have up to ${BOQ_MAX_ITEM_ROWS} lines`),
});

function zodMessage(e: z.ZodError): string {
  const i = e.issues[0];
  if (!i) return "Some values are not valid";
  const line = i.path[0] === "lines" && typeof i.path[1] === "number" ? `Line ${i.path[1] + 1}: ` : "";
  return line + i.message;
}

export async function createFromBoq(_prev: CreateState, form: FormData): Promise<CreateState> {
  let target: string;
  try {
    const user = await requireWrite("quotations");
    let raw: unknown;
    try {
      raw = JSON.parse(String(form.get("payload") ?? ""));
    } catch {
      return { status: "error", message: "The review data could not be read. Please upload the file again." };
    }
    const p = payloadSchema.parse(raw);
    const lines = p.lines.filter((l) => l.description.length > 0);
    const wantTemplate = p.intent === "template" || p.saveTemplate;
    if (wantTemplate && !p.templateName) return { status: "error", message: "Give the BOQ template a name." };
    if (wantTemplate && !canWrite(user.role, "boq")) return { status: "error", message: "You do not have permission to save BOQ templates." };

    const db = await getDb();
    const [cust] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, p.customerId));
    if (!cust) return { status: "error", message: "That customer was not found." };

    // Never trust client prices for cost: re-read every linked item (rule 1 and rule 10 snapshot).
    const ids = [...new Set(lines.map((l) => l.itemId).filter((x): x is number => x != null))];
    const itemRows = ids.length ? await db.select().from(items).where(inArray(items.id, ids)) : [];
    const byId = new Map(itemRows.map((r) => [r.id, r]));
    const missing = lines.find((l) => l.itemId != null && !byId.has(l.itemId));
    if (missing) return { status: "error", message: `The item chosen on ${missing.sheet} row ${missing.rowNo} no longer exists. Pick another item.` };

    // Rule 3: lines with qty 0 are never saved on a quotation.
    const quoteLines = lines.filter((l) => l.include && l.qty > 0);
    // A template keeps every row the user did not untick (zero quantity rows included, defaultQty 0).
    const templateLines = lines.filter((l) => l.include || l.qty === 0);
    if (p.intent === "quote" && !quoteLines.length) {
      return { status: "error", message: "Tick at least one row with a quantity above zero. Rows with zero quantity are not added to a quotation." };
    }
    if (wantTemplate && !templateLines.length) return { status: "error", message: "There are no rows to save in the template." };

    const system = dominantSystem(lines.map((l) => (l.itemId != null ? byId.get(l.itemId)?.system : null)));
    const today = todayIST();

    if (p.intent === "template") {
      const tid = await db.transaction(async (tx) => {
        const [t] = await tx.insert(boqTemplates).values({
          name: p.templateName, system: system ?? "general", description: `Imported from ${p.fileName || "a consultant BOQ"} on ${today}`,
        }).returning({ id: boqTemplates.id });
        await tx.insert(boqTemplateLines).values(templateLines.map((l, i) => ({
          templateId: t.id, sortOrder: i + 1, boqRef: l.boqRef, section: l.section, itemId: l.itemId, description: l.description,
          uom: l.uom || (l.itemId != null ? byId.get(l.itemId)?.uom : null) || "Nos", defaultQty: 0,
        })));
        return t.id;
      });
      await audit(db, user.id, "create", "boq_template", tid, { name: p.templateName, lines: templateLines.length, source: "boq_import", file: p.fileName });
      revalidatePath("/boq-templates");
      target = `/boq-templates/${tid}?ok=${encodeURIComponent(`BOQ template saved with ${templateLines.length} rows`)}`;
    } else {
      const rows = quoteLines.map((l, i) => {
        const it = l.itemId != null ? byId.get(l.itemId) : undefined;
        const snap = it ? costSnapshot(it) : null;
        return {
          sortOrder: i + 1, boqRef: l.boqRef, section: l.section, itemId: it ? it.id : null,
          // keep the consultant's own wording: their customers expect it
          description: l.description,
          qty: l.qty, uom: l.uom || it?.uom || "Nos",
          costRate: snap?.costRate ?? 0, costDate: snap?.costDate ?? null, costVendorId: snap?.costVendorId ?? null, costSource: snap?.costSource ?? null,
          supplyRate: round2(l.supplyRate), erectionRate: round2(l.erectionRate), remarks: l.remarks,
        };
      });
      const totals = computeQuoteTotals(rows, 0, p.gstPct);
      const [pricing, company] = await Promise.all([getPricingSettings(db), getCompanySettings(db)]);
      const needs = approvalReasons(rows, { mode: pricing.approvalMode, minMarginPct: pricing.minMarginPct, discountPct: 0, gstPct: p.gstPct }).length > 0;
      const number = await nextNumber(db, "quotation", today);
      const { qid, tid } = await db.transaction(async (tx) => {
        let templateId: number | null = null;
        if (p.saveTemplate) {
          const [t] = await tx.insert(boqTemplates).values({
            name: p.templateName, system: system ?? "general", description: `Imported from ${p.fileName || "a consultant BOQ"} on ${today}`,
          }).returning({ id: boqTemplates.id });
          templateId = t.id;
          await tx.insert(boqTemplateLines).values(templateLines.map((l, i) => ({
            templateId: t.id, sortOrder: i + 1, boqRef: l.boqRef, section: l.section, itemId: l.itemId, description: l.description,
            uom: l.uom || (l.itemId != null ? byId.get(l.itemId)?.uom : null) || "Nos", defaultQty: 0,
          })));
        }
        const [q] = await tx.insert(quotations).values({
          number, revision: 0, customerId: p.customerId, projectName: p.projectName || null, siteLocation: p.siteLocation || null,
          system, templateId, status: "draft", quoteDate: today, validUntil: addDays(today, pricing.quoteValidityDays), preparedBy: user.id,
          markupPct: p.markupPct, discountPct: 0, gstPct: p.gstPct, terms: company.quoteTerms,
          notes: p.fileName ? `Imported from consultant BOQ: ${p.fileName}` : null,
          subtotalSupply: totals.supply, subtotalErection: totals.erection, costTotal: totals.cost, taxAmount: totals.tax, grandTotal: totals.grand,
        }).returning({ id: quotations.id });
        await tx.insert(quotationLines).values(rows.map((r) => ({ ...r, quotationId: q.id })));
        return { qid: q.id, tid: templateId };
      });
      await audit(db, user.id, "create", "quotation", qid, {
        number, lines: rows.length, grandTotal: totals.grand, source: "boq_import", file: p.fileName,
        matched: rows.filter((r) => r.itemId != null).length, freeText: rows.filter((r) => r.itemId == null).length,
      });
      if (tid) {
        await audit(db, user.id, "create", "boq_template", tid, { name: p.templateName, lines: templateLines.length, source: "boq_import", file: p.fileName });
        revalidatePath("/boq-templates");
      }
      revalidatePath("/quotations");
      revalidatePath("/boq-import");
      const skipped = Math.max(p.rowCount, lines.length) - rows.length;
      let msg = `Quotation ${number} created with ${rows.length} line${rows.length === 1 ? "" : "s"}`;
      if (skipped > 0) msg += `. ${skipped} row${skipped === 1 ? " was" : "s were"} left out (unticked or zero quantity)`;
      if (tid) msg += ". BOQ template saved too";
      if (needs) msg += ". This quotation needs approval before it can be sent";
      target = `/quotations/${qid}?ok=${encodeURIComponent(msg)}`;
    }
  } catch (e) {
    if (e instanceof z.ZodError) return { status: "error", message: zodMessage(e) };
    return { status: "error", message: publicError(e, "The quotation could not be created. Please try again.") };
  }
  redirect(target);
}
