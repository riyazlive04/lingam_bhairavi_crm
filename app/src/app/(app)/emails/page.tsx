import Link from "next/link";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { RotateCcw, Send } from "lucide-react";
import { getDb } from "@/db";
import { emailOutbox } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { smtpConfigured } from "@/lib/email";
import { fmtDateTime } from "@/lib/format";
import { Flash, Select } from "@/components/ui";
import { FilterPills, ListEmpty, ListFilters, ListPage, ResponsiveTable, StatusPill, statusLabel, type Column, type FilterPillItem } from "@/components/patterns";
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
  const qs = (patch: { status?: string; q?: string; agent?: string }) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, q, agent, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/emails?${s}` : "/emails";
  };
  const all = counts.reduce((a, c) => a + c.n, 0);
  const pills: FilterPillItem[] = [
    { label: "All", href: qs({ status: undefined }), active: !status, count: all },
    ...STATUSES.map((s) => ({ label: statusLabel(s), href: qs({ status: s }), active: status === s, count: count(s), attention: s === "failed" && count(s) > 0 })),
  ];

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "subject", header: "Subject", card: "title", className: "max-w-96 whitespace-normal",
      cell: (r) => <Link href={`/emails/${r.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{r.subject}</Link> },
    { key: "to", header: "To", card: "subtitle", className: "max-w-52 truncate", cell: (r) => r.to },
    { key: "status", header: "Status", card: "badge",
      cell: (r) => (
        <>
          <StatusPill status={r.status} />
          {r.status === "failed" && r.error && <div className="mt-0.5 max-w-56 truncate text-caption text-danger" title={r.error}>{r.error}</div>}
        </>
      ) },
    { key: "source", header: "Source", priority: 3, cell: (r) => r.agent ?? "-" },
    { key: "created", header: "Created", nowrap: true, className: "text-ink-soft", cell: (r) => fmtDateTime(r.createdAt) },
  ];

  return (
    <ListPage
      title="Email outbox"
      subtitle="Every e-mail the CRM generates: reminders, statements and agent notifications."
      secondaryActions={write && configured && count("failed") > 0 && (
        <form action={retryEmails}><SubmitButton variant="secondary" pendingText="Retrying…"><RotateCcw className="icon-sm" aria-hidden /> Retry failed ({count("failed")})</SubmitButton></form>
      )}
      primaryAction={write && configured && (
        <form action={sendQueuedNow}><SubmitButton pendingText="Sending…"><Send className="icon-sm" aria-hidden /> Send queued now ({count("queued")})</SubmitButton></form>
      )}
      notices={<><SmtpBanner configured={configured} /><Flash ok={sp.ok} err={sp.err} /></>}
      filters={
        <>
          <FilterPills label="Filter by status" items={pills} />
          <ListFilters q={q} placeholder="Recipient or subject" clearHref={qs({ q: undefined, agent: undefined })}
            activeCount={[q, agent].filter(Boolean).length} hidden={{ status }}>
            <Select name="agent" defaultValue={agent ?? ""} aria-label="Source">
              <option value="">All sources</option>
              {agents.filter((a) => a.agent).map((a) => <option key={a.agent!} value={a.agent!}>{a.agent}</option>)}
            </Select>
          </ListFilters>
        </>
      }
      isEmpty={rows.length === 0}
      empty={<ListEmpty filtered={filtered} noun="e-mails" title={filtered ? undefined : "The outbox is empty"} clearHref="/emails">Payment reminders, statements and agent e-mails will appear here.</ListEmpty>}
      resultSummary={rows.length === 300 ? "Showing the latest 300 e-mails" : `${rows.length} e-mail${rows.length === 1 ? "" : "s"}`}
    >
      <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="E-mails" />
    </ListPage>
  );
}
