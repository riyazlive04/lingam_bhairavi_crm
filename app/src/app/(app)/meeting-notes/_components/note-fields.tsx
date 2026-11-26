import { Field, Input, Textarea } from "@/components/ui";
import { FormSection } from "@/components/patterns";
import { ActionItemsEditor } from "./action-items-editor";
import type { ActionItem } from "../_lib/types";

export type NoteFieldValues = {
  title: string;
  meetingDate: string;
  attendees: string | null;
  summary: string | null;
  decisions: string | null;
  openQuestions: string | null;
  transcript: string | null;
  actionItems: ActionItem[];
};

const md = "Markdown works here: **bold**, - lists, ## headings, | tables |";
const mono = "font-mono text-xs sm:text-sm";

/** All editable meeting note fields (shared by new and edit). */
export function NoteFields({ v }: { v: NoteFieldValues }) {
  return (
    <>
      <FormSection title="Meeting" description="What the meeting was and who was there.">
        <Field label="Title" required className="sm:col-span-2">
          <Input name="title" required maxLength={200} defaultValue={v.title} placeholder="For example: Demo review of projects and expenses" />
        </Field>
        <Field label="Meeting date" required>
          <Input type="date" name="meetingDate" required defaultValue={v.meetingDate} />
        </Field>
        <Field label="Attendees">
          <Input name="attendees" maxLength={2000} defaultValue={v.attendees ?? ""} placeholder="Names, separated by commas" />
        </Field>
      </FormSection>

      <FormSection title="Notes" description={md} columns={1}>
        <Field label="Summary">
          <Textarea name="summary" rows={8} maxLength={50000} defaultValue={v.summary ?? ""} className={mono} />
        </Field>
        <Field label="Decisions">
          <Textarea name="decisions" rows={6} maxLength={50000} defaultValue={v.decisions ?? ""} className={mono} placeholder="- D-01: …" />
        </Field>
        <Field label="Open questions">
          <Textarea name="openQuestions" rows={5} maxLength={50000} defaultValue={v.openQuestions ?? ""} className={mono} placeholder="- Q-01: …" />
        </Field>
      </FormSection>

      <FormSection title="Action items" description="Tick an item when it is done. Rows without text are ignored." columns={1}>
        <ActionItemsEditor initial={v.actionItems} />
      </FormSection>

      <FormSection title="Full transcript or raw notes" description="Kept with the note for reference." columns={1}>
        <Field label="Transcript">
          <Textarea name="transcript" rows={10} maxLength={500000} defaultValue={v.transcript ?? ""} className="font-mono text-xs" placeholder="Paste the transcript or your raw notes here" />
        </Field>
      </FormSection>
    </>
  );
}
