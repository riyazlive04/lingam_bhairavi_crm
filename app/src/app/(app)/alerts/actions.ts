"use server";
import { publicError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { alerts } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canRead } from "@/lib/rbac";
import { addDays, todayIST } from "@/lib/format";
import { alertScope } from "@/lib/agents/scope";
import type { SessionUser } from "@/lib/session";

async function actor(): Promise<SessionUser> {
  const u = await getSession();
  if (!u) throw new Error("Not signed in");
  if (!canRead(u.role, "agents")) throw new Error("You do not have permission for this action");
  return u;
}

/** Only allow redirecting back into the alerts inbox (keeps filters). */
function backTo(form: FormData, kind: "ok" | "err", msg: string) {
  const raw = String(form.get("back") ?? "/alerts");
  const url = new URL(raw.startsWith("/alerts") ? raw : "/alerts", "http://x");
  url.searchParams.delete("ok");
  url.searchParams.delete("err");
  url.searchParams.set(kind, msg);
  return url.pathname + url.search;
}

const Id = z.coerce.number().int().positive();

function done() {
  revalidatePath("/alerts");
  revalidatePath("/");
}

export async function markAlertDoneAction(form: FormData) {
  const user = await actor();
  let target: string;
  try {
    const id = Id.parse(form.get("id"));
    const db = await getDb();
    const r = await db.update(alerts).set({ status: "done", resolvedAt: new Date(), snoozedUntil: null })
      .where(and(eq(alerts.id, id), alertScope(user))).returning({ id: alerts.id });
    if (!r.length) throw new Error("Alert not found");
    await audit(db, user.id, "update", "alert", id, { status: "done" });
    target = backTo(form, "ok", "Marked done");
  } catch (e) {
    target = backTo(form, "err", e instanceof z.ZodError ? "Invalid request" : publicError(e, "Invalid request"));
  }
  done();
  redirect(target);
}

export async function snoozeAlertAction(form: FormData) {
  const user = await actor();
  let target: string;
  try {
    const [idRaw, daysRaw] = String(form.get("snooze") ?? "").split(":");
    const id = Id.parse(idRaw);
    const days = z.coerce.number().int().refine((d) => [1, 3, 7].includes(d), "Snooze must be 1, 3 or 7 days").parse(daysRaw);
    const until = addDays(todayIST(), days);
    const db = await getDb();
    const r = await db.update(alerts).set({ status: "snoozed", snoozedUntil: until })
      .where(and(eq(alerts.id, id), alertScope(user))).returning({ id: alerts.id });
    if (!r.length) throw new Error("Alert not found");
    await audit(db, user.id, "update", "alert", id, { status: "snoozed", until });
    target = backTo(form, "ok", `Snoozed for ${days} day${days === 1 ? "" : "s"}`);
  } catch (e) {
    target = backTo(form, "err", publicError(e, "Invalid request"));
  }
  done();
  redirect(target);
}

export async function reopenAlertAction(form: FormData) {
  const user = await actor();
  let target: string;
  try {
    const id = Id.parse(form.get("reopen"));
    const db = await getDb();
    const r = await db.update(alerts).set({ status: "open", snoozedUntil: null, resolvedAt: null })
      .where(and(eq(alerts.id, id), alertScope(user))).returning({ id: alerts.id });
    if (!r.length) throw new Error("Alert not found");
    await audit(db, user.id, "update", "alert", id, { status: "open" });
    target = backTo(form, "ok", "Re-opened");
  } catch (e) {
    target = backTo(form, "err", e instanceof z.ZodError ? "Invalid request" : publicError(e, "Invalid request"));
  }
  done();
  redirect(target);
}

export async function bulkDoneAction(form: FormData) {
  const user = await actor();
  let target: string;
  try {
    const ids = z.array(Id).min(1, "Select at least one alert").max(500).parse(form.getAll("ids"));
    const db = await getDb();
    const r = await db.update(alerts).set({ status: "done", resolvedAt: new Date(), snoozedUntil: null })
      .where(and(inArray(alerts.id, ids), inArray(alerts.status, ["open", "snoozed"]), alertScope(user))).returning({ id: alerts.id });
    await audit(db, user.id, "update", "alert", null, { bulk: "done", ids: r.map((x) => x.id) });
    target = backTo(form, "ok", `${r.length} alert${r.length === 1 ? "" : "s"} marked done`);
  } catch (e) {
    target = backTo(form, "err", e instanceof z.ZodError ? e.issues[0]?.message ?? "Invalid request" : "Could not update alerts");
  }
  done();
  redirect(target);
}
