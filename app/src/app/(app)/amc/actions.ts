"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { amcContracts, amcVisits } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { addDays, round2, todayIST } from "@/lib/format";
import { AMC_SYSTEM_KEYS, BILLING_FREQUENCIES, COVERAGE, defaultEndDate, renewalDates, type BillingFrequency, type Coverage } from "@/lib/amc";
import { UserError, errMsg, flashUrl, zDate, zId, zMoney, zOptDate, zOptId, zOptText } from "../projects/_lib/forms";
import { amcAccess } from "./_lib/access";
import { assertCustomer, assertEngineer, assertProjectOf, insertContract } from "./_lib/contracts";

const FREQ = Object.keys(BILLING_FREQUENCIES) as [BillingFrequency, ...BillingFrequency[]];
const COV = Object.keys(COVERAGE) as [Coverage, ...Coverage[]];

function requireManage(role: Parameters<typeof amcAccess>[0]) {
  if (!amcAccess(role).manage) throw new UserError("Only the owner or sales can change contracts");
}

const ContractInput = z.object({
  customerId: zId,
  projectId: zOptId,
  siteAddress: zOptText(1000),
  systems: z.array(z.enum(AMC_SYSTEM_KEYS)).min(1, "Pick at least one system").max(10),
  scope: zOptText(5000),
  startDate: zDate,
  endDate: zDate,
  value: zMoney,
  billingFrequency: z.enum(FREQ),
  visitsPerYear: z.coerce.number().int("Visits per year must be a whole number").min(0).max(52, "Visits per year cannot be more than 52"),
  coverage: z.enum(COV),
  responseHours: z.coerce.number().int("Response time must be whole hours").min(1, "Response time must be at least 1 hour").max(720),
  engineerId: zOptId,
  notes: zOptText(5000),
}).refine((d) => d.endDate >= d.startDate, { message: "End date must be on or after the start date", path: ["endDate"] })
  .refine((d) => d.endDate <= addDays(d.startDate, 366 * 5), { message: "A contract can run for at most 5 years", path: ["endDate"] });

/** Create a contract: number via nextNumber("amc"), status active, visits auto-scheduled (rule 19). */
export async function createContract(form: FormData) {
  const user = await requireWrite("amc");
  const db = await getDb();
  let target = "/amc";
  try {
    requireManage(user.role);
    const d = ContractInput.parse({ ...Object.fromEntries(form), systems: form.getAll("systems") });
    await assertCustomer(db, d.customerId);
    if (d.projectId) await assertProjectOf(db, d.projectId, d.customerId);
    if (d.engineerId) await assertEngineer(db, d.engineerId);
    const created = await db.transaction((tx) => insertContract(tx, {
      customerId: d.customerId, projectId: d.projectId ?? null, siteAddress: d.siteAddress ?? null, systems: [...new Set(d.systems)],
      scope: d.scope ?? null, startDate: d.startDate, endDate: d.endDate, value: round2(d.value), billingFrequency: d.billingFrequency,
      visitsPerYear: d.visitsPerYear, coverage: d.coverage, responseHours: d.responseHours, engineerId: d.engineerId ?? null, notes: d.notes ?? null,
    }, user.id));
    await audit(db, user.id, "create", "amc_contract", created.id, { number: created.number, customerId: d.customerId, value: d.value, visits: created.visits });
    target = flashUrl(`/amc/${created.id}`, "ok", `Contract ${created.number} created with ${created.visits} visit${created.visits === 1 ? "" : "s"} scheduled`);
  } catch (e) {
    target = flashUrl("/amc/new", "err", errMsg(e));
  }
  revalidatePath("/amc");
  redirect(target);
}

const RenewInput = z.object({
  id: zId,
  value: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().min(0, "Value cannot be negative").max(1e11).optional()),
  startDate: zOptDate,
  endDate: zOptDate,
  visitsPerYear: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(0).max(52).optional()),
});

/** Renew: new contract from this one with dates moved on a year (rule 19), old one becomes "renewed". */
export async function renewContract(form: FormData) {
  const user = await requireWrite("amc");
  const db = await getDb();
  const id = Number(form.get("id")) || 0;
  let target = `/amc/${id}`;
  try {
    requireManage(user.role);
    const d = RenewInput.parse(Object.fromEntries(form));
    const [old] = await db.select().from(amcContracts).where(eq(amcContracts.id, d.id)).limit(1);
    if (!old) throw new UserError("Contract not found");
    if (old.status !== "active" && old.status !== "expired") throw new UserError(`A ${old.status} contract cannot be renewed`);
    const dates = renewalDates(old.endDate);
    const startDate = d.startDate ?? dates.startDate;
    const endDate = d.endDate ?? (d.startDate ? defaultEndDate(d.startDate) : dates.endDate);
    if (endDate < startDate) throw new UserError("End date must be on or after the start date");
    const value = round2(d.value ?? Number(old.value));
    const created = await db.transaction(async (tx) => {
      // conditional update: a double click or a second user cannot renew the same contract twice
      const flipped = await tx.update(amcContracts).set({ status: "renewed" })
        .where(and(eq(amcContracts.id, old.id), inArray(amcContracts.status, ["active", "expired"]))).returning({ id: amcContracts.id });
      if (!flipped.length) throw new UserError("This contract was already renewed or cancelled");
      return insertContract(tx, {
        customerId: old.customerId, projectId: old.projectId, siteAddress: old.siteAddress, systems: old.systems ?? [], scope: old.scope,
        startDate, endDate, value, billingFrequency: old.billingFrequency, visitsPerYear: d.visitsPerYear ?? old.visitsPerYear,
        coverage: old.coverage, responseHours: old.responseHours, engineerId: old.engineerId, notes: old.notes, renewalOf: old.id,
      }, user.id);
    });
    await audit(db, user.id, "create", "amc_contract", created.id, { renewalOf: old.id, number: created.number, value, oldValue: old.value });
    await audit(db, user.id, "update", "amc_contract", old.id, { status: [old.status, "renewed"], renewedAs: created.id });
    target = flashUrl(`/amc/${created.id}`, "ok", `Renewed as ${created.number}`);
  } catch (e) {
    target = flashUrl(`/amc/${id}`, "err", errMsg(e));
  }
  revalidatePath("/amc");
  redirect(target);
}

/** Cancel a contract; its remaining scheduled visits are cancelled too. */
export async function cancelContract(form: FormData) {
  const user = await requireWrite("amc");
  const db = await getDb();
  const id = Number(form.get("id")) || 0;
  let target = `/amc/${id}`;
  try {
    requireManage(user.role);
    const reason = zOptText(500).parse(form.get("reason"));
    const [c] = await db.select({ status: amcContracts.status, notes: amcContracts.notes }).from(amcContracts).where(eq(amcContracts.id, id)).limit(1);
    if (!c) throw new UserError("Contract not found");
    if (c.status === "cancelled" || c.status === "renewed") throw new UserError(`This contract is already ${c.status}`);
    const note = `Cancelled on ${todayIST()}${reason ? `: ${reason}` : ""}`;
    const visits = await db.transaction(async (tx) => {
      await tx.update(amcContracts).set({ status: "cancelled", notes: c.notes ? `${c.notes}\n${note}` : note }).where(eq(amcContracts.id, id));
      return tx.update(amcVisits).set({ status: "cancelled" })
        .where(and(eq(amcVisits.contractId, id), eq(amcVisits.status, "scheduled"))).returning({ id: amcVisits.id });
    });
    await audit(db, user.id, "update", "amc_contract", id, { status: [c.status, "cancelled"], reason: reason ?? null, visitsCancelled: visits.length });
    target = flashUrl(`/amc/${id}`, "ok", "Contract cancelled");
  } catch (e) {
    target = flashUrl(`/amc/${id}`, "err", errMsg(e));
  }
  revalidatePath("/amc");
  redirect(target);
}

/** Change the contract engineer; scheduled visits that had no engineer or the old one move to the new engineer. */
export async function assignContractEngineer(form: FormData) {
  const user = await requireWrite("amc");
  const db = await getDb();
  const id = Number(form.get("id")) || 0;
  let target = `/amc/${id}`;
  try {
    requireManage(user.role);
    const engineerId = zOptId.parse(form.get("engineerId")) ?? null;
    if (engineerId) await assertEngineer(db, engineerId);
    const [c] = await db.select({ engineerId: amcContracts.engineerId }).from(amcContracts).where(eq(amcContracts.id, id)).limit(1);
    if (!c) throw new UserError("Contract not found");
    await db.transaction(async (tx) => {
      await tx.update(amcContracts).set({ engineerId }).where(eq(amcContracts.id, id));
      await tx.update(amcVisits).set({ engineerId }).where(and(
        eq(amcVisits.contractId, id), eq(amcVisits.status, "scheduled"),
        c.engineerId ? or(isNull(amcVisits.engineerId), eq(amcVisits.engineerId, c.engineerId)) : isNull(amcVisits.engineerId),
      ));
    });
    await audit(db, user.id, "update", "amc_contract", id, { engineerId: [c.engineerId, engineerId] });
    target = flashUrl(`/amc/${id}`, "ok", engineerId ? "Engineer assigned" : "Engineer removed");
  } catch (e) {
    target = flashUrl(`/amc/${id}`, "err", errMsg(e));
  }
  revalidatePath(`/amc/${id}`);
  redirect(target);
}

// ---------------------------------------------------------------- visits
/** Engineers work on visits assigned to them or unassigned ones; owner and sales can act on any visit (same rule as service calls). */
function assertVisitWork(user: { id: number; role: Parameters<typeof amcAccess>[0] }, visitEngineerId: number | null) {
  if (amcAccess(user.role).manage) return;
  if (visitEngineerId != null && visitEngineerId !== user.id) throw new UserError("This visit is assigned to another engineer");
}

async function loadVisit(visitId: number) {
  const db = await getDb();
  const [v] = await db.select({ v: amcVisits, contractStatus: amcContracts.status, contractId: amcContracts.id })
    .from(amcVisits).innerJoin(amcContracts, eq(amcContracts.id, amcVisits.contractId)).where(eq(amcVisits.id, visitId)).limit(1);
  if (!v) throw new UserError("Visit not found");
  if (v.contractStatus === "cancelled") throw new UserError("This contract is cancelled");
  return v;
}

const ChecklistItem = z.object({
  item: z.string().trim().min(1).max(300),
  ok: z.boolean(),
  remark: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(300).optional()),
});
const VisitInput = z.object({
  doneDate: zDate,
  engineerId: zOptId,
  findings: zOptText(5000),
  recommendations: zOptText(5000),
  customerSignoff: zOptText(120),
});

/** Record (or correct) a visit report: checklist OK / Not OK + remark per item, findings, sign-off. Marks the visit done. */
export async function recordVisit(form: FormData) {
  const user = await requireWrite("amc");
  const db = await getDb();
  const visitId = Number(form.get("visitId")) || 0;
  const contractId = Number(form.get("contractId")) || 0;
  const back = `/amc/${contractId}/visits/${visitId}`;
  let target = back;
  try {
    const v = await loadVisit(visitId);
    if (v.contractId !== contractId) throw new UserError("Visit not found");
    assertVisitWork(user, v.v.engineerId);
    if (v.v.status === "cancelled") throw new UserError("This visit was cancelled");
    const d = VisitInput.parse(Object.fromEntries(form));
    if (d.doneDate > todayIST()) throw new UserError("Visit date cannot be in the future");
    let raw: unknown = [];
    try { raw = JSON.parse(String(form.get("checklist") ?? "[]")); } catch { throw new UserError("Checklist data is invalid"); }
    const checklist = z.array(ChecklistItem).max(300).parse(raw);
    if (!checklist.length && !d.findings) throw new UserError("Tick the checklist or write the findings before saving");
    // an engineer records the visit as themselves; only the owner or sales can name another engineer
    const engineerId = amcAccess(user.role).manage
      ? d.engineerId ?? v.v.engineerId ?? null
      : v.v.engineerId ?? user.id;
    if (engineerId && engineerId !== v.v.engineerId) await assertEngineer(db, engineerId);
    await db.update(amcVisits).set({
      status: "done", doneDate: d.doneDate, engineerId, checklist, findings: d.findings ?? null,
      recommendations: d.recommendations ?? null, customerSignoff: d.customerSignoff ?? null,
    }).where(eq(amcVisits.id, visitId));
    const notOk = checklist.filter((c) => !c.ok).length;
    await audit(db, user.id, v.v.status === "done" ? "update" : "create", "amc_visit", visitId, { contractId, doneDate: d.doneDate, items: checklist.length, notOk });
    target = flashUrl(`/amc/${contractId}`, "ok", `Visit report saved${notOk ? `. ${notOk} item${notOk === 1 ? "" : "s"} need attention` : ""}`);
  } catch (e) {
    target = flashUrl(back, "err", errMsg(e));
  }
  revalidatePath(`/amc/${contractId}`);
  revalidatePath("/amc");
  redirect(target);
}

/** Move a scheduled (or missed) visit to a new date. */
export async function rescheduleVisit(form: FormData) {
  const user = await requireWrite("amc");
  const db = await getDb();
  const visitId = Number(form.get("visitId")) || 0;
  const contractId = Number(form.get("contractId")) || 0;
  const back = `/amc/${contractId}/visits/${visitId}`;
  let target = back;
  try {
    const v = await loadVisit(visitId);
    if (v.contractId !== contractId) throw new UserError("Visit not found");
    assertVisitWork(user, v.v.engineerId);
    if (v.v.status !== "scheduled" && v.v.status !== "missed") throw new UserError("Only scheduled or missed visits can be rescheduled");
    const date = zDate.parse(form.get("date"));
    if (date < addDays(todayIST(), -1)) throw new UserError("Pick today or a later date");
    await db.update(amcVisits).set({ scheduledDate: date, status: "scheduled" }).where(eq(amcVisits.id, visitId));
    await audit(db, user.id, "update", "amc_visit", visitId, { scheduledDate: [v.v.scheduledDate, date], status: [v.v.status, "scheduled"] });
    target = flashUrl(`/amc/${contractId}`, "ok", "Visit rescheduled");
  } catch (e) {
    target = flashUrl(back, "err", errMsg(e));
  }
  revalidatePath(`/amc/${contractId}`);
  redirect(target);
}

/** Mark a scheduled visit as missed, with a reason (kept in findings). */
export async function markVisitMissed(form: FormData) {
  const user = await requireWrite("amc");
  const db = await getDb();
  const visitId = Number(form.get("visitId")) || 0;
  const contractId = Number(form.get("contractId")) || 0;
  const back = `/amc/${contractId}/visits/${visitId}`;
  let target = back;
  try {
    const v = await loadVisit(visitId);
    if (v.contractId !== contractId) throw new UserError("Visit not found");
    assertVisitWork(user, v.v.engineerId);
    if (v.v.status !== "scheduled") throw new UserError("Only a scheduled visit can be marked missed");
    const reason = zOptText(500).parse(form.get("reason"));
    await db.update(amcVisits).set({ status: "missed", findings: reason ? `Missed: ${reason}` : "Missed" }).where(eq(amcVisits.id, visitId));
    await audit(db, user.id, "update", "amc_visit", visitId, { status: ["scheduled", "missed"], reason: reason ?? null });
    target = flashUrl(`/amc/${contractId}`, "ok", "Visit marked missed");
  } catch (e) {
    target = flashUrl(back, "err", errMsg(e));
  }
  revalidatePath(`/amc/${contractId}`);
  redirect(target);
}

/** Assign the engineer for one visit. */
export async function assignVisitEngineer(form: FormData) {
  const user = await requireWrite("amc");
  const db = await getDb();
  const visitId = Number(form.get("visitId")) || 0;
  const contractId = Number(form.get("contractId")) || 0;
  const back = `/amc/${contractId}/visits/${visitId}`;
  let target = back;
  try {
    const v = await loadVisit(visitId);
    if (v.contractId !== contractId) throw new UserError("Visit not found");
    assertVisitWork(user, v.v.engineerId);
    const engineerId = zOptId.parse(form.get("engineerId")) ?? null;
    // engineers may take a visit themselves; assigning someone else is for the owner or sales
    if (!amcAccess(user.role).manage && engineerId !== user.id) throw new UserError("You can only assign a visit to yourself");
    if (engineerId) await assertEngineer(db, engineerId);
    await db.update(amcVisits).set({ engineerId }).where(eq(amcVisits.id, visitId));
    await audit(db, user.id, "update", "amc_visit", visitId, { engineerId: [v.v.engineerId, engineerId] });
    target = flashUrl(back, "ok", "Engineer updated");
  } catch (e) {
    target = flashUrl(back, "err", errMsg(e));
  }
  revalidatePath(`/amc/${contractId}`);
  redirect(target);
}
