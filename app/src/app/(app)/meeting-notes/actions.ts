"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { meetingNoteRevisions, meetingNotes } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { UserError, errMsg, flashUrl, zDate, zId, zOptText, zText } from "../projects/_lib/forms";
import { ActionItemSchema, type ActionItem, type NoteSnapshot } from "./_lib/types";

const NoteInput = z.object({
  title: zText(200, "Title"),
  meetingDate: zDate,
  attendees: zOptText(2000),
  summary: zOptText(50_000),
  decisions: zOptText(50_000),
  openQuestions: zOptText(50_000),
  transcript: zOptText(500_000),
});

function parseItems(raw: FormDataEntryValue | null): ActionItem[] {
  let data: unknown = [];
  try { data = raw ? JSON.parse(String(raw)) : []; } catch { throw new UserError("Action items data is invalid"); }
  return z.array(ActionItemSchema).max(200, "Too many action items").parse(data);
}

export async function createNote(form: FormData) {
  const user = await requireWrite("meetings");
  const db = await getDb();
  let target = "/meeting-notes";
  try {
    const d = NoteInput.parse(Object.fromEntries(form));
    let items = parseItems(form.get("actionItems"));
    let carried = 0;
    if (form.get("carryForward") === "on") {
      const [prev] = await db.select().from(meetingNotes).orderBy(desc(meetingNotes.meetingDate), desc(meetingNotes.id)).limit(1);
      if (prev) {
        const existing = new Set(items.map((i) => i.text.toLowerCase()));
        const open = (prev.actionItems ?? []).filter((i) => !i.done && !existing.has(i.text.toLowerCase()));
        const tag = ` [from ${prev.meetingDate}]`;
        items = [...open.map((i) => ({ ...i, text: i.text.includes("[from ") ? i.text : `${i.text}${tag}`.slice(0, 500), done: false })), ...items];
        carried = open.length;
      }
    }
    const [row] = await db.insert(meetingNotes).values({
      title: d.title, meetingDate: d.meetingDate, attendees: d.attendees ?? null, summary: d.summary ?? null, decisions: d.decisions ?? null,
      openQuestions: d.openQuestions ?? null, transcript: d.transcript ?? null, actionItems: items, version: 1, updatedBy: user.id,
    }).returning({ id: meetingNotes.id });
    await audit(db, user.id, "create", "meeting_note", row.id, { title: d.title, carriedForward: carried });
    target = flashUrl(`/meeting-notes/${row.id}`, "ok", `Meeting note created${carried ? `. ${carried} open action item${carried === 1 ? "" : "s"} carried forward` : ""}`);
  } catch (e) {
    target = flashUrl("/meeting-notes/new", "err", errMsg(e));
  }
  revalidatePath("/meeting-notes");
  redirect(target);
}

/** Save a new version: snapshot the PREVIOUS state into meeting_note_revisions, then bump version. */
export async function updateNote(form: FormData) {
  const user = await requireWrite("meetings");
  const db = await getDb();
  const id = Number(form.get("id")) || 0;
  let target = "/meeting-notes";
  try {
    if (id <= 0) throw new UserError("Note not found");
    const d = NoteInput.parse(Object.fromEntries(form));
    const items = parseItems(form.get("actionItems"));
    const changeSummary = zText(500, "Change summary").parse(form.get("changeSummary") ?? "");
    const expectedVersion = z.coerce.number().int().parse(form.get("version"));
    const newVersion = await db.transaction(async (tx) => {
      const [cur] = await tx.select().from(meetingNotes).where(eq(meetingNotes.id, id)).limit(1).for("update");
      if (!cur) throw new UserError("Note not found");
      if (cur.version !== expectedVersion) {
        throw new UserError(`This note was updated by someone else (now v${cur.version}). Reload and re-apply your changes.`);
      }
      const snapshot: NoteSnapshot = {
        title: cur.title, meetingDate: cur.meetingDate, attendees: cur.attendees, summary: cur.summary, decisions: cur.decisions,
        actionItems: cur.actionItems ?? [], openQuestions: cur.openQuestions, transcript: cur.transcript, version: cur.version,
        updatedBy: cur.updatedBy, updatedAt: cur.updatedAt.toISOString(),
      };
      await tx.insert(meetingNoteRevisions).values({ noteId: id, version: cur.version, snapshot, changeSummary, updatedBy: user.id });
      const v = cur.version + 1;
      await tx.update(meetingNotes).set({
        title: d.title, meetingDate: d.meetingDate, attendees: d.attendees ?? null, summary: d.summary ?? null, decisions: d.decisions ?? null,
        openQuestions: d.openQuestions ?? null, transcript: d.transcript ?? null, actionItems: items, version: v, updatedBy: user.id, updatedAt: new Date(),
      }).where(eq(meetingNotes.id, id));
      return v;
    });
    await audit(db, user.id, "update", "meeting_note", id, { version: newVersion, changeSummary });
    target = flashUrl(`/meeting-notes/${id}`, "ok", `Saved as version ${newVersion}`);
  } catch (e) {
    target = flashUrl(id > 0 ? `/meeting-notes/${id}/edit` : "/meeting-notes", "err", errMsg(e));
  }
  revalidatePath("/meeting-notes");
  redirect(target);
}

const ToggleInput = z.object({ id: zId, index: z.coerce.number().int().min(0), done: z.enum(["1", "0"]), text: z.string().max(500) });

/** Tick / un-tick an action item (does not create a new version; audited). */
export async function toggleActionItem(form: FormData) {
  const user = await requireWrite("meetings");
  const db = await getDb();
  const id = Number(form.get("id")) || 0;
  let target = id > 0 ? `/meeting-notes/${id}` : "/meeting-notes";
  try {
    const d = ToggleInput.parse(Object.fromEntries(form));
    const [cur] = await db.select({ actionItems: meetingNotes.actionItems }).from(meetingNotes).where(eq(meetingNotes.id, d.id)).limit(1);
    if (!cur) throw new UserError("Note not found");
    const items = [...(cur.actionItems ?? [])];
    if (!items[d.index] || items[d.index].text !== d.text) throw new UserError("The action items have changed. Reload the page and try again");
    items[d.index] = { ...items[d.index], done: d.done === "1" };
    await db.update(meetingNotes).set({ actionItems: items, updatedBy: user.id, updatedAt: new Date() }).where(eq(meetingNotes.id, d.id));
    await audit(db, user.id, "update", "meeting_note", d.id, { actionItem: items[d.index].text, done: d.done === "1" });
    target = `/meeting-notes/${d.id}#actions`;
  } catch (e) {
    target = flashUrl(target, "err", errMsg(e));
  }
  revalidatePath(`/meeting-notes/${id}`);
  redirect(target);
}
