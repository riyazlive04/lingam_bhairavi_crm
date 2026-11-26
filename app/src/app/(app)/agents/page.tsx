import Link from "next/link";
import { desc, eq, gte, sql } from "drizzle-orm";
import { Bot, Clock, History, Play, Zap } from "lucide-react";
import { getDb } from "@/db";
import { agentRuns, alerts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { ROLES } from "@/lib/constants";
import { fmtDateTime, qty, todayIST } from "@/lib/format";
import { loadAgentRules } from "@/lib/agents";
import { istDayStart, monthStart } from "@/lib/agents/rules";
import { SubmitButton } from "@/components/submit-button";
import { Field, Flash, Input, PageHeader } from "@/components/ui";
import { Callout, KeyValueGrid, Metric, MetricStrip, ResponsiveTable, SectionCard, StatusPill, SummaryRows, type Column } from "@/components/patterns";
import { runAgentAction, runAllAgentsAction, saveAgentParamsAction, toggleAgentAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Automation agents" };

const hours = (min: number) => (min >= 60 ? `${qty(Math.round((min / 60) * 10) / 10)} h` : `${Math.round(min)} min`);
const triggerLabel = (t: string) => (t === "cron" ? "Scheduled" : t === "manual" ? "Run by hand" : t.charAt(0).toUpperCase() + t.slice(1));

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("agents");
  const sp = await searchParams;
  const db = await getDb();
  const admin = canWrite(user.role, "agents");
  const today = todayIST();
  const monthFrom = istDayStart(monthStart(today));

  const [rules, lastRuns, openCounts, monthMinutes, allTime, history] = await Promise.all([
    loadAgentRules(db),
    db.selectDistinctOn([agentRuns.agent]).from(agentRuns).orderBy(agentRuns.agent, desc(agentRuns.startedAt)),
    db.select({ agent: alerts.agent, n: sql<number>`count(*)`.mapWith(Number) }).from(alerts).where(eq(alerts.status, "open")).groupBy(alerts.agent),
    db.select({ agent: agentRuns.agent, m: sql<number>`coalesce(sum(${agentRuns.minutesSaved}),0)`.mapWith(Number), runs: sql<number>`count(*)`.mapWith(Number) })
      .from(agentRuns).where(gte(agentRuns.startedAt, monthFrom)).groupBy(agentRuns.agent),
    db.select({ m: sql<number>`coalesce(sum(${agentRuns.minutesSaved}),0)`.mapWith(Number), emails: sql<number>`coalesce(sum(${agentRuns.emailsQueued}),0)`.mapWith(Number), alerts: sql<number>`coalesce(sum(${agentRuns.alertsCreated}),0)`.mapWith(Number) }).from(agentRuns),
    db.select().from(agentRuns).orderBy(desc(agentRuns.startedAt), desc(agentRuns.id)).limit(50),
  ]);
  const lastBy = new Map(lastRuns.map((r) => [r.agent, r]));
  const openBy = new Map(openCounts.map((r) => [r.agent, r.n]));
  const monthBy = new Map(monthMinutes.map((r) => [r.agent, r.m]));
  const monthTotal = monthMinutes.reduce((s, r) => s + r.m, 0);
  const openTotal = openCounts.reduce((s, r) => s + r.n, 0);
  const lastAny = lastRuns.reduce<Date | null>((d, r) => (!d || r.startedAt > d ? r.startedAt : d), null);
  const nameOf = new Map(rules.map((r) => [r.agent.key, r.agent.name]));

  type Run = (typeof history)[number];
  const runCols: Column<Run>[] = [
    { key: "agent", header: "Agent", card: "title", nowrap: true, cell: (r) => <span className="font-medium text-ink">{nameOf.get(r.agent) ?? r.agent}</span> },
    { key: "when", header: "When", card: "subtitle", nowrap: true, cell: (r) => fmtDateTime(r.startedAt) },
    { key: "status", header: "Status", card: "badge", cell: (r) => <StatusPill status={r.status} /> },
    { key: "trigger", header: "Trigger", nowrap: true, cell: (r) => <StatusPill semantic={r.trigger === "cron" ? "progress" : "neutral"} label={triggerLabel(r.trigger)} noDot /> },
    { key: "new", header: "New", align: "right", cell: (r) => r.alertsCreated },
    { key: "resolved", header: "Resolved", align: "right", cell: (r) => r.alertsResolved },
    { key: "emails", header: "Emails", align: "right", priority: 3, cell: (r) => r.emailsQueued },
    { key: "saved", header: "Saved", align: "right", card: "amount", nowrap: true, cell: (r) => hours(r.minutesSaved) },
    { key: "summary", header: "Summary", priority: 3, className: "max-w-md whitespace-normal text-caption text-ink-soft", cell: (r) => r.summary || "-" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Automation agents"
        subtitle="Rule-based agents that check your data every morning and tell the right person what needs doing."
        actions={admin ? (
          <form action={runAllAgentsAction}>
            <SubmitButton pendingText="Running agents…"><Play className="icon-sm" aria-hidden /> Run all agents now</SubmitButton>
          </form>
        ) : null}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <Callout tone="info" icon={Zap} title={`About ${hours(monthTotal)} of manual checking saved this month`}>
        These agents are rule-based and use no AI credits. Each one is a fixed set of database checks (dates, quantities, amounts) that runs
        daily at 8:00 AM IST and whenever you run it. Time saved is estimated from the minutes a person would spend finding each issue by hand.
        Only new findings, emails and automatic updates count, so running an agent again never inflates it.
      </Callout>

      <MetricStrip>
        <Metric label="Hours saved (all time)" value={hours(allTime[0]?.m ?? 0)} icon={Clock} hint={`${hours(monthTotal)} this month`} />
        <Metric label="Open alerts" value={qty(openTotal)} href="/alerts" tone={openTotal ? "warn" : "good"} hint="Waiting for someone to act" />
        <Metric label="Reminder emails sent" value={qty(allTime[0]?.emails ?? 0)} href={canRead(user.role, "emails") ? "/emails" : undefined} hint="Queued by the agents" />
        <Metric label="Last run" value={<span className="text-base leading-8">{lastAny ? fmtDateTime(lastAny) : "Never"}</span>} hint="Daily at 08:00 IST" />
      </MetricStrip>

      <div className="grid gap-4 lg:grid-cols-2">
        {rules.map(({ agent, enabled, params }) => {
          const last = lastBy.get(agent.key);
          const paramKeys = Object.keys(agent.defaultParams);
          return (
            <SectionCard
              key={agent.key}
              icon={Bot}
              title={agent.name}
              description={`Owned by ${ROLES[agent.ownerRole]}`}
              actions={<StatusPill semantic={enabled ? "success" : "neutral"} label={enabled ? "On" : "Off"} />}
            >
              <p className="text-sm text-ink-soft">{agent.description}</p>
              <KeyValueGrid className="mt-4" columns={3} items={[
                { label: "Open alerts", value: <Link className="text-brand-700 hover:underline dark:text-brand-300" href={`/alerts?agent=${agent.key}`}>{openBy.get(agent.key) ?? 0}</Link> },
                { label: "Saved this month", value: hours(monthBy.get(agent.key) ?? 0) },
                { label: "Per finding", value: `About ${agent.minutesSavedPerAlert} min` },
              ]} />
              <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-muted px-3 py-2 text-caption text-ink-soft">
                <Clock className="icon-xs" aria-hidden />
                {last
                  ? <>Last run {fmtDateTime(last.startedAt)} ({triggerLabel(last.trigger).toLowerCase()}) <StatusPill status={last.status} /> <span className="min-w-0">{last.summary}</span></>
                  : "Not run yet"}
              </div>

              {paramKeys.length > 0 && (admin ? (
                <form action={saveAgentParamsAction} className="mt-4 space-y-3">
                  <input type="hidden" name="agent" value={agent.key} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    {paramKeys.map((k) => {
                      const m = agent.paramMeta[k];
                      return (
                        <Field key={k} label={m.label} hint={m.hint}>
                          <Input name={`p_${k}`} type="number" inputMode="numeric" required min={m.min ?? 0} max={m.max} step={m.step ?? 1} defaultValue={params[k]} className="text-right" />
                        </Field>
                      );
                    })}
                  </div>
                  <SubmitButton size="sm" variant="secondary">Save settings</SubmitButton>
                </form>
              ) : (
                <SummaryRows className="mt-4" rows={paramKeys.map((k) => [agent.paramMeta[k].label, params[k]])} />
              ))}

              {admin && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                  <form action={runAgentAction}>
                    <input type="hidden" name="agent" value={agent.key} />
                    <SubmitButton size="sm" pendingText="Running…"><Play className="icon-xs" aria-hidden /> Run now</SubmitButton>
                  </form>
                  <form action={toggleAgentAction}>
                    <input type="hidden" name="agent" value={agent.key} />
                    <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
                    <SubmitButton size="sm" variant="ghost" pendingText={enabled ? "Turning off…" : "Turning on…"} aria-pressed={enabled}>{enabled ? "Turn off" : "Turn on"}</SubmitButton>
                  </form>
                </div>
              )}
            </SectionCard>
          );
        })}
      </div>

      <SectionCard title="Run history" icon={History} count={history.length} flush={history.length > 0}
        description="The latest 50 runs"
        empty={history.length === 0 && (admin ? "No runs yet. Use \"Run all agents now\" to run them for the first time." : "No runs yet. Agents run automatically every morning.")}>
        <ResponsiveTable flush rows={history} columns={runCols} rowKey={(r) => r.id} caption="Agent run history" />
      </SectionCard>
    </div>
  );
}
