import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { CheckSquare, Download, FileText, ListChecks, Pencil, Square } from "lucide-react";
import { getDb } from "@/db";
import { meetingNoteRevisions, meetingNotes, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { daysBetween, fmtDate, fmtDateTime, todayIST } from "@/lib/format";
import { Badge, Flash, LinkButton, buttonClass, cx } from "@/components/ui";
import { DetailPage, KeyValueGrid, MetaChip, SectionCard, StatusPill, StatusTimeline, type TimelineItem } from "@/components/patterns";
import { Markdown } from "../_components/markdown";
import { toggleActionItem } from "../actions";

export const metadata = { title: "Meeting note" };

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
  const openCount = items.filter((i) => !i.done).length;
  const today = todayIST();

  const history: TimelineItem[] = [
    ...revisions.map((r) => {
      const current = r.version + 1 === n.version;
      return {
        id: r.id,
        title: <span className="inline-flex flex-wrap items-center gap-2"><Badge tone={current ? "violet" : "gray"}>v{r.version + 1}{current ? " · current" : ""}</Badge> {r.changeSummary || "Updated"}</span>,
        at: fmtDateTime(r.createdAt),
        by: r.by ?? undefined,
        semantic: current ? ("progress" as const) : ("neutral" as const),
        body: (
          <a href={`/meeting-notes/${n.id}/revisions/${r.id}`} className="text-caption font-medium text-brand-700 hover:underline dark:text-brand-300">
            View v{r.version} as it was before this change
          </a>
        ),
      };
    }),
    {
      id: "created",
      title: <span className="inline-flex flex-wrap items-center gap-2"><Badge tone={n.version === 1 ? "violet" : "gray"}>v1{n.version === 1 ? " · current" : ""}</Badge> Created</span>,
      at: fmtDateTime(n.createdAt),
      semantic: n.version === 1 ? "progress" : "neutral",
    },
  ];

  return (
    <DetailPage
      back={{ href: "/meeting-notes", label: "Meeting notes" }}
      eyebrow="Meeting note"
      title={n.title}
      status={<Badge tone="violet">v{n.version}</Badge>}
      meta={
        <>
          <MetaChip label="Date">{fmtDate(n.meetingDate)}</MetaChip>
          <MetaChip label="Open actions">{items.length ? `${openCount} of ${items.length}` : "None"}</MetaChip>
          <MetaChip label="Updated">{fmtDateTime(n.updatedAt)}{row.updatedByName ? ` by ${row.updatedByName}` : ""}</MetaChip>
        </>
      }
      primaryAction={writable && <LinkButton href={`/meeting-notes/${n.id}/edit`}><Pencil className="icon-sm" aria-hidden /> Update notes</LinkButton>}
      secondaryActions={
        <a href={`/meeting-notes/${n.id}/export`} className={buttonClass("secondary")}>
          <Download className="icon-sm" aria-hidden /> Download Markdown
        </a>
      }
      notices={<Flash ok={sp.ok} err={sp.err} />}
      aside={
        <>
          <SectionCard title="Details">
            <KeyValueGrid columns={1} items={[
              { label: "Meeting date", value: fmtDate(n.meetingDate) },
              { label: "Attendees", value: n.attendees },
              { label: "Current version", value: `v${n.version}` },
            ]} />
          </SectionCard>
          <SectionCard title="Revision history" count={n.version}>
            <StatusTimeline items={history} />
          </SectionCard>
        </>
      }
    >
      <SectionCard title="Summary" icon={FileText}><Markdown md={n.summary} empty="No summary written yet." /></SectionCard>
      <SectionCard title="Decisions"><Markdown md={n.decisions} empty="No decisions recorded." /></SectionCard>

      <SectionCard id="actions" title="Action items" icon={ListChecks} count={items.length}
        description={items.length ? `${openCount} open of ${items.length}` : undefined}
        actions={items.length > 0 && <StatusPill semantic={openCount ? "warning" : "success"} label={openCount ? `${openCount} open` : "All done"} />}
        empty={items.length === 0 && (writable ? "No action items yet. Use “Update notes” to add the follow-ups agreed in the meeting." : "No action items yet.")}>
        <ul className="-my-2 divide-y divide-line">
          {items.map((a, i) => {
            const overdue = !a.done && a.due && daysBetween(today, a.due) < 0;
            const body = (
              <span className="min-w-0 flex-1 py-1.5">
                <span className={cx("block text-sm", a.done ? "text-ink-faint line-through" : "text-ink")}>{a.text}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-soft">
                  {a.owner && <span>Owner: {a.owner}</span>}
                  {a.due && (overdue
                    ? <StatusPill status="overdue" label={`Due ${fmtDate(a.due)}, overdue`} />
                    : <span>Due {fmtDate(a.due)}</span>)}
                </span>
              </span>
            );
            return (
              <li key={i} className="py-2">
                {writable ? (
                  <form action={toggleActionItem} className="flex items-start gap-2">
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="index" value={i} />
                    <input type="hidden" name="text" value={a.text} />
                    <input type="hidden" name="done" value={a.done ? "0" : "1"} />
                    <button type="submit" className="grid h-9.5 w-9.5 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-muted hover:text-brand-700" aria-label={a.done ? `Mark “${a.text}” as open` : `Mark “${a.text}” as done`}>
                      {a.done ? <CheckSquare className="icon-lg text-success" aria-hidden /> : <Square className="icon-lg" aria-hidden />}
                    </button>
                    {body}
                  </form>
                ) : (
                  <div className="flex items-start gap-2">
                    <span className="grid h-9.5 w-9.5 shrink-0 place-items-center">
                      {a.done ? <CheckSquare className="icon-lg text-success" aria-label="Done" /> : <Square className="icon-lg text-ink-soft" aria-label="Open" />}
                    </span>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard title="Open questions"><Markdown md={n.openQuestions} empty="No open questions." /></SectionCard>

      <SectionCard title="Full transcript or raw notes" description={n.transcript ? `${Math.ceil(n.transcript.length / 1000)}k characters` : undefined}
        empty={!n.transcript && "No transcript saved."}>
        <details className="group">
          <summary className="cursor-pointer select-none rounded-md text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
            <span className="group-open:hidden">Show transcript</span><span className="hidden group-open:inline">Hide transcript</span>
          </summary>
          <div className="mt-3 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface-2 p-4">
            <Markdown md={n.transcript} empty="No transcript saved." />
          </div>
        </details>
      </SectionCard>
    </DetailPage>
  );
}
