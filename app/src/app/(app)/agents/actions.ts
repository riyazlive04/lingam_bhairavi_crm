"use server";
import { publicError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { agentRules } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { AGENTS, getAgent, loadAgentRules, runAgents } from "@/lib/agents";

const AgentKey = z.string().refine((k) => !!getAgent(k), "Unknown agent");
const back = (kind: "ok" | "err", msg: string) => `/agents?${kind}=${encodeURIComponent(msg)}`;
const errMsg = (e: unknown) => (e instanceof z.ZodError ? e.issues.map((i) => i.message).join("; ") : publicError(e));

function refresh() {
  revalidatePath("/agents");
  revalidatePath("/alerts");
  revalidatePath("/");
}

export async function runAllAgentsAction() {
  const user = await requireWrite("agents");
  let target: string;
  try {
    const db = await getDb();
    const r = await runAgents(db, { trigger: "manual" });
    await audit(db, user.id, "run", "agent", null, { agent: "all", totals: r.totals });
    const t = r.totals;
    target = back(t.errors ? "err" : "ok",
      `Ran ${r.outcomes.filter((o) => o.status !== "skipped").length} agents: ${t.alertsCreated} new alerts, ${t.alertsResolved} auto-resolved, ${t.emailsQueued} emails queued` +
      (t.errors ? `. ${t.errors} agent(s) failed, see the run history` : ""));
  } catch (e) {
    target = back("err", errMsg(e));
  }
  refresh();
  redirect(target);
}

export async function runAgentAction(form: FormData) {
  const user = await requireWrite("agents");
  let target: string;
  try {
    const key = AgentKey.parse(form.get("agent"));
    const db = await getDb();
    const r = await runAgents(db, { trigger: "manual", only: key });
    const o = r.outcomes[0];
    await audit(db, user.id, "run", "agent", null, { agent: key, outcome: o });
    target = back(o?.status === "error" ? "err" : "ok", `${getAgent(key)?.name}: ${o?.summary ?? "done"}`);
  } catch (e) {
    target = back("err", errMsg(e));
  }
  refresh();
  redirect(target);
}

export async function toggleAgentAction(form: FormData) {
  const user = await requireWrite("agents");
  let target: string;
  try {
    const key = AgentKey.parse(form.get("agent"));
    const enabled = z.enum(["true", "false"]).parse(form.get("enabled")) === "true";
    const db = await getDb();
    const state = (await loadAgentRules(db)).find((s) => s.agent.key === key);
    await db
      .insert(agentRules)
      .values({ agent: key, enabled, params: state?.params ?? {}, updatedAt: new Date() })
      .onConflictDoUpdate({ target: agentRules.agent, set: { enabled, updatedAt: new Date() } });
    await audit(db, user.id, "update", "agent_rule", null, { agent: key, enabled });
    target = back("ok", `${getAgent(key)?.name} ${enabled ? "enabled" : "disabled"}`);
  } catch (e) {
    target = back("err", errMsg(e));
  }
  refresh();
  redirect(target);
}

export async function saveAgentParamsAction(form: FormData) {
  const user = await requireWrite("agents");
  let target: string;
  try {
    const key = AgentKey.parse(form.get("agent"));
    const agent = AGENTS.find((a) => a.key === key)!;
    const raw: Record<string, unknown> = {};
    for (const k of Object.keys(agent.defaultParams)) raw[k] = form.get(`p_${k}`);
    const params = agent.paramSchema.parse(raw);
    if (key === "project_budget" && params.warnPct > params.criticalPct) throw new Error("Warning % must not exceed critical %");
    const db = await getDb();
    const before = (await loadAgentRules(db)).find((s) => s.agent.key === key)?.params;
    await db
      .insert(agentRules)
      .values({ agent: key, enabled: true, params, updatedAt: new Date() })
      .onConflictDoUpdate({ target: agentRules.agent, set: { params, updatedAt: new Date() } });
    await audit(db, user.id, "update", "agent_rule", null, { agent: key, before, after: params });
    target = back("ok", `${agent.name}: settings saved (applied on the next run)`);
  } catch (e) {
    target = back("err", errMsg(e));
  }
  refresh();
  redirect(target);
}
