import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CheckSquare, Square } from "lucide-react";
import { getDb } from "@/db";
import { meetingNoteRevisions, meetingNotes, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Flash, LinkButton, cx } from "@/components/ui";
import { Callout, DetailPage, MetaChip, SectionCard, StatusPill } from "@/components/patterns";
import { Markdown } from "../../../_components/markdown";
import { readSnapshot } from "../../../_lib/types";

export const metadata = { title: "Meeting note revision" };

export default async function RevisionSnapshotPage({ params, searchParams }: { params: Promise<{ id: string; revId: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireUser("meetings");
  const { id, revId } = await params;
  const sp = await searchParams;
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
    <DetailPage
      back={{ href: `/meeting-notes/${nid}`, label: "Back to current version" }}
      eyebrow="Meeting note snapshot"
      title={s.title}
      status={<StatusPill semantic="warning" label={`Snapshot v${row.r.version}`} />}
      meta={
        <>
          <MetaChip label="Date">{fmtDate(s.meetingDate)}</MetaChip>
          <MetaChip label="Current version">v{row.currentVersion}</MetaChip>
          {s.attendees && <MetaChip label="Attendees">{s.attendees}</MetaChip>}
        </>
      }
      notices={
        <>
          <Flash ok={sp.ok} err={sp.err} />
          <Callout tone="warning" title={`Read-only view of v${row.r.version}`}
            action={<LinkButton href={`/meeting-notes/${nid}`} variant="secondary" size="sm">Open current version</LinkButton>}>
            This is how the note looked before {row.by ?? "someone"} saved v{row.r.version + 1} on {fmtDateTime(row.r.createdAt)}
            {row.r.changeSummary ? <>: “{row.r.changeSummary}”</> : null}.
          </Callout>
        </>
      }
    >
      <SectionCard title="Summary"><Markdown md={s.summary} empty="No summary written." /></SectionCard>
      <SectionCard title="Decisions"><Markdown md={s.decisions} empty="No decisions recorded." /></SectionCard>
      <SectionCard title="Action items" count={s.actionItems.length} empty={s.actionItems.length === 0 && "No action items in this version."}>
        <ul className="space-y-2 text-sm">
          {s.actionItems.map((a, i) => (
            <li key={i} className="flex items-start gap-2">
              {a.done ? <CheckSquare className="icon-sm mt-0.5 text-success" aria-label="Done" /> : <Square className="icon-sm mt-0.5 text-ink-soft" aria-label="Open" />}
              <span className={cx(a.done ? "text-ink-faint line-through" : "text-ink")}>
                {a.text}{a.owner ? ` (${a.owner})` : ""}{a.due ? ` · due ${fmtDate(a.due)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard title="Open questions"><Markdown md={s.openQuestions} empty="No open questions." /></SectionCard>
      <SectionCard title="Transcript or raw notes" empty={!s.transcript && "No transcript saved."}>
        <details className="group">
          <summary className="cursor-pointer select-none rounded-md text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
            <span className="group-open:hidden">Show transcript</span><span className="hidden group-open:inline">Hide transcript</span>
          </summary>
          <div className="mt-3 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface-2 p-4">
            <Markdown md={s.transcript} empty="No transcript saved." />
          </div>
        </details>
      </SectionCard>
    </DetailPage>
  );
}
