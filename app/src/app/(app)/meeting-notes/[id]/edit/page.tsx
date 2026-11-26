import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { meetingNotes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { Field, Flash, Input } from "@/components/ui";
import { FormFooter, FormPage, FormSection } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { NoteFields } from "../../_components/note-fields";
import { updateNote } from "../../actions";

export const metadata = { title: "Update meeting note" };

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
    <FormPage
      eyebrow={`Update meeting note · now v${n.version}`}
      title={n.title}
      subtitle={`Saving creates v${n.version + 1}. Version ${n.version} stays in the revision history.`}
      back={{ href: `/meeting-notes/${n.id}`, label: "Back to note" }}
      notices={<Flash err={sp.err} />}
    >
      <form action={updateNote} className="space-y-4">
        <input type="hidden" name="id" value={n.id} />
        <input type="hidden" name="version" value={n.version} />
        <NoteFields v={{ ...n, actionItems: n.actionItems ?? [] }} />
        <FormSection title="What changed?" columns={1}>
          <Field label="Change summary" required hint="For example: “Updated after the 2 Dec demo. A-03 closed, new decision D-07 on expense approval.”">
            <Input name="changeSummary" required maxLength={500} />
          </Field>
        </FormSection>
        <FormFooter cancelHref={`/meeting-notes/${n.id}`}>
          <SubmitButton pendingText="Saving…">Save as v{n.version + 1}</SubmitButton>
        </FormFooter>
      </form>
    </FormPage>
  );
}
