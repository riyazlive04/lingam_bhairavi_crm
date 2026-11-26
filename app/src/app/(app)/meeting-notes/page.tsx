import Link from "next/link";
import { desc, eq, ilike, or } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { meetingNotes, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Badge, Flash, LinkButton } from "@/components/ui";
import { ListEmpty, ListFilters, ListPage, ResponsiveTable, StatusPill, type Column } from "@/components/patterns";

export const metadata = { title: "Meeting notes" };

export default async function MeetingNotesPage({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; err?: string }> }) {
  const user = await requireUser("meetings");
  const sp = await searchParams;
  const db = await getDb();
  const q = sp.q?.trim();
  const rows = await db
    .select({
      id: meetingNotes.id, title: meetingNotes.title, meetingDate: meetingNotes.meetingDate, version: meetingNotes.version,
      updatedAt: meetingNotes.updatedAt, actionItems: meetingNotes.actionItems, attendees: meetingNotes.attendees, updatedByName: users.name,
    })
    .from(meetingNotes)
    .leftJoin(users, eq(users.id, meetingNotes.updatedBy))
    .where(q ? or(ilike(meetingNotes.title, `%${q}%`), ilike(meetingNotes.attendees, `%${q}%`), ilike(meetingNotes.summary, `%${q}%`)) : undefined)
    .orderBy(desc(meetingNotes.meetingDate), desc(meetingNotes.id))
    .limit(300);
  const writable = canWrite(user.role, "meetings");

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      key: "title", header: "Meeting", card: "title", className: "max-w-md whitespace-normal",
      cell: (r) => (
        <>
          <Link href={`/meeting-notes/${r.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{r.title}</Link>
          {r.attendees && <div className="max-w-72 truncate text-caption font-normal text-ink-soft">{r.attendees}</div>}
        </>
      ),
    },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (r) => fmtDate(r.meetingDate) },
    {
      key: "actions", header: "Open actions", card: "badge",
      cell: (r) => {
        const items = r.actionItems ?? [];
        const open = items.filter((i) => !i.done).length;
        if (!items.length) return <span className="text-ink-faint">-</span>;
        return <StatusPill semantic={open ? "warning" : "success"} label={open ? `${open} of ${items.length} open` : "All done"} />;
      },
    },
    { key: "version", header: "Version", cell: (r) => <Badge tone="violet">v{r.version}</Badge> },
    {
      key: "updated", header: "Last updated", priority: 3, nowrap: true, className: "text-ink-soft",
      cell: (r) => <>{fmtDateTime(r.updatedAt)}{r.updatedByName ? ` · ${r.updatedByName}` : ""}</>,
    },
  ];

  return (
    <ListPage
      title="Meeting notes"
      subtitle="Living, versioned notes. Every edit keeps the previous version."
      primaryAction={writable && <LinkButton href="/meeting-notes/new"><Plus className="icon-sm" aria-hidden /> New meeting note</LinkButton>}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      filters={<ListFilters q={sp.q} placeholder="Search title, attendees, summary" clearHref="/meeting-notes" activeCount={q ? 1 : 0} />}
      isEmpty={rows.length === 0}
      empty={
        <ListEmpty filtered={!!q} noun="meeting notes" clearHref="/meeting-notes"
          action={writable && <LinkButton href="/meeting-notes/new"><Plus className="icon-sm" aria-hidden /> Record a meeting</LinkButton>}>
          Paste a transcript or your notes after each client meeting, then update them after the next one.
        </ListEmpty>
      }
      density={false}
      resultSummary={`${rows.length} note${rows.length === 1 ? "" : "s"}${rows.length >= 300 ? " (latest 300)" : ""}`}
    >
      <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="Meeting notes" />
    </ListPage>
  );
}
