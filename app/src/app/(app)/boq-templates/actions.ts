"use server";
import { publicError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { boqTemplateLines, boqTemplates, items, quotations } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { SYSTEMS } from "@/lib/constants";

const systemKeys = Object.keys(SYSTEMS) as [keyof typeof SYSTEMS, ...(keyof typeof SYSTEMS)[]];

const optText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

const lineSchema = z.object({
  section: optText(120),
  boqRef: optText(20),
  itemId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  description: z.string().trim().min(1, "Every line needs a description").max(4000),
  uom: z.string().trim().min(1).max(20).default("Nos"),
  defaultQty: z.coerce.number().min(0).max(1e7).default(0),
});

const templateSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(2, "Name is required").max(160),
  system: z.enum(systemKeys),
  description: optText(2000),
  active: z.boolean(),
  lines: z.array(lineSchema).max(1000),
});

function errMsg(e: unknown) {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? "Invalid input";
  return publicError(e, "Something went wrong");
}

export async function saveTemplate(form: FormData) {
  const user = await requireWrite("boq");
  const idRaw = form.get("id");
  let target: string;
  try {
    const parsed = templateSchema.parse({
      id: idRaw ? idRaw : undefined,
      name: form.get("name"),
      system: form.get("system"),
      description: form.get("description"),
      active: form.get("active") === "on" || form.get("active") === "true",
      lines: JSON.parse(String(form.get("lines") ?? "[]")),
    });
    const db = await getDb();
    const itemIds = parsed.lines.map((l) => l.itemId).filter((x): x is number => x != null);
    if (itemIds.length) {
      const found = await db.select({ id: items.id }).from(items).where(inArray(items.id, [...new Set(itemIds)]));
      const ok = new Set(found.map((f) => f.id));
      const missing = itemIds.find((i) => !ok.has(i));
      if (missing) throw new Error("A linked item no longer exists — please re-select it");
    }
    const id = await db.transaction(async (tx) => {
      let tid = parsed.id;
      if (tid) {
        const upd = await tx.update(boqTemplates)
          .set({ name: parsed.name, system: parsed.system, description: parsed.description, active: parsed.active })
          .where(eq(boqTemplates.id, tid)).returning({ id: boqTemplates.id });
        if (!upd.length) throw new Error("Template not found");
        await tx.delete(boqTemplateLines).where(eq(boqTemplateLines.templateId, tid));
      } else {
        const [row] = await tx.insert(boqTemplates)
          .values({ name: parsed.name, system: parsed.system, description: parsed.description, active: parsed.active })
          .returning({ id: boqTemplates.id });
        tid = row.id;
      }
      if (parsed.lines.length) {
        await tx.insert(boqTemplateLines).values(parsed.lines.map((l, i) => ({
          templateId: tid!, sortOrder: i + 1, boqRef: l.boqRef, section: l.section, itemId: l.itemId,
          description: l.description, uom: l.uom, defaultQty: l.defaultQty,
        })));
      }
      return tid!;
    });
    await audit(db, user.id, parsed.id ? "update" : "create", "boq_template", id, { name: parsed.name, lines: parsed.lines.length });
    revalidatePath("/boq-templates");
    target = `/boq-templates/${id}?ok=${encodeURIComponent("Template saved")}`;
  } catch (e) {
    const back = idRaw ? `/boq-templates/${idRaw}/edit` : "/boq-templates/new";
    target = `${back}?err=${encodeURIComponent(errMsg(e))}`;
  }
  redirect(target);
}

export async function duplicateTemplate(form: FormData) {
  const user = await requireWrite("boq");
  const id = z.coerce.number().int().positive().parse(form.get("id"));
  const db = await getDb();
  let target: string;
  try {
    const [t] = await db.select().from(boqTemplates).where(eq(boqTemplates.id, id));
    if (!t) throw new Error("Template not found");
    const lines = await db.select().from(boqTemplateLines).where(eq(boqTemplateLines.templateId, id)).orderBy(asc(boqTemplateLines.sortOrder));
    const newId = await db.transaction(async (tx) => {
      const [row] = await tx.insert(boqTemplates).values({
        name: `${t.name} (copy)`.slice(0, 160), system: t.system, description: t.description, active: true,
      }).returning({ id: boqTemplates.id });
      if (lines.length) {
        await tx.insert(boqTemplateLines).values(lines.map((l, i) => ({
          templateId: row.id, sortOrder: i + 1, boqRef: l.boqRef, section: l.section, itemId: l.itemId,
          description: l.description, uom: l.uom, defaultQty: l.defaultQty,
        })));
      }
      return row.id;
    });
    await audit(db, user.id, "create", "boq_template", newId, { duplicatedFrom: id });
    revalidatePath("/boq-templates");
    target = `/boq-templates/${newId}/edit?ok=${encodeURIComponent("Template duplicated — rename and adjust it")}`;
  } catch (e) {
    target = `/boq-templates/${id}?err=${encodeURIComponent(errMsg(e))}`;
  }
  redirect(target);
}

/** Deletes a template; if quotations reference it, it is deactivated instead (history is preserved). */
export async function deleteTemplate(form: FormData) {
  const user = await requireWrite("boq");
  const id = z.coerce.number().int().positive().parse(form.get("id"));
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(quotations).where(eq(quotations.templateId, id));
  let msg: string;
  if (Number(n) > 0) {
    await db.update(boqTemplates).set({ active: false }).where(eq(boqTemplates.id, id));
    await audit(db, user.id, "update", "boq_template", id, { active: false, reason: "delete requested; used by quotations" });
    msg = "Template is used by quotations, so it was deactivated instead of deleted";
  } else {
    await db.transaction(async (tx) => {
      await tx.delete(boqTemplateLines).where(eq(boqTemplateLines.templateId, id));
      await tx.delete(boqTemplates).where(eq(boqTemplates.id, id));
    });
    await audit(db, user.id, "delete", "boq_template", id);
    msg = "Template deleted";
  }
  revalidatePath("/boq-templates");
  redirect(`/boq-templates?ok=${encodeURIComponent(msg)}`);
}

export async function toggleTemplateActive(form: FormData) {
  const user = await requireWrite("boq");
  const id = z.coerce.number().int().positive().parse(form.get("id"));
  const db = await getDb();
  const [t] = await db.select({ active: boqTemplates.active }).from(boqTemplates).where(eq(boqTemplates.id, id));
  if (!t) redirect(`/boq-templates?err=${encodeURIComponent("Template not found")}`);
  await db.update(boqTemplates).set({ active: !t.active }).where(eq(boqTemplates.id, id));
  await audit(db, user.id, "update", "boq_template", id, { active: !t.active });
  revalidatePath("/boq-templates");
  redirect(`/boq-templates/${id}?ok=${encodeURIComponent(t.active ? "Template deactivated" : "Template activated")}`);
}
