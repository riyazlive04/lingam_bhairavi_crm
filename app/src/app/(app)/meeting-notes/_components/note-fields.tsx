import { Card, Field, Input, Textarea } from "@/components/ui";
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

/** All editable meeting-note fields (shared by new & edit). */
export function NoteFields({ v }: { v: NoteFieldValues }) {
  const md = "Markdown supported: **bold**, - lists, ## headings, | tables |";
  return (
    <div className="space-y-6">
      <Card title="Meeting">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required className="sm:col-span-2">
            <Input name="title" required maxLength={200} defaultValue={v.title} placeholder="e.g. Demo review: Projects & Expenses" />
          </Field>
          <Field label="Meeting date" required>
            <Input type="date" name="meetingDate" required defaultValue={v.meetingDate} />
          </Field>
          <Field label="Attendees">
            <Input name="attendees" maxLength={2000} defaultValue={v.attendees ?? ""} placeholder="Names, comma separated" />
          </Field>
        </div>
      </Card>
      <Card title="Summary">
        <Textarea name="summary" rows={8} maxLength={50000} defaultValue={v.summary ?? ""} aria-label="Summary" className="font-mono text-xs sm:text-sm" />
        <p className="mt-1 text-xs text-ink-soft">{md}</p>
      </Card>
      <Card title="Decisions">
        <Textarea name="decisions" rows={6} maxLength={50000} defaultValue={v.decisions ?? ""} aria-label="Decisions" className="font-mono text-xs sm:text-sm" placeholder="- D-01: …" />
      </Card>
      <Card title="Action items">
        <ActionItemsEditor initial={v.actionItems} />
      </Card>
      <Card title="Open questions">
        <Textarea name="openQuestions" rows={5} maxLength={50000} defaultValue={v.openQuestions ?? ""} aria-label="Open questions" className="font-mono text-xs sm:text-sm" placeholder="- Q-01: …" />
      </Card>
      <Card title="Full transcript / raw notes">
        <Textarea name="transcript" rows={10} maxLength={500000} defaultValue={v.transcript ?? ""} aria-label="Transcript" className="font-mono text-xs" placeholder="Paste the transcript or your raw notes here" />
      </Card>
    </div>
  );
}
