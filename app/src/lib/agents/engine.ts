/**
 * Agent engine: runs the rule-based agents, upserts alerts by dedupeKey, auto-resolves alerts whose condition
 * no longer holds, records agent_runs and flushes the email outbox.
 *
 * Idempotency guarantees (running twice on the same day is a no-op the second time):
 *  - alerts are keyed by a unique dedupeKey (insert … on conflict do nothing);
 *  - dunning emails are gated by an atomic UPDATE … RETURNING claim on sales_invoices (+ "already emailed today" check);
 *  - automatic status changes (quote expiry) are conditional UPDATEs;
 *  - "minutes saved" counts only NEW alerts / emails / actions, never re-detections.
 * No AI / LLM calls anywhere: pure SQL + TypeScript rules.
 */
import "server-only";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import type { DB } from "@/db";
import { agentRules, agentRuns, alerts, settings } from "@/db/schema";
import { flushOutbox } from "@/lib/email";
import { todayIST } from "@/lib/format";
import { AGENTS, getAgent } from "./registry";
import { clampDraft, mergeParams, reconcileExisting, SEVERITY_RANK } from "./rules";
import type { Agent, AgentParams, AgentRunOutcome, AgentTrigger, AlertDraft, CompanyInfo, RunAgentsResult } from "./types";

export type AgentRuleState = { agent: Agent; enabled: boolean; params: AgentParams; updatedAt: Date | null };

/** Loads agent_rules (inserting rows for agents that have none) and merges params over defaults. */
export async function loadAgentRules(db: DB): Promise<AgentRuleState[]> {
  let rows = await db.select().from(agentRules);
  const have = new Set(rows.map((r) => r.agent));
  const missing = AGENTS.filter((a) => !have.has(a.key));
  if (missing.length) {
    await db
      .insert(agentRules)
      .values(missing.map((a) => ({ agent: a.key, enabled: true, params: a.defaultParams })))
      .onConflictDoNothing();
    rows = await db.select().from(agentRules);
  }
  const byKey = new Map(rows.map((r) => [r.agent, r]));
  return AGENTS.map((agent) => {
    const r = byKey.get(agent.key);
    const merged = mergeParams(agent.defaultParams, r?.params as Record<string, unknown> | undefined);
    const parsed = agent.paramSchema.safeParse(merged);
    return { agent, enabled: r?.enabled ?? true, params: parsed.success ? parsed.data : agent.defaultParams, updatedAt: r?.updatedAt ?? null };
  });
}

/** Company letterhead details for emails, from settings (key "company" object or "company.*" keys). */
export async function loadCompany(db: DB): Promise<CompanyInfo> {
  const fallback: CompanyInfo = { name: "Linga Bhairavi Enterprise", address: "Hosur, Tamil Nadu" };
  try {
    const rows = await db.select().from(settings).where(or(eq(settings.key, "company"), like(settings.key, "company.%")));
    const flat: Record<string, unknown> = {};
    for (const r of rows) {
      if (r.key === "company" && r.value && typeof r.value === "object") Object.assign(flat, r.value as Record<string, unknown>);
      else flat[r.key.slice("company.".length)] = r.value;
    }
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    const bankObj = flat.bank && typeof flat.bank === "object" ? (flat.bank as Record<string, unknown>) : null;
    const bank = str(flat.bank) ?? (bankObj ? Object.entries(bankObj).filter(([, v]) => str(v)).map(([k, v]) => `${k}: ${v}`).join("\n") || undefined : undefined);
    return {
      name: str(flat.name) ?? str(flat.legalName) ?? fallback.name,
      phone: str(flat.phone),
      email: str(flat.email),
      bank,
      address: str(flat.address) ?? fallback.address,
    };
  } catch {
    return fallback;
  }
}

type Applied = { created: number; reopened: number; updated: number; resolved: number; open: number };

const sameContent = (
  e: typeof alerts.$inferSelect,
  d: AlertDraft,
) =>
  e.severity === d.severity && e.title === d.title && (e.message ?? null) === (d.message ?? null) && (e.link ?? null) === (d.link ?? null) &&
  (e.entityType ?? null) === (d.entityType ?? null) && (e.entityId ?? null) === (d.entityId ?? null) &&
  (e.assignedRole ?? null) === (d.assignedRole ?? null) && (e.assignedUserId ?? null) === (d.assignedUserId ?? null) &&
  (e.dueDate ?? null) === (d.dueDate ?? null);

const content = (d: AlertDraft) => ({
  severity: d.severity, title: d.title, message: d.message ?? null, link: d.link ?? null, entityType: d.entityType ?? null,
  entityId: d.entityId ?? null, assignedRole: d.assignedRole ?? null, assignedUserId: d.assignedUserId ?? null, dueDate: d.dueDate ?? null,
});

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Reconcile one agent's drafts with the alerts table. Exported for tests / advanced use. */
export async function applyDrafts(
  db: DB,
  agentKey: string,
  rawDrafts: AlertDraft[],
  today: string,
  resolveKeys?: (openKeys: string[]) => string[],
): Promise<Applied> {
  // de-duplicate drafts by key (keep the most severe)
  const drafts = new Map<string, AlertDraft>();
  for (const raw of rawDrafts) {
    const d = clampDraft(raw);
    const prev = drafts.get(d.dedupeKey);
    if (!prev || SEVERITY_RANK[d.severity] > SEVERITY_RANK[prev.severity]) drafts.set(d.dedupeKey, d);
  }
  const keys = [...drafts.keys()];

  const existing = new Map<string, typeof alerts.$inferSelect>();
  for (const r of await db.select().from(alerts).where(and(eq(alerts.agent, agentKey), inArray(alerts.status, ["open", "snoozed"])))) existing.set(r.dedupeKey, r);
  for (const part of chunk(keys.filter((k) => !existing.has(k)), 500)) {
    for (const r of await db.select().from(alerts).where(inArray(alerts.dedupeKey, part))) existing.set(r.dedupeKey, r);
  }

  const res: Applied = { created: 0, reopened: 0, updated: 0, resolved: 0, open: 0 };
  const inserts: (typeof alerts.$inferInsert)[] = [];
  for (const d of drafts.values()) {
    const e = existing.get(d.dedupeKey);
    if (!e) {
      inserts.push({ agent: agentKey, status: "open", dedupeKey: d.dedupeKey, ...content(d) });
      continue;
    }
    const decision = reconcileExisting({ status: e.status, severity: e.severity, snoozedUntil: e.snoozedUntil }, d, today);
    if (decision === "reopen") {
      await db.update(alerts).set({ ...content(d), status: "open", snoozedUntil: null, resolvedAt: null }).where(eq(alerts.id, e.id));
      res.reopened++;
      res.open++;
    } else if (e.status !== "done") {
      if (!sameContent(e, d)) {
        await db.update(alerts).set(content(d)).where(eq(alerts.id, e.id));
        res.updated++;
      }
      if (e.status === "open") res.open++;
    }
  }
  for (const part of chunk(inserts, 200)) {
    const ins = await db.insert(alerts).values(part).onConflictDoNothing({ target: alerts.dedupeKey }).returning({ id: alerts.id });
    res.created += ins.length;
    res.open += ins.length;
  }

  // auto-resolve: open/snoozed alerts of this agent whose condition no longer holds
  const stale = [...existing.values()].filter((e) => e.agent === agentKey && e.status !== "done" && !drafts.has(e.dedupeKey));
  let toResolve = stale.map((e) => e.dedupeKey);
  if (resolveKeys) {
    const allowed = new Set(resolveKeys(toResolve));
    toResolve = toResolve.filter((k) => allowed.has(k));
  }
  for (const part of chunk(toResolve, 500)) {
    const done = await db
      .update(alerts)
      .set({ status: "done", resolvedAt: new Date(), snoozedUntil: null })
      .where(and(inArray(alerts.dedupeKey, part), inArray(alerts.status, ["open", "snoozed"])))
      .returning({ id: alerts.id });
    res.resolved += done.length;
  }
  return res;
}

async function runOne(db: DB, state: AgentRuleState, trigger: AgentTrigger, today: string, company: CompanyInfo): Promise<AgentRunOutcome> {
  const { agent, params } = state;
  const startedAt = new Date();
  let outcome: AgentRunOutcome;
  try {
    const r = await agent.run({ db, today, params, trigger, company });
    const a = await applyDrafts(db, agent.key, r.alerts, today, r.resolveKeys);
    const emails = r.emails ?? 0, actions = r.actions ?? 0;
    const minutes =
      (a.created + a.reopened) * agent.minutesSavedPerAlert + emails * (agent.minutesSavedPerEmail ?? 0) + actions * (agent.minutesSavedPerAction ?? 0);
    const parts = [`${a.created} new`, a.reopened ? `${a.reopened} re-opened` : "", `${a.resolved} auto-resolved`, `${a.open} open`];
    if (emails) parts.push(`${emails} email${emails === 1 ? "" : "s"} queued`);
    outcome = {
      agent: agent.key, status: "ok", alertsCreated: a.created, alertsReopened: a.reopened, alertsResolved: a.resolved, alertsUpdated: a.updated,
      emailsQueued: emails, actions, minutesSaved: minutes,
      summary: [parts.filter(Boolean).join(" · "), ...(r.notes ?? [])].join(". ").slice(0, 2000),
    };
  } catch (err) {
    console.error(`[agents] ${agent.key} failed`, err);
    outcome = {
      agent: agent.key, status: "error", alertsCreated: 0, alertsReopened: 0, alertsResolved: 0, alertsUpdated: 0, emailsQueued: 0, actions: 0, minutesSaved: 0,
      summary: `Error: ${String((err as Error)?.message ?? err).slice(0, 500)}`,
    };
  }
  try {
    await db.insert(agentRuns).values({
      agent: agent.key, trigger, startedAt, finishedAt: new Date(), status: outcome.status === "error" ? "error" : "ok",
      alertsCreated: outcome.alertsCreated + outcome.alertsReopened, alertsResolved: outcome.alertsResolved, emailsQueued: outcome.emailsQueued,
      minutesSaved: outcome.minutesSaved, summary: outcome.summary,
    });
  } catch (err) {
    console.error("[agents] could not record run", err);
  }
  return outcome;
}

async function runAgentsInner(db: DB, opts: { trigger: AgentTrigger; only?: string; today?: string }): Promise<RunAgentsResult> {
  const startedAt = new Date();
  const today = opts.today ?? todayIST();
  if (opts.only && !getAgent(opts.only)) throw new Error(`Unknown agent "${opts.only}"`);
  const [rules, company] = await Promise.all([loadAgentRules(db), loadCompany(db)]);
  const outcomes: AgentRunOutcome[] = [];
  for (const state of rules) {
    if (opts.only && state.agent.key !== opts.only) continue;
    // a disabled agent still runs when explicitly requested by an admin ("Run now"), never on cron / run-all
    if (!state.enabled && !opts.only) {
      outcomes.push({ agent: state.agent.key, status: "skipped", alertsCreated: 0, alertsReopened: 0, alertsResolved: 0, alertsUpdated: 0, emailsQueued: 0, actions: 0, minutesSaved: 0, summary: "Disabled" });
      continue;
    }
    outcomes.push(await runOne(db, state, opts.trigger, today, company));
  }
  let outbox = { sent: 0, failed: 0 };
  try {
    outbox = await flushOutbox(db);
  } catch (err) {
    console.error("[agents] outbox flush failed", err);
  }
  const sum = (f: (o: AgentRunOutcome) => number) => outcomes.reduce((s, o) => s + f(o), 0);
  return {
    trigger: opts.trigger,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    outcomes,
    totals: {
      alertsCreated: sum((o) => o.alertsCreated + o.alertsReopened),
      alertsResolved: sum((o) => o.alertsResolved),
      emailsQueued: sum((o) => o.emailsQueued),
      minutesSaved: sum((o) => o.minutesSaved),
      errors: outcomes.filter((o) => o.status === "error").length,
    },
    outbox,
  };
}

// Serialise runs inside one server instance (cron, "Run now" and on-login refresh can overlap).
const g = globalThis as unknown as { __lbeAgentChain?: Promise<unknown>; __lbeAgentRefresh?: Promise<unknown> | null };

/** Run all enabled agents (or just `only`). Safe to call repeatedly (see the idempotency notes above). */
export function runAgents(db: DB, opts: { trigger: AgentTrigger; only?: string; today?: string }): Promise<RunAgentsResult> {
  const prev = g.__lbeAgentChain ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(() => runAgentsInner(db, opts));
  g.__lbeAgentChain = next.catch(() => undefined);
  return next;
}

/** Timestamp of the most recent agent run (any agent), or null. */
export async function lastAgentRunAt(db: DB): Promise<Date | null> {
  const [r] = await db.select({ at: agentRuns.startedAt }).from(agentRuns).orderBy(desc(agentRuns.startedAt)).limit(1);
  return r?.at ?? null;
}

/** On-login freshness: run all agents if the last run is older than `maxAgeHours`. Never throws. */
export async function refreshIfStale(db: DB, maxAgeHours = 6): Promise<boolean> {
  try {
    if (g.__lbeAgentRefresh) {
      await g.__lbeAgentRefresh;
      return false;
    }
    const last = await lastAgentRunAt(db);
    if (last && Date.now() - last.getTime() < maxAgeHours * 3600e3) return false;
    g.__lbeAgentRefresh = runAgents(db, { trigger: "manual" }).finally(() => {
      g.__lbeAgentRefresh = null;
    });
    await g.__lbeAgentRefresh;
    return true;
  } catch (err) {
    console.error("[agents] refresh failed", err);
    return false;
  }
}
