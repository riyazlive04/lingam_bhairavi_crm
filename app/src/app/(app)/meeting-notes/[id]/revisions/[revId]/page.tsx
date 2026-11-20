import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { meetingNoteRevisions, meetingNotes, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Badge, Card, PageHeader, cx } from "@/components/ui";
import { Markdown } from "../../../_components/markdown";
import { readSnapshot } from "../../../_lib/types";

export default async function RevisionSnapshotPage({ params }: { params: Promise<{ id: string; revId: string }> }) {
  await requireUser("meetings");
  const { id, revId } = await params;
  const nid = Number(id), rid = Number(revId);
  if (!Number.isInteger(nid) || nid <= 0 || !Number.isInteger(rid) || rid <= 0) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ r: meetingNoteRevisions, by: users.name, currentVersion: meetingNotes.version })
    .from(meetingNoteRevisions)
    .innerJoin(meetingNotes, eq(meetingNotes.id, meetingNoteRevisions.noteId))
    .leftJoin(users, eq(users.id, meetingNoteRevisions.updatedBy))
    .where(and(eq(meetingNoteRevisions.id, rid), eq(meetingNoteRevisions.noteId, nid)))
    .limit(1);
  if (!row) notFound();
  const s = readSnapshot(row.r.snapshot);
  if (!s) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={s.title}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><Badge tone="amber">Snapshot v{row.r.version}</Badge> {fmtDate(s.meetingDate)} · current version is v{row.currentVersion}</span>}
        back={{ href: `/meeting-notes/${nid}`, label: "Back to current version" }}
      />
      <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Read-only view of v{row.r.version} as it was before {row.by ?? "someone"} saved v{row.r.version + 1} on {fmtDateTime(row.r.createdAt)}
        {row.r.changeSummary ? <>: “{row.r.changeSummary}”</> : null}.
      </div>
      {s.attendees && <p className="text-sm text-ink-soft"><span className="font-medium text-ink">Attendees:</span> {s.attendees}</p>}
      <Card title="Summary"><Markdown md={s.summary} /></Card>
      <Card title="Decisions"><Markdown md={s.decisions} empty="No decisions recorded." /></Card>
      <Card title="Action items">
        {s.actionItems.length ? (
          <ul className="space-y-1 text-sm">
            {s.actionItems.map((a, i) => (
              <li key={i} className={cx(a.done ? "text-ink-faint line-through" : "text-ink")}>
                {a.done ? "☑" : "☐"} {a.text}{a.owner ? ` (${a.owner})` : ""}{a.due ? ` (due ${fmtDate(a.due)})` : ""}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-faint">No action items.</p>}
      </Card>
      <Card title="Open questions"><Markdown md={s.openQuestions} empty="No open questions." /></Card>
      <details className="rounded-xl border border-line bg-surface shadow-sm">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-ink">Transcript / raw notes</summary>
        <div className="max-h-[70vh] overflow-y-auto border-t border-line p-4"><Markdown md={s.transcript} empty="No transcript saved." /></div>
      </details>
    </div>
  );
}
