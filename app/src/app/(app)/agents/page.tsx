import Link from "next/link";
import { desc, eq, gte, sql } from "drizzle-orm";
import { Bot, Clock, Play, Zap } from "lucide-react";
import { getDb } from "@/db";
import { agentRuns, alerts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { ROLES } from "@/lib/constants";
import { fmtDateTime, qty, todayIST } from "@/lib/format";
import { loadAgentRules } from "@/lib/agents";
import { istDayStart, monthStart } from "@/lib/agents/rules";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, EmptyState, Flash, Input, PageHeader, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
import { runAgentAction, runAllAgentsAction, saveAgentParamsAction, toggleAgentAction } from "./actions";

export const dynamic = "force-dynamic";

const hours = (min: number) => (min >= 60 ? `${qty(Math.round((min / 60) * 10) / 10)} h` : `${Math.round(min)} min`);

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

  return (
    <>
      <PageHeader
        title="Automation Center"
        subtitle="Rule-based agents that check your data every morning and tell the right person what needs doing."
        actions={admin ? (
          <form action={runAllAgentsAction}>
            <SubmitButton pendingText="Running agents…"><Play className="h-4 w-4" aria-hidden /> Run all agents now</SubmitButton>
          </form>
        ) : null}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <section className="mb-6 rounded-xl border border-brand-200 bg-brand-50 p-4 text-ink dark:border-brand-800 dark:bg-brand-800/20" aria-labelledby="saved-h">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-600 text-white"><Zap className="h-6 w-6" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h2 id="saved-h" className="text-lg font-semibold">≈ {hours(monthTotal)} of manual checking saved this month</h2>
            <p className="mt-1 text-sm text-ink-soft">
              These agents are <b className="text-ink">rule-based — zero AI credits</b>. Each one is a fixed set of database checks
              (dates, quantities, amounts) that runs daily at 8:00 AM IST and on demand. Time saved is estimated from the minutes a person
              would spend finding each issue by hand; only <i>new</i> findings, emails and automatic updates count, so re-runs never inflate it.
            </p>
          </div>
        </div>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Hours saved (all time)" value={hours(allTime[0]?.m ?? 0)} />
        <Stat label="Open alerts" value={qty(openTotal)} href="/alerts" tone={openTotal ? "warn" : "good"} />
        <Stat label="Reminder emails sent" value={qty(allTime[0]?.emails ?? 0)} href={canRead(user.role, "emails") ? "/emails" : undefined} />
        <Stat label="Last run" value={<span className="text-base">{lastAny ? fmtDateTime(lastAny) : "Never"}</span>} hint="Daily at 08:00 IST" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {rules.map(({ agent, enabled, params }) => {
          const last = lastBy.get(agent.key);
          const paramKeys = Object.keys(agent.defaultParams);
          return (
            <Card
              key={agent.key}
              title={<span className="flex items-center gap-2"><Bot className="h-4 w-4 text-brand-600" aria-hidden />{agent.name}</span>}
              actions={<Badge tone={enabled ? "green" : "gray"}>{enabled ? "Enabled" : "Disabled"}</Badge>}
            >
              <p className="text-sm text-ink-soft">{agent.description}</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-ink-soft">Owner</dt><dd className="font-medium text-ink">{ROLES[agent.ownerRole]}</dd></div>
                <div><dt className="text-xs text-ink-soft">Open alerts</dt><dd className="font-medium text-ink"><Link className="hover:text-brand-700 hover:underline" href={`/alerts?agent=${agent.key}`}>{openBy.get(agent.key) ?? 0}</Link></dd></div>
                <div><dt className="text-xs text-ink-soft">Saved this month</dt><dd className="font-medium text-ink">{hours(monthBy.get(agent.key) ?? 0)}</dd></div>
                <div><dt className="text-xs text-ink-soft">Per finding</dt><dd className="font-medium text-ink">~{agent.minutesSavedPerAlert} min</dd></div>
              </dl>
              <div className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-ink-soft">
                <Clock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                {last ? <>Last run {fmtDateTime(last.startedAt)} ({last.trigger}) · <StatusBadge status={last.status} /> {last.summary}</> : "Not run yet"}
              </div>

              {paramKeys.length > 0 && (admin ? (
                <form action={saveAgentParamsAction} className="mt-4 space-y-3">
                  <input type="hidden" name="agent" value={agent.key} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    {paramKeys.map((k) => {
                      const m = agent.paramMeta[k];
                      const id = `${agent.key}-${k}`;
                      return (
                        <div key={k}>
                          <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink">{m.label}</label>
                          <Input id={id} name={`p_${k}`} type="number" inputMode="numeric" required min={m.min ?? 0} max={m.max} step={m.step ?? 1} defaultValue={params[k]} />
                          {m.hint && <span className="mt-0.5 block text-xs text-ink-soft">{m.hint}</span>}
                        </div>
                      );
                    })}
                  </div>
                  <SubmitButton size="sm" variant="secondary">Save settings</SubmitButton>
                </form>
              ) : (
                <ul className="mt-4 space-y-1 text-sm">
                  {paramKeys.map((k) => (
                    <li key={k} className="flex justify-between gap-3 border-b border-line py-1 last:border-0">
                      <span className="text-ink-soft">{agent.paramMeta[k].label}</span><span className="font-medium tabular-nums text-ink">{params[k]}</span>
                    </li>
                  ))}
                </ul>
              ))}

              {admin && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                  <form action={runAgentAction}>
                    <input type="hidden" name="agent" value={agent.key} />
                    <SubmitButton size="sm" pendingText="Running…"><Play className="h-3.5 w-3.5" aria-hidden /> Run now</SubmitButton>
                  </form>
                  <form action={toggleAgentAction}>
                    <input type="hidden" name="agent" value={agent.key} />
                    <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
                    <SubmitButton size="sm" variant="ghost" pendingText="…" aria-pressed={enabled}>{enabled ? "Disable" : "Enable"}</SubmitButton>
                  </form>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-ink">Run history</h2>
      {history.length === 0 ? (
        <EmptyState title="No runs yet">{admin ? "Click “Run all agents now” to run them for the first time." : "Agents run automatically every morning."}</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr><Th>When</Th><Th>Agent</Th><Th>Trigger</Th><Th>Status</Th><Th className="text-right">New</Th><Th className="text-right">Resolved</Th><Th className="text-right">Emails</Th><Th className="text-right">Saved</Th><Th>Summary</Th></tr>
          </thead>
          <tbody>
            {history.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap">{fmtDateTime(r.startedAt)}</Td>
                <Td className="whitespace-nowrap">{nameOf.get(r.agent) ?? r.agent}</Td>
                <Td><Badge tone={r.trigger === "cron" ? "violet" : "gray"}>{r.trigger}</Badge></Td>
                <Td><StatusBadge status={r.status} /></Td>
                <Td className="text-right tabular-nums">{r.alertsCreated}</Td>
                <Td className="text-right tabular-nums">{r.alertsResolved}</Td>
                <Td className="text-right tabular-nums">{r.emailsQueued}</Td>
                <Td className="text-right tabular-nums">{hours(r.minutesSaved)}</Td>
                <Td className="max-w-md whitespace-normal text-xs text-ink-soft">{r.summary}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
