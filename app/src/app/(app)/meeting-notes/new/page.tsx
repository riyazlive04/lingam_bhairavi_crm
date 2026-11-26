import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { meetingNotes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { fmtDate, todayIST } from "@/lib/format";
import { Flash } from "@/components/ui";
import { FormFooter, FormPage, FormSection } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { NoteFields } from "../_components/note-fields";
import { createNote } from "../actions";

export const metadata = { title: "New meeting note" };

export default async function NewMeetingNotePage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const user = await requireUser("meetings");
  if (!canWrite(user.role, "meetings")) redirect("/forbidden");
  const sp = await searchParams;
  const db = await getDb();
  const [prev] = await db
    .select({ title: meetingNotes.title, meetingDate: meetingNotes.meetingDate, actionItems: meetingNotes.actionItems })
    .from(meetingNotes)
    .orderBy(desc(meetingNotes.meetingDate), desc(meetingNotes.id))
    .limit(1);
  const openPrev = (prev?.actionItems ?? []).filter((i) => !i.done);

  return (
    <FormPage title="New meeting note" back={{ href: "/meeting-notes", label: "Meeting notes" }} notices={<Flash err={sp.err} />}>
      <form action={createNote} className="space-y-4">
        <NoteFields v={{ title: "", meetingDate: todayIST(), attendees: "", summary: "", decisions: "", openQuestions: "", transcript: "", actionItems: [] }} />
        {prev && (
          <FormSection title="Carry forward" columns={1}>
            <label className="flex items-start gap-3">
              <input type="checkbox" name="carryForward" defaultChecked={openPrev.length > 0} disabled={!openPrev.length} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
              <span className="text-sm text-ink">
                <span className="font-medium">Carry forward open action items</span>
                <span className="block text-ink-soft">
                  {openPrev.length
                    ? `${openPrev.length} unfinished item${openPrev.length === 1 ? "" : "s"} from “${prev.title}” (${fmtDate(prev.meetingDate)}) will be copied into this note.`
                    : `No open items in the latest note “${prev.title}”.`}
                </span>
              </span>
            </label>
          </FormSection>
        )}
        <FormFooter cancelHref="/meeting-notes">
          <SubmitButton pendingText="Saving…">Save meeting note</SubmitButton>
        </FormFooter>
      </form>
    </FormPage>
  );
}
