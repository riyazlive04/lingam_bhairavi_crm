"use server";
import { publicError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { followUps, quotations } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { FOLLOWUP_MODES } from "@/lib/constants";
import { todayIST } from "@/lib/format";
import { FOLLOWUP_OUTCOMES } from "@/lib/quotations";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

const schema = z.object({
  quotationId: z.coerce.number().int().positive(),
  date: dateStr,
  mode: z.enum(FOLLOWUP_MODES, { message: "Choose how you followed up" }),
  outcome: z.union([z.enum(FOLLOWUP_OUTCOMES), z.literal("")]).nullish().transform((v) => (v ? v : null)),
  notes: z.string().trim().max(2000).nullish().transform((v) => (v ? v : null)),
  nextDate: z.union([dateStr, z.literal("")]).nullish().transform((v) => (v ? v : null)),
});

function safeBack(v: FormDataEntryValue | null, fallback: string) {
  const s = typeof v === "string" ? v : "";
  return /^\/[a-z0-9/_\-?=&%.]*$/i.test(s) && !s.startsWith("//") ? s : fallback;
}
function withMsg(path: string, key: "ok" | "err", msg: string) {
  const clean = path.replace(/([?&])(ok|err)=[^&]*/g, "$1").replace(/[?&]+$/, "").replace(/\?&/, "?");
  return `${clean}${clean.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`;
}

/** Inserts a follow_ups row and sets quotations.nextFollowUpDate to the next date (null clears it). */
export async function logFollowUp(form: FormData) {
  const user = await requireWrite("followups");
  const back = safeBack(form.get("back"), "/follow-ups");
  let target: string;
  try {
    const p = schema.parse({
      quotationId: form.get("quotationId"), date: form.get("date") || todayIST(), mode: form.get("mode"),
      outcome: form.get("outcome"), notes: form.get("notes"), nextDate: form.get("nextDate"),
    });
    if (p.date > todayIST()) throw new Error("Follow-up date cannot be in the future");
    if (p.nextDate && p.nextDate < p.date) throw new Error("Next follow-up date must be after the follow-up date");
    if (!p.notes && !p.outcome) throw new Error("Add an outcome or a note about the follow-up");
    const db = await getDb();
    const [q] = await db.select({ id: quotations.id, number: quotations.number, status: quotations.status }).from(quotations).where(eq(quotations.id, p.quotationId));
    if (!q) throw new Error("Quotation not found");
    if (q.status === "draft") throw new Error("Mark the quotation as sent before logging follow-ups");
    const open = q.status === "sent" || q.status === "negotiation";
    const [row] = await db.transaction(async (tx) => {
      const r = await tx.insert(followUps).values({
        quotationId: p.quotationId, date: p.date, mode: p.mode, outcome: p.outcome, notes: p.notes, nextDate: p.nextDate, userId: user.id,
      }).returning({ id: followUps.id });
      if (open) await tx.update(quotations).set({ nextFollowUpDate: p.nextDate }).where(eq(quotations.id, p.quotationId));
      return r;
    });
    await audit(db, user.id, "create", "follow_up", row.id, { quotationId: p.quotationId, mode: p.mode, outcome: p.outcome, nextDate: p.nextDate });
    revalidatePath("/follow-ups");
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${p.quotationId}`);
    target = withMsg(back, "ok", `Follow-up logged for ${q.number}${p.nextDate && open ? `. Next follow-up on ${p.nextDate}` : ""}`);
  } catch (e) {
    const msg = publicError(e, "Could not log follow-up");
    target = withMsg(back, "err", msg);
  }
  redirect(target);
}
