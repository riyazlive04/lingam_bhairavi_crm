import { z } from "zod";

export type ActionItem = { text: string; owner: string; due?: string; done: boolean };

export const ActionItemSchema = z.object({
  text: z.string().trim().min(1).max(500),
  owner: z.string().trim().max(120).default(""),
  due: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  done: z.boolean().default(false),
});

/** Shape stored in meeting_note_revisions.snapshot: the full note as it was before an edit. */
export type NoteSnapshot = {
  title: string;
  meetingDate: string;
  attendees: string | null;
  summary: string | null;
  decisions: string | null;
  actionItems: ActionItem[];
  openQuestions: string | null;
  transcript: string | null;
  version: number;
  updatedBy: number | null;
  updatedAt: string;
};

/** Defensive parse of a snapshot coming from jsonb. */
export function readSnapshot(raw: unknown): NoteSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : null);
  const items = Array.isArray(s.actionItems)
    ? (s.actionItems as unknown[]).flatMap((i) => {
        const r = ActionItemSchema.safeParse(i);
        return r.success ? [r.data] : [];
      })
    : [];
  return {
    title: str("title") ?? "(untitled)",
    meetingDate: str("meetingDate") ?? "",
    attendees: str("attendees"),
    summary: str("summary"),
    decisions: str("decisions"),
    actionItems: items,
    openQuestions: str("openQuestions"),
    transcript: str("transcript"),
    version: Number(s.version) || 0,
    updatedBy: typeof s.updatedBy === "number" ? s.updatedBy : null,
    updatedAt: str("updatedAt") ?? "",
  };
}
