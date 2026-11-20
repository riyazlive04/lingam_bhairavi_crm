"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { emailOutbox } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { flushOutbox, smtpConfigured } from "@/lib/email";

const msg = (path: string, key: "ok" | "err", m: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(m)}`;
const NOT_CONFIGURED = "SMTP is not configured — e-mails are only logged (demo mode). Set the SMTP_* environment variables to send.";

/** Send everything currently queued. */
export async function sendQueuedNow() {
  const user = await requireWrite("emails");
  let target: string;
  try {
    if (!smtpConfigured()) throw new Error(NOT_CONFIGURED);
    const db = await getDb();
    const r = await flushOutbox(db, 100);
    await audit(db, user.id, "email", "email_outbox", null, { action: "flush", ...r });
    target = msg("/emails", r.failed ? "err" : "ok", r.sent || r.failed ? `Sent ${r.sent}, failed ${r.failed}` : "Nothing queued to send");
  } catch (e) {
    target = msg("/emails", "err", e instanceof Error && e.message === NOT_CONFIGURED ? NOT_CONFIGURED : "Could not send e-mails. Check SMTP settings.");
    if (!(e instanceof Error && e.message === NOT_CONFIGURED)) console.error(e);
  }
  revalidatePath("/emails");
  redirect(target);
}

/** Re-queue failed (and demo-logged) e-mails and send them. Optional `id` retries just one. */
export async function retryEmails(form: FormData) {
  const user = await requireWrite("emails");
  const id = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().positive().optional()).safeParse(form.get("id"));
  const back = id.success && id.data ? `/emails/${id.data}` : "/emails";
  let target: string;
  try {
    if (!id.success) throw new Error("Invalid e-mail id");
    if (!smtpConfigured()) throw new Error(NOT_CONFIGURED);
    const db = await getDb();
    const statuses = id.data ? ["failed", "logged"] : ["failed"];
    const requeued = await db.update(emailOutbox).set({ status: "queued", error: null })
      .where(and(inArray(emailOutbox.status, statuses), id.data ? eq(emailOutbox.id, id.data) : undefined))
      .returning({ id: emailOutbox.id });
    const r = await flushOutbox(db, 100);
    await audit(db, user.id, "email", "email_outbox", id.data ?? null, { action: "retry", requeued: requeued.length, ...r });
    target = msg(back, r.failed ? "err" : "ok", `Re-queued ${requeued.length}; sent ${r.sent}, failed ${r.failed}`);
  } catch (e) {
    const m = e instanceof Error && (e.message === NOT_CONFIGURED || e.message === "Invalid e-mail id") ? e.message : "Could not retry. Check SMTP settings.";
    if (m.startsWith("Could not")) console.error(e);
    target = msg(back, "err", m);
  }
  revalidatePath("/emails");
  redirect(target);
}
