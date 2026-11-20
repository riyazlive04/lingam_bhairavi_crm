import Link from "next/link";
import { desc, eq, ilike, or } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { meetingNotes, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Badge, EmptyState, FilterBar, Flash, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";

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

  return (
    <div>
      <PageHeader
        title="Meeting Notes"
        subtitle="Living, versioned notes. Every edit keeps the previous version."
        actions={writable && <LinkButton href="/meeting-notes/new"><Plus className="h-4 w-4" aria-hidden /> New meeting</LinkButton>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      <FilterBar q={sp.q} placeholder="Search title, attendees, summary…" />
      {rows.length === 0 ? (
        <EmptyState title={q ? "No notes match" : "No meeting notes yet"} action={writable && !q ? <LinkButton href="/meeting-notes/new">Record a meeting</LinkButton> : undefined}>
          {q ? "Try a different search." : "Paste a transcript or notes after each client meeting; update them after the next one."}
        </EmptyState>
      ) : (
        <Table>
          <thead><tr><Th>Date</Th><Th>Title</Th><Th>Open actions</Th><Th>Version</Th><Th>Last updated</Th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const items = r.actionItems ?? [];
              const open = items.filter((i) => !i.done).length;
              return (
                <tr key={r.id} className="hover:bg-muted/60">
                  <Td className="whitespace-nowrap">{fmtDate(r.meetingDate)}</Td>
                  <Td>
                    <Link href={`/meeting-notes/${r.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.title}</Link>
                    {r.attendees && <div className="max-w-72 truncate text-xs text-ink-soft">{r.attendees}</div>}
                  </Td>
                  <Td>{items.length ? <Badge tone={open ? "amber" : "green"}>{open} of {items.length} open</Badge> : <span className="text-ink-faint">-</span>}</Td>
                  <Td><Badge tone="violet">v{r.version}</Badge></Td>
                  <Td className="whitespace-nowrap text-ink-soft">{fmtDateTime(r.updatedAt)}{r.updatedByName ? ` · ${r.updatedByName}` : ""}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
