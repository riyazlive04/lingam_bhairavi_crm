import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { CheckSquare, Download, Pencil, Square } from "lucide-react";
import { getDb } from "@/db";
import { meetingNoteRevisions, meetingNotes, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { daysBetween, fmtDate, fmtDateTime, todayIST } from "@/lib/format";
import { Badge, Card, Flash, LinkButton, PageHeader, cx } from "@/components/ui";
import { Markdown } from "../_components/markdown";
import { toggleActionItem } from "../actions";

export default async function MeetingNotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("meetings");
  const { id } = await params;
  const sp = await searchParams;
  const nid = Number(id);
  if (!Number.isInteger(nid) || nid <= 0) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ n: meetingNotes, updatedByName: users.name })
    .from(meetingNotes)
    .leftJoin(users, eq(users.id, meetingNotes.updatedBy))
    .where(eq(meetingNotes.id, nid))
    .limit(1);
  if (!row) notFound();
  const n = row.n;
  const revisions = await db
    .select({ id: meetingNoteRevisions.id, version: meetingNoteRevisions.version, changeSummary: meetingNoteRevisions.changeSummary, createdAt: meetingNoteRevisions.createdAt, by: users.name })
    .from(meetingNoteRevisions)
    .leftJoin(users, eq(users.id, meetingNoteRevisions.updatedBy))
    .where(eq(meetingNoteRevisions.noteId, nid))
    .orderBy(desc(meetingNoteRevisions.version), desc(meetingNoteRevisions.id));
  const writable = canWrite(user.role, "meetings");
  const items = n.actionItems ?? [];
  const today = todayIST();

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={n.title}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2">{fmtDate(n.meetingDate)} <Badge tone="violet">v{n.version}</Badge> <span>updated {fmtDateTime(n.updatedAt)}{row.updatedByName ? ` by ${row.updatedByName}` : ""}</span></span>}
        back={{ href: "/meeting-notes", label: "Meeting notes" }}
        actions={
          <>
            <a href={`/meeting-notes/${n.id}/export`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-muted">
              <Download className="h-4 w-4" aria-hidden /> Markdown
            </a>
            {writable && <LinkButton href={`/meeting-notes/${n.id}/edit`}><Pencil className="h-4 w-4" aria-hidden /> Update notes</LinkButton>}
          </>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />

      {n.attendees && (
        <p className="text-sm text-ink-soft"><span className="font-medium text-ink">Attendees:</span> {n.attendees}</p>
      )}

      <Card title="Summary"><Markdown md={n.summary} /></Card>
      <Card title="Decisions"><Markdown md={n.decisions} empty="No decisions recorded." /></Card>

      <Card title={`Action items (${items.filter((i) => !i.done).length} open of ${items.length})`}>
        <div id="actions" />
        {items.length === 0 ? (
          <p className="text-sm text-ink-faint">No action items.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((a, i) => {
              const overdue = !a.done && a.due && daysBetween(today, a.due) < 0;
              const body = (
                <span className="flex-1">
                  <span className={cx("text-sm", a.done ? "text-ink-faint line-through" : "text-ink")}>{a.text}</span>
                  <span className="mt-0.5 flex flex-wrap gap-2 text-xs text-ink-soft">
                    {a.owner && <span>Owner: {a.owner}</span>}
                    {a.due && <span className={cx(overdue && "font-semibold text-red-600")}>Due {fmtDate(a.due)}{overdue ? " (overdue)" : ""}</span>}
                  </span>
                </span>
              );
              return (
                <li key={i} className="py-2">
                  {writable ? (
                    <form action={toggleActionItem} className="flex items-start gap-3">
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="index" value={i} />
                      <input type="hidden" name="text" value={a.text} />
                      <input type="hidden" name="done" value={a.done ? "0" : "1"} />
                      <button type="submit" className="mt-0.5 rounded text-ink-soft hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600" aria-label={a.done ? `Mark “${a.text}” as open` : `Mark “${a.text}” as done`}>
                        {a.done ? <CheckSquare className="h-5 w-5 text-emerald-600" aria-hidden /> : <Square className="h-5 w-5" aria-hidden />}
                      </button>
                      {body}
                    </form>
                  ) : (
                    <div className="flex items-start gap-3">
                      {a.done ? <CheckSquare className="mt-0.5 h-5 w-5 text-emerald-600" aria-label="Done" /> : <Square className="mt-0.5 h-5 w-5 text-ink-soft" aria-label="Open" />}
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Open questions"><Markdown md={n.openQuestions} empty="No open questions." /></Card>

      <details className="group rounded-xl border border-line bg-surface shadow-sm">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-ink">
          Full transcript / raw notes {n.transcript ? <span className="font-normal text-ink-soft">({Math.ceil(n.transcript.length / 1000)}k chars)</span> : null}
        </summary>
        <div className="max-h-[70vh] overflow-y-auto border-t border-line p-4">
          <Markdown md={n.transcript} empty="No transcript saved." />
        </div>
      </details>

      <Card title={`Revision history (${n.version} version${n.version === 1 ? "" : "s"})`}>
        <ol className="space-y-3">
          {revisions.map((r) => (
            <li key={r.id} className="text-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <Badge tone={r.version + 1 === n.version ? "violet" : "gray"}>v{r.version + 1}{r.version + 1 === n.version ? " · current" : ""}</Badge>
                <span className="text-ink">{r.changeSummary || "Updated"}</span>
                <span className="text-ink-soft">{fmtDateTime(r.createdAt)}{r.by ? ` · ${r.by}` : ""}</span>
              </div>
              <Link href={`/meeting-notes/${n.id}/revisions/${r.id}`} className="text-xs text-brand-700 hover:underline dark:text-brand-300">View snapshot of v{r.version} (before this change)</Link>
            </li>
          ))}
          <li className="flex flex-wrap items-baseline gap-2 text-sm">
            <Badge tone={n.version === 1 ? "violet" : "gray"}>v1{n.version === 1 ? " · current" : ""}</Badge>
            <span className="text-ink-soft">Created {fmtDateTime(n.createdAt)}</span>
          </li>
        </ol>
      </Card>
    </div>
  );
}
