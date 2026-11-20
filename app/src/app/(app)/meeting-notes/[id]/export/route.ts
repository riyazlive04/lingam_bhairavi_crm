import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { meetingNoteRevisions, meetingNotes, users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { canRead } from "@/lib/rbac";
import { meetingNoteToMarkdown } from "@/lib/markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /meeting-notes/:id/export → Markdown file for docs/meetings/YYYY-MM-DD-topic.md */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (!canRead(user.role, "meetings")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const nid = Number(id);
  if (!Number.isInteger(nid) || nid <= 0) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const [n] = await db.select().from(meetingNotes).where(eq(meetingNotes.id, nid)).limit(1);
  if (!n) return new Response("Not found", { status: 404 });
  const revisions = await db
    .select({ version: meetingNoteRevisions.version, changeSummary: meetingNoteRevisions.changeSummary, createdAt: meetingNoteRevisions.createdAt, by: users.name })
    .from(meetingNoteRevisions)
    .leftJoin(users, eq(users.id, meetingNoteRevisions.updatedBy))
    .where(eq(meetingNoteRevisions.noteId, nid))
    .orderBy(desc(meetingNoteRevisions.version));

  const md = meetingNoteToMarkdown({ ...n, actionItems: n.actionItems ?? [] }, revisions);
  const slug = n.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "meeting";
  const fname = `${n.meetingDate}-${slug}.md`;
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}
