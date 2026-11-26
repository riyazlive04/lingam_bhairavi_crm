"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DB } from "@/db";
import { amcContracts, serviceCalls } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/sequence";
import { round2, todayIST } from "@/lib/format";
import { CALL_PRIORITIES, OPEN_CALL_STATUSES, serviceDueBy, type CallPriority } from "@/lib/amc";
import { SYSTEMS } from "@/lib/constants";
import type { SessionUser } from "@/lib/session";
import { UserError, errMsg, flashUrl, zId, zMoney, zOptId, zOptText, zText } from "../projects/_lib/forms";
import { amcAccess } from "../amc/_lib/access";
import { assertCustomer, assertEngineer } from "../amc/_lib/contracts";

const PRIORITIES = Object.keys(CALL_PRIORITIES) as [CallPriority, ...CallPriority[]];
const SYSTEM_KEYS = Object.keys(SYSTEMS) as [string, ...string[]];
const zBool = z.preprocess((v) => v === "on" || v === "true" || v === "1" || v === true, z.boolean());

const CallInput = z.object({
  customerId: zId,
  contractId: zOptId,
  system: z.preprocess((v) => (v === "" ? undefined : v), z.enum(SYSTEM_KEYS).optional()),
  priority: z.enum(PRIORITIES),
  reportedBy: zOptText(120),
  description: zText(4000, "Description"),
  engineerId: zOptId,
});

/** Log a breakdown call. Number via nextNumber("service_call"); dueBy = now + contract response hours, else 48 h (rule 19). */
export async function createCall(form: FormData) {
  const user = await requireWrite("amc");
  const db = await getDb();
  let target = "/service-calls";
  try {
    const d = CallInput.parse(Object.fromEntries(form));
    await assertCustomer(db, d.customerId);
    let contract: { id: number; responseHours: number; projectId: number | null } | null = null;
    if (d.contractId) {
      const [c] = await db.select({ id: amcContracts.id, customerId: amcContracts.customerId, status: amcContracts.status, responseHours: amcContracts.responseHours, projectId: amcContracts.projectId, endDate: amcContracts.endDate })
        .from(amcContracts).where(eq(amcContracts.id, d.contractId)).limit(1);
      if (!c || c.customerId !== d.customerId) throw new UserError("That contract belongs to a different customer");
      if (c.status !== "active" || c.endDate < todayIST()) throw new UserError("That contract is not active. Log the call without a contract (chargeable).");
      contract = c;
    }
    let engineerId = d.engineerId ?? null;
    if (engineerId && !amcAccess(user.role).manage && engineerId !== user.id) engineerId = null;
    if (engineerId) await assertEngineer(db, engineerId);
    const raisedAt = new Date();
    const dueBy = serviceDueBy(raisedAt, contract?.responseHours);
    const created = await db.transaction(async (tx) => {
      const number = await nextNumber(tx as unknown as DB, "service_call");
      const [row] = await tx.insert(serviceCalls).values({
        number, customerId: d.customerId, contractId: contract?.id ?? null, projectId: contract?.projectId ?? null, raisedAt, dueBy,
        reportedBy: d.reportedBy ?? null, priority: d.priority, system: d.system ?? null, description: d.description,
        status: engineerId ? "assigned" : "open", engineerId, chargeable: !contract, createdBy: user.id,
      }).returning({ id: serviceCalls.id });
      return { id: row.id, number };
    });
    await audit(db, user.id, "create", "service_call", created.id, { number: created.number, customerId: d.customerId, contractId: contract?.id ?? null, dueBy: dueBy.toISOString() });
    target = flashUrl(`/service-calls/${created.id}`, "ok", `Call ${created.number} logged`);
  } catch (e) {
    target = flashUrl("/service-calls/new", "err", errMsg(e));
  }
  revalidatePath("/service-calls");
  redirect(target);
}

async function loadCall(id: number) {
  const db = await getDb();
  const [c] = await db.select().from(serviceCalls).where(eq(serviceCalls.id, id)).limit(1);
  if (!c) throw new UserError("Service call not found");
  return c;
}

/** Engineers work on calls assigned to them (or unassigned ones); owner and sales can act on any call. */
function assertCanWork(user: SessionUser, call: { engineerId: number | null }) {
  if (amcAccess(user.role).manage) return;
  if (call.engineerId != null && call.engineerId !== user.id) throw new UserError("This call is assigned to another engineer");
}

/** Assign (or take) a call. */
export async function assignCall(form: FormData) {
  const user = await requireWrite("amc");
  const db = await getDb();
  const id = Number(form.get("id")) || 0;
  let target = `/service-calls/${id}`;
  try {
    const call = await loadCall(id);
    if (call.status === "resolved" || call.status === "closed") throw new UserError("This call is already resolved");
    const engineerId = zOptId.parse(form.get("engineerId")) ?? null;
    if (!amcAccess(user.role).manage && engineerId !== user.id) throw new UserError("You can only take a call yourself");
    if (!amcAccess(user.role).manage) assertCanWork(user, call);
    if (engineerId) await assertEngineer(db, engineerId);
    const status = engineerId ? (call.status === "open" ? "assigned" : call.status) : "open";
    await db.update(serviceCalls).set({ engineerId, status }).where(eq(serviceCalls.id, id));
    await audit(db, user.id, "update", "service_call", id, { engineerId: [call.engineerId, engineerId], status: [call.status, status] });
    target = flashUrl(`/service-calls/${id}`, "ok", engineerId ? (engineerId === user.id ? "Call assigned to you" : "Engineer assigned") : "Engineer removed");
  } catch (e) {
    target = flashUrl(`/service-calls/${id}`, "err", errMsg(e));
  }
  revalidatePath("/service-calls");
  redirect(target);
}

const TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress"],
  assigned: ["in_progress", "open"],
  in_progress: ["assigned"],
  resolved: ["in_progress", "closed"],
  closed: [],
};

/** Move a call along the board (resolving has its own action because it needs the resolution text). */
export async function updateCallStatus(form: FormData) {
  const user = await requireWrite("amc");
  const db = await getDb();
  const id = Number(form.get("id")) || 0;
  const back = String(form.get("back") || "");
  let target = back === "board" ? "/service-calls" : `/service-calls/${id}`;
  try {
    const call = await loadCall(id);
    assertCanWork(user, call);
    const status = z.enum(["open", "assigned", "in_progress", "closed"]).parse(form.get("status"));
    if (!TRANSITIONS[call.status]?.includes(status)) throw new UserError(`A call that is ${call.status.replace("_", " ")} cannot move to ${status.replace("_", " ")}`);
    if (status === "closed" && !amcAccess(user.role).manage) throw new UserError("Only the owner or sales can close a call");
    const patch: Partial<typeof serviceCalls.$inferInsert> = { status };
    // starting work on an unassigned call assigns it to the engineer who started it
    if (status === "in_progress" && !call.engineerId && user.role === "engineer") patch.engineerId = user.id;
    if (status === "assigned" && !call.engineerId) throw new UserError("Assign an engineer first");
    if (status === "in_progress" && call.status === "resolved") { patch.resolvedAt = null; }
    await db.update(serviceCalls).set(patch).where(eq(serviceCalls.id, id));
    await audit(db, user.id, "update", "service_call", id, { status: [call.status, status] });
    target = flashUrl(target, "ok", status === "in_progress" && call.status === "resolved" ? "Call reopened" : `Call moved to ${status.replace("_", " ")}`);
  } catch (e) {
    target = flashUrl(target, "err", errMsg(e));
  }
  revalidatePath("/service-calls");
  redirect(target);
}

const ResolveInput = z.object({
  resolution: zText(4000, "Resolution"),
  chargeable: zBool,
  chargeAmount: zMoney,
});

/** Resolve with what was done; mark chargeable (no AMC, or outside coverage) with an amount. */
export async function resolveCall(form: FormData) {
  const user = await requireWrite("amc");
  const db = await getDb();
  const id = Number(form.get("id")) || 0;
  let target = `/service-calls/${id}`;
  try {
    const call = await loadCall(id);
    assertCanWork(user, call);
    if (!(OPEN_CALL_STATUSES as readonly string[]).includes(call.status)) throw new UserError("This call is already resolved");
    const d = ResolveInput.parse({ resolution: form.get("resolution"), chargeable: form.get("chargeable") ?? "", chargeAmount: form.get("chargeAmount") });
    const updated = await db.update(serviceCalls).set({
      status: "resolved", resolution: d.resolution, resolvedAt: new Date(), chargeable: d.chargeable,
      chargeAmount: d.chargeable ? round2(d.chargeAmount) : 0, engineerId: call.engineerId ?? (user.role === "engineer" ? user.id : null),
    }).where(and(eq(serviceCalls.id, id), inArray(serviceCalls.status, [...OPEN_CALL_STATUSES]))).returning({ id: serviceCalls.id });
    if (!updated.length) throw new UserError("This call was resolved by someone else just now");
    await audit(db, user.id, "update", "service_call", id, { status: [call.status, "resolved"], chargeable: d.chargeable, chargeAmount: d.chargeAmount });
    target = flashUrl(`/service-calls/${id}`, "ok", "Call resolved");
  } catch (e) {
    target = flashUrl(`/service-calls/${id}`, "err", errMsg(e));
  }
  revalidatePath("/service-calls");
  redirect(target);
}

/** Owner / sales: correct the charge on a call (e.g. after checking AMC coverage). */
export async function updateCharge(form: FormData) {
  const user = await requireWrite("amc");
  const db = await getDb();
  const id = Number(form.get("id")) || 0;
  let target = `/service-calls/${id}`;
  try {
    if (!amcAccess(user.role).manage) throw new UserError("Only the owner or sales can change charges");
    const call = await loadCall(id);
    if (call.salesInvoiceId) throw new UserError("This call is already invoiced");
    const d = z.object({ chargeable: zBool, chargeAmount: zMoney }).parse({ chargeable: form.get("chargeable") ?? "", chargeAmount: form.get("chargeAmount") });
    await db.update(serviceCalls).set({ chargeable: d.chargeable, chargeAmount: d.chargeable ? round2(d.chargeAmount) : 0 }).where(eq(serviceCalls.id, id));
    await audit(db, user.id, "update", "service_call", id, { chargeable: [call.chargeable, d.chargeable], chargeAmount: [call.chargeAmount, d.chargeAmount] });
    target = flashUrl(`/service-calls/${id}`, "ok", "Charge updated");
  } catch (e) {
    target = flashUrl(`/service-calls/${id}`, "err", errMsg(e));
  }
  revalidatePath(`/service-calls/${id}`);
  redirect(target);
}
