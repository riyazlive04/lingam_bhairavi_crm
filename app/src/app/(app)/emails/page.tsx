import Link from "next/link";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { Send } from "lucide-react";
import { getDb } from "@/db";
import { emailOutbox } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { smtpConfigured } from "@/lib/email";
import { fmtDateTime } from "@/lib/format";
import { Button, EmptyState, Flash, Input, LinkButton, PageHeader, Select, StatusBadge, Table, Td, Th } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { retryEmails, sendQueuedNow } from "./actions";
import { SmtpBanner } from "./_components/smtp-banner";

export const metadata = { title: "Email outbox" };
const STATUSES = ["queued", "sent", "failed", "logged"] as const;

export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; agent?: string; ok?: string; err?: string }> }) {
  const user = await requireUser("emails");
  const sp = await searchParams;
  const db = await getDb();
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const agent = sp.agent?.trim() || undefined;
  const q = sp.q?.trim();
  const where: SQL[] = [];
  if (status) where.push(eq(emailOutbox.status, status));
  if (agent) where.push(eq(emailOutbox.agent, agent));
  if (q) { const c = or(ilike(emailOutbox.to, `%${q}%`), ilike(emailOutbox.subject, `%${q}%`)); if (c) where.push(c); }

  const [rows, counts, agents] = await Promise.all([
    db.select({ id: emailOutbox.id, to: emailOutbox.to, subject: emailOutbox.subject, status: emailOutbox.status, agent: emailOutbox.agent, createdAt: emailOutbox.createdAt, sentAt: emailOutbox.sentAt, error: emailOutbox.error })
      .from(emailOutbox).where(where.length ? and(...where) : undefined).orderBy(desc(emailOutbox.createdAt), desc(emailOutbox.id)).limit(300),
    db.select({ status: emailOutbox.status, n: sql<number>`count(*)`.mapWith(Number) }).from(emailOutbox).groupBy(emailOutbox.status),
    db.selectDistinct({ agent: emailOutbox.agent }).from(emailOutbox),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const configured = smtpConfigured();
  const write = canWrite(user.role, "emails");
  const filtered = !!(q || status || agent);

  return (
    <>
      <PageHeader
        title="Email outbox"
        subtitle="Every e-mail the CRM generates: reminders, statements and agent notifications"
        actions={write && configured && (
          <>
            {count("failed") > 0 && (
              <form action={retryEmails}><SubmitButton variant="secondary" pendingText="Retrying…">Retry failed ({count("failed")})</SubmitButton></form>
            )}
            <form action={sendQueuedNow}><SubmitButton pendingText="Sending…"><Send className="h-4 w-4" aria-hidden /> Send queued now ({count("queued")})</SubmitButton></form>
          </>
        )}
      />
      <SmtpBanner configured={configured} />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link key={s} href={status === s ? "/emails" : `/emails?status=${s}`} aria-current={status === s ? "true" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${status === s ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800/30 dark:text-brand-200" : "border-line bg-surface text-ink-soft hover:bg-muted"}`}>
            {s} <span className="tabular-nums font-semibold">{count(s)}</span>
          </Link>
        ))}
      </div>

      <form method="get" className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center" role="search" aria-label="Filter e-mails">
        {status && <input type="hidden" name="status" value={status} />}
        <label className="sr-only" htmlFor="e-q">Search</label>
        <Input id="e-q" name="q" defaultValue={q} placeholder="Recipient or subject" className="sm:max-w-xs" />
        <label className="sr-only" htmlFor="e-agent">Agent</label>
        <Select id="e-agent" name="agent" defaultValue={agent ?? ""} className="sm:max-w-56">
          <option value="">All sources</option>
          {agents.filter((a) => a.agent).map((a) => <option key={a.agent!} value={a.agent!}>{a.agent}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Filter</Button>
        {filtered && <LinkButton href="/emails" variant="ghost">Clear</LinkButton>}
      </form>

      {rows.length === 0 ? (
        <EmptyState title={filtered ? "No e-mails match these filters" : "Outbox is empty"}>
          {filtered ? "Try clearing the filters." : "Payment reminders, statements and agent e-mails will appear here."}
        </EmptyState>
      ) : (
        <Table>
          <thead><tr><Th>Created</Th><Th>To</Th><Th>Subject</Th><Th>Source</Th><Th>Status</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/50">
                <Td className="whitespace-nowrap text-ink-soft">{fmtDateTime(r.createdAt)}</Td>
                <Td className="max-w-52 truncate">{r.to}</Td>
                <Td className="max-w-96 truncate"><Link href={`/emails/${r.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.subject}</Link></Td>
                <Td>{r.agent ?? "-"}</Td>
                <Td><StatusBadge status={r.status} />{r.status === "failed" && r.error && <div className="max-w-56 truncate text-xs text-red-600" title={r.error}>{r.error}</div>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {rows.length === 300 && <p className="mt-2 text-xs text-ink-soft">Showing the latest 300 e-mails.</p>}
    </>
  );
}
