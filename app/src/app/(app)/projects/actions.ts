"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DB } from "@/db";
import { customers, projects, quotations, users } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { PROJECT_STATUSES } from "@/lib/constants";
import { round2, todayIST } from "@/lib/format";
import { canSeeCost } from "@/lib/rbac";
import { nextNumber } from "@/lib/sequence";
import { projectAccess } from "./_lib/access";
import { UserError, errMsg, flashUrl, zId, zMoney, zOptDate, zOptId, zOptText, zText } from "./_lib/forms";

const ProjectInput = z.object({
  id: zOptId,
  name: zText(200, "Project name"),
  customerId: zId,
  quotationId: zOptId,
  status: z.enum(PROJECT_STATUSES),
  siteAddress: zOptText(1000),
  engineerId: zOptId,
  startDate: zOptDate,
  endDate: zOptDate,
  contractValue: zMoney,
  budget: zMoney,
  notes: zOptText(5000),
});

async function assertRefs(db: DB, d: z.infer<typeof ProjectInput>) {
  const [c] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, d.customerId)).limit(1);
  if (!c) throw new UserError("Choose a valid customer");
  if (d.engineerId) {
    const [e] = await db.select({ role: users.role, active: users.active }).from(users).where(eq(users.id, d.engineerId)).limit(1);
    if (!e || e.role !== "engineer") throw new UserError("Assigned engineer must be a user with the Site Engineer role");
  }
  if (d.startDate && d.endDate && d.endDate < d.startDate) throw new UserError("End date cannot be before start date");
  if (d.quotationId) {
    const [q] = await db.select().from(quotations).where(eq(quotations.id, d.quotationId)).limit(1);
    if (!q) throw new UserError("Linked quotation not found");
    if (q.customerId !== d.customerId) throw new UserError("Linked quotation belongs to a different customer");
    return q;
  }
  return null;
}

export async function saveProject(form: FormData) {
  const user = await requireWrite("projects");
  const db = await getDb();
  let target = "/projects";
  const editPath = form.get("id") ? `/projects/${form.get("id")}/edit` : "/projects/new";
  try {
    const d = ProjectInput.parse(Object.fromEntries(form));
    const q = await assertRefs(db, d);
    const full = canSeeCost(user.role);

    if (d.id) {
      const [existing] = await db.select().from(projects).where(eq(projects.id, d.id)).limit(1);
      if (!existing) throw new UserError("Project not found");
      if (!projectAccess(user, existing).edit) throw new UserError("You can only edit projects assigned to you");
      const values = {
        name: d.name, customerId: d.customerId, quotationId: d.quotationId ?? null, status: d.status,
        siteAddress: d.siteAddress ?? null, startDate: d.startDate ?? null, endDate: d.endDate ?? null, notes: d.notes ?? null,
        // engineers cannot re-assign or touch financials they cannot see
        engineerId: user.role === "admin" || full ? d.engineerId ?? null : existing.engineerId,
        contractValue: full ? round2(d.contractValue) : existing.contractValue,
        budget: full ? round2(d.budget) : existing.budget,
      };
      await db.update(projects).set(values).where(eq(projects.id, d.id));
      const changed = Object.fromEntries(
        Object.entries(values).filter(([k, v]) => (existing as Record<string, unknown>)[k] !== v),
      );
      await audit(db, user.id, "update", "project", d.id, changed);
      target = flashUrl(`/projects/${d.id}`, "ok", "Project saved");
    } else {
      // default financials from the won quotation (contract excl. GST, budget = quoted cost)
      const contractValue = full ? (d.contractValue || (q ? round2(q.grandTotal - q.taxAmount) : 0)) : 0;
      const budget = full ? (d.budget || (q ? round2(q.costTotal) : 0)) : 0;
      const engineerId = user.role === "engineer" ? d.engineerId ?? user.id : d.engineerId ?? null;
      const id = await db.transaction(async (tx) => {
        const code = await nextNumber(tx as unknown as DB, "project", d.startDate ?? todayIST());
        const [row] = await tx.insert(projects).values({
          code, name: d.name, customerId: d.customerId, quotationId: d.quotationId ?? null, status: d.status,
          siteAddress: d.siteAddress ?? null, engineerId, startDate: d.startDate ?? null, endDate: d.endDate ?? null,
          contractValue, budget, notes: d.notes ?? null,
        }).returning({ id: projects.id, code: projects.code });
        return row;
      });
      await audit(db, user.id, "create", "project", id.id, { code: id.code, name: d.name, contractValue, budget });
      target = flashUrl(`/projects/${id.id}`, "ok", `Project ${id.code} created`);
    }
  } catch (e) {
    target = flashUrl(editPath, "err", errMsg(e));
  }
  revalidatePath("/projects");
  redirect(target);
}

const StatusInput = z.object({ id: zId, status: z.enum(PROJECT_STATUSES) });

export async function setProjectStatus(form: FormData) {
  const user = await requireWrite("projects");
  const db = await getDb();
  let target = "/projects";
  try {
    const d = StatusInput.parse(Object.fromEntries(form));
    const [p] = await db.select().from(projects).where(eq(projects.id, d.id)).limit(1);
    if (!p) throw new UserError("Project not found");
    if (!projectAccess(user, p).edit) throw new UserError("You can only update projects assigned to you");
    target = `/projects/${d.id}`;
    if (p.status !== d.status) {
      const patch: { status: string; endDate?: string } = { status: d.status };
      if ((d.status === "completed" || d.status === "closed") && !p.endDate) patch.endDate = todayIST();
      await db.update(projects).set(patch).where(eq(projects.id, d.id));
      await audit(db, user.id, "update", "project", d.id, { status: [p.status, d.status] });
    }
    target = flashUrl(target, "ok", `Status set to ${d.status.replace("_", " ")}`);
  } catch (e) {
    target = flashUrl(target, "err", errMsg(e));
  }
  revalidatePath("/projects");
  redirect(target);
}

const NoteInput = z.object({ id: zId, note: zText(2000, "Note") });

/** Append a dated, signed note to the project log (keeps accountability of who said what). */
export async function addProjectNote(form: FormData) {
  const user = await requireWrite("projects");
  const db = await getDb();
  let target = "/projects";
  try {
    const d = NoteInput.parse(Object.fromEntries(form));
    const [p] = await db.select().from(projects).where(eq(projects.id, d.id)).limit(1);
    if (!p) throw new UserError("Project not found");
    if (!projectAccess(user, p).edit) throw new UserError("You can only add notes to projects assigned to you");
    target = `/projects/${d.id}`;
    const entry = `[${todayIST()} · ${user.name}] ${d.note.replace(/\r?\n/g, " ")}`;
    const notes = p.notes ? `${p.notes.trimEnd()}\n${entry}` : entry;
    await db.update(projects).set({ notes }).where(eq(projects.id, d.id));
    await audit(db, user.id, "update", "project", d.id, { note: d.note });
    target = flashUrl(target, "ok", "Note added");
  } catch (e) {
    target = flashUrl(target, "err", errMsg(e));
  }
  revalidatePath(`/projects`);
  redirect(target);
}
