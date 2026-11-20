/**
 * Email: queue into email_outbox, then deliver through Office 365 SMTP (smtp.office365.com:587, STARTTLS)
 * when SMTP_* env vars are set. Otherwise status = "logged" (demo mode — visible on /emails, nothing is sent).
 */
import "server-only";
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { emailOutbox } from "@/db/schema";

export function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function queueEmail(
  db: DB,
  e: { to: string; cc?: string; subject: string; html: string; agent?: string; entityType?: string; entityId?: number },
) {
  const [row] = await db.insert(emailOutbox).values({
    to: e.to, cc: e.cc, subject: e.subject, body: e.html, agent: e.agent, entityType: e.entityType, entityId: e.entityId,
    status: smtpConfigured() ? "queued" : "logged",
  }).returning({ id: emailOutbox.id });
  return row.id;
}

/** Sends queued emails (called by the agent runner and the outbox page). */
export async function flushOutbox(db: DB, limit = 25) {
  if (!smtpConfigured()) return { sent: 0, failed: 0 };
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const queued = await db.select().from(emailOutbox).where(eq(emailOutbox.status, "queued")).limit(limit);
  let sent = 0, failed = 0;
  for (const m of queued) {
    try {
      await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: m.to, cc: m.cc || undefined, subject: m.subject, html: m.body });
      await db.update(emailOutbox).set({ status: "sent", sentAt: new Date(), error: null }).where(eq(emailOutbox.id, m.id));
      sent++;
    } catch (err) {
      await db.update(emailOutbox).set({ status: "failed", error: String((err as Error).message).slice(0, 500) }).where(eq(emailOutbox.id, m.id));
      failed++;
    }
  }
  return { sent, failed };
}
