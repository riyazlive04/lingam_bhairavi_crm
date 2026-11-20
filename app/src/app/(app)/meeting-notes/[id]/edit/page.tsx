import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { meetingNotes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { Card, Field, Flash, Input, LinkButton, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { NoteFields } from "../../_components/note-fields";
import { updateNote } from "../../actions";

export default async function EditMeetingNotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await requireUser("meetings");
  if (!canWrite(user.role, "meetings")) redirect("/forbidden");
  const { id } = await params;
  const sp = await searchParams;
  const nid = Number(id);
  if (!Number.isInteger(nid) || nid <= 0) notFound();
  const db = await getDb();
  const [n] = await db.select().from(meetingNotes).where(eq(meetingNotes.id, nid)).limit(1);
  if (!n) notFound();
  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`Update: ${n.title}`}
        subtitle={`Currently v${n.version}. Saving creates v${n.version + 1}; v${n.version} is kept in the revision history.`}
        back={{ href: `/meeting-notes/${n.id}`, label: "Back to note" }}
      />
      <Flash err={sp.err} />
      <form action={updateNote} className="space-y-6">
        <input type="hidden" name="id" value={n.id} />
        <input type="hidden" name="version" value={n.version} />
        <NoteFields v={{ ...n, actionItems: n.actionItems ?? [] }} />
        <Card title="What changed?">
          <Field label="Change summary" required hint="e.g. “Updated after 2 Dec demo: A-03 closed, new decision D-07 on expense approval.”">
            <Input name="changeSummary" required maxLength={500} />
          </Field>
        </Card>
        <div className="flex flex-wrap gap-2">
          <SubmitButton>Save as v{n.version + 1}</SubmitButton>
          <LinkButton variant="secondary" href={`/meeting-notes/${n.id}`}>Cancel</LinkButton>
        </div>
      </form>
    </div>
  );
}
