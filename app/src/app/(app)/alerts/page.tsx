import Link from "next/link";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, ExternalLink, Info, OctagonAlert } from "lucide-react";
import { getDb } from "@/db";
import { alerts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtDateTime, todayIST } from "@/lib/format";
import { AGENTS } from "@/lib/agents";
import { alertScope } from "@/lib/agents/scope";
import { SEVERITY_ORDER } from "@/lib/agents/queries";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, EmptyState, Flash, PageHeader, Select, StatusBadge, cx } from "@/components/ui";
import { SelectAll } from "./_components/select-all";
import { bulkDoneAction, markAlertDoneAction, reopenAlertAction, snoozeAlertAction } from "./actions";

export const dynamic = "force-dynamic";

type SP = { agent?: string; severity?: string; status?: string; ok?: string; err?: string };
const SEVERITIES = ["critical", "warning", "info"] as const;
const STATUSES = ["open", "snoozed", "done", "all"] as const;

const SevIcon = ({ s }: { s: string }) =>
  s === "critical" ? <OctagonAlert className="h-5 w-5 text-red-600" aria-hidden />
    : s === "warning" ? <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden />
      : <Info className="h-5 w-5 text-blue-600" aria-hidden />;

export default async function AlertsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("agents");
  const sp = await searchParams;
  const db = await getDb();
  const today = todayIST();

  const agentKey = AGENTS.some((a) => a.key === sp.agent) ? sp.agent : undefined;
  const severity = (SEVERITIES as readonly string[]).includes(sp.severity ?? "") ? sp.severity : undefined;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUSES)[number]) : "open";

  // "open" also shows snoozed alerts whose snooze has ended (the next agent run re-opens them formally)
  const statusCond: SQL | undefined =
    status === "open" ? sql`(${alerts.status} = 'open' or (${alerts.status} = 'snoozed' and ${alerts.snoozedUntil} <= ${today}::date))`
      : status === "snoozed" ? sql`(${alerts.status} = 'snoozed' and ${alerts.snoozedUntil} > ${today}::date)`
        : status === "done" ? eq(alerts.status, "done") : undefined;

  const where = and(alertScope(user), statusCond, agentKey ? eq(alerts.agent, agentKey) : undefined, severity ? eq(alerts.severity, severity) : undefined);
  const [rows, counts] = await Promise.all([
    db.select().from(alerts).where(where)
      .orderBy(...(status === "done" ? [desc(alerts.resolvedAt)] : [SEVERITY_ORDER, sql`${alerts.dueDate} asc nulls last`]), desc(alerts.createdAt))
      .limit(300),
    db.select({ severity: alerts.severity, n: sql<number>`count(*)`.mapWith(Number) }).from(alerts)
      .where(and(alertScope(user), eq(alerts.status, "open"))).groupBy(alerts.severity),
  ]);
  const countBy = Object.fromEntries(counts.map((c) => [c.severity, c.n])) as Record<string, number>;
  const agentName = new Map(AGENTS.map((a) => [a.key, a.name]));

  const qs = new URLSearchParams();
  if (agentKey) qs.set("agent", agentKey);
  if (severity) qs.set("severity", severity);
  if (status !== "open") qs.set("status", status);
  const back = `/alerts${qs.size ? "?" + qs.toString() : ""}`;
  const actionable = status !== "done";

  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle={user.role === "admin" ? "Everything the automation agents found, for every team." : "What the automation agents found for you and your team."}
        actions={
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="red">{countBy.critical ?? 0} critical</Badge>
            <Badge tone="amber">{countBy.warning ?? 0} warning</Badge>
            <Badge tone="blue">{countBy.info ?? 0} info</Badge>
          </div>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />

      <form method="get" className="mb-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center" aria-label="Filter alerts">
        <Select name="agent" defaultValue={agentKey ?? ""} aria-label="Agent" className="sm:w-56">
          <option value="">All agents</option>
          {AGENTS.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
        </Select>
        <Select name="severity" defaultValue={severity ?? ""} aria-label="Severity" className="sm:w-40">
          <option value="">All severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select name="status" defaultValue={status} aria-label="Status" className="sm:w-40">
          {STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
        </Select>
        <Button variant="secondary" type="submit">Filter</Button>
        {qs.size > 0 && <Link href="/alerts" className="text-sm text-ink-soft hover:text-brand-700">Clear</Link>}
      </form>

      {rows.length === 0 ? (
        <EmptyState title={status === "open" ? "All clear, nothing needs your attention" : "No alerts match these filters"}>
          Agents check quotations, deliveries, refills, payments, prices and stock every morning. New findings will appear here.
        </EmptyState>
      ) : (
        <form>
          <input type="hidden" name="back" value={back} />
          {actionable && (
            <div className="mb-2 flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
              <label className="flex items-center gap-2 text-sm text-ink-soft"><SelectAll /> Select all</label>
              <SubmitButton size="sm" variant="secondary" formAction={bulkDoneAction} pendingText="Updating…">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Mark selected done
              </SubmitButton>
              <span className="ml-auto text-xs text-ink-faint">{rows.length}{rows.length === 300 ? "+" : ""} shown</span>
            </div>
          )}
          <ul className="space-y-2">
            {rows.map((a) => {
              const snoozedActive = a.status === "snoozed" && a.snoozedUntil != null && a.snoozedUntil > today;
              return (
                <li key={a.id} className={cx("rounded-xl border bg-surface p-3 shadow-sm sm:p-4",
                  a.severity === "critical" && a.status !== "done" ? "border-red-300 dark:border-red-900" : "border-line")}>
                  <div className="flex gap-3">
                    {actionable && (
                      <input type="checkbox" name="ids" value={a.id} aria-label={`Select: ${a.title}`} className="mt-1 h-4 w-4 shrink-0 accent-brand-600" />
                    )}
                    <span className="mt-0.5 shrink-0"><SevIcon s={a.severity} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={a.severity} />
                        {a.status !== "open" && <StatusBadge status={a.status} label={snoozedActive ? `snoozed till ${fmtDate(a.snoozedUntil)}` : a.status} />}
                        <span className="text-xs text-ink-faint">{agentName.get(a.agent) ?? a.agent}</span>
                        {a.dueDate && <span className={cx("text-xs", a.dueDate < today ? "font-medium text-red-600" : "text-ink-soft")}>Due {fmtDate(a.dueDate)}</span>}
                      </div>
                      <p className="mt-1 font-medium text-ink">
                        {a.link ? <Link href={a.link} className="hover:text-brand-700 hover:underline">{a.title}</Link> : a.title}
                      </p>
                      {a.message && <p className="mt-0.5 text-sm text-ink-soft">{a.message}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {a.link && (
                          <Link href={a.link} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-sm text-ink hover:bg-muted">
                            Open <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          </Link>
                        )}
                        {a.status !== "done" ? (
                          <>
                            <SubmitButton size="sm" variant="success" formAction={markAlertDoneAction} name="id" value={String(a.id)} pendingText="…">Mark done</SubmitButton>
                            <span className="ml-1 text-xs text-ink-soft" id={`snz-${a.id}`}>Snooze:</span>
                            {[1, 3, 7].map((d) => (
                              <SubmitButton key={d} size="sm" variant="ghost" formAction={snoozeAlertAction} name="snooze" value={`${a.id}:${d}`}
                                pendingText="…" aria-label={`Snooze ${d} day${d === 1 ? "" : "s"}`} aria-describedby={`snz-${a.id}`}>{d}d</SubmitButton>
                            ))}
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-ink-soft">Resolved {fmtDateTime(a.resolvedAt)}</span>
                            <SubmitButton size="sm" variant="ghost" formAction={reopenAlertAction} name="reopen" value={String(a.id)} pendingText="…">Re-open</SubmitButton>
                          </>
                        )}
                        <span className="ml-auto text-xs text-ink-faint">Raised {fmtDate(a.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </form>
      )}
    </>
  );
}
