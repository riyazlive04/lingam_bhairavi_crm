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
import { EmptyState, Flash, Select, cx } from "@/components/ui";
import { FilterPills, ListEmpty, ListFilters, ListPage, Metric, MetricStrip, StatusPill, type FilterPillItem } from "@/components/patterns";
import { SelectAll } from "./_components/select-all";
import { bulkDoneAction, markAlertDoneAction, reopenAlertAction, snoozeAlertAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts" };

type SP = { agent?: string; severity?: string; status?: string; ok?: string; err?: string };
const SEVERITIES = ["critical", "warning", "info"] as const;
const STATUSES = ["open", "snoozed", "done", "all"] as const;
const STATUS_TEXT: Record<(typeof STATUSES)[number], string> = { open: "Open", snoozed: "Snoozed", done: "Done", all: "All" };
const SEVERITY_TEXT: Record<string, string> = { critical: "Critical", warning: "Warning", info: "Info" };

function SevIcon({ s }: { s: string }) {
  const cls = "grid h-8 w-8 shrink-0 place-items-center rounded-lg";
  if (s === "critical") return <span className={cx(cls, "bg-danger-soft text-danger")}><OctagonAlert className="icon-sm" aria-hidden /></span>;
  if (s === "warning") return <span className={cx(cls, "bg-warning-soft text-warning")}><AlertTriangle className="icon-sm" aria-hidden /></span>;
  return <span className={cx(cls, "bg-info-soft text-info")}><Info className="icon-sm" aria-hidden /></span>;
}

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

  const href = (patch: Partial<Record<"agent" | "severity" | "status", string | undefined>>) => {
    const p = new URLSearchParams();
    const next = { agent: agentKey, severity, status: status === "open" ? undefined : status, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return p.size ? `/alerts?${p.toString()}` : "/alerts";
  };
  const pills: FilterPillItem[] = STATUSES.map((s) => ({
    label: STATUS_TEXT[s], href: href({ status: s === "open" ? undefined : s }), active: status === s,
  }));
  const activeFilters = [agentKey, severity].filter(Boolean).length;
  const openTotal = (countBy.critical ?? 0) + (countBy.warning ?? 0) + (countBy.info ?? 0);

  return (
    <ListPage
      title="Alerts"
      subtitle={user.role === "admin" ? "Everything the automation agents found, for every team." : "What the automation agents found for you and your team."}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      stats={
        <MetricStrip>
          <Metric label="Open alerts" value={openTotal} href="/alerts" hint="Across every agent" />
          <Metric label="Critical" value={countBy.critical ?? 0} tone={countBy.critical ? "bad" : "default"} href={href({ severity: "critical", status: undefined })} hint="Handle these first" />
          <Metric label="Warning" value={countBy.warning ?? 0} tone={countBy.warning ? "warn" : "default"} href={href({ severity: "warning", status: undefined })} hint="Due soon" />
          <Metric label="Info" value={countBy.info ?? 0} href={href({ severity: "info", status: undefined })} hint="Good to know" />
        </MetricStrip>
      }
      filters={
        <>
          <FilterPills label="Filter by status" items={pills} />
          <ListFilters searchName={false} clearHref={href({ agent: undefined, severity: undefined })} activeCount={activeFilters}
            hidden={{ status: status === "open" ? undefined : status }}>
            <Select name="agent" defaultValue={agentKey ?? ""} aria-label="Agent">
              <option value="">All agents</option>
              {AGENTS.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
            </Select>
            <Select name="severity" defaultValue={severity ?? ""} aria-label="Severity">
              <option value="">All severities</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_TEXT[s]}</option>)}
            </Select>
          </ListFilters>
        </>
      }
      isEmpty={rows.length === 0}
      empty={status === "open" && activeFilters === 0
        ? (
          <EmptyState icon={CheckCircle2} title="All clear, nothing needs your attention">
            Agents check quotations, deliveries, refills, payments, prices and stock every morning. New findings appear here.
          </EmptyState>
        )
        : <ListEmpty filtered noun="alerts" clearHref="/alerts" />}
      density={false}
      resultSummary={`${rows.length}${rows.length === 300 ? "+" : ""} alert${rows.length === 1 ? "" : "s"} shown`}
    >
      <form>
        <input type="hidden" name="back" value={back} />
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          {actionable && (
            <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5 sm:px-5">
              <label className="flex min-h-9 items-center gap-2 text-sm font-medium text-ink-soft"><SelectAll /> Select all</label>
              <SubmitButton size="sm" variant="secondary" formAction={bulkDoneAction} pendingText="Updating…" className="ml-auto">
                <CheckCircle2 className="icon-sm" aria-hidden /> Mark selected done
              </SubmitButton>
            </div>
          )}
          <ul className="divide-y divide-line">
            {rows.map((a) => {
              const snoozedActive = a.status === "snoozed" && a.snoozedUntil != null && a.snoozedUntil > today;
              const late = a.dueDate != null && a.dueDate < today && a.status !== "done";
              return (
                <li key={a.id} className={cx("px-4 py-3.5 sm:px-5", a.severity === "critical" && a.status !== "done" && "border-l-4 border-l-danger")}>
                  <div className="flex gap-3">
                    {actionable && (
                      <label className="-m-1.5 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-muted">
                        <input type="checkbox" name="ids" value={a.id} aria-label={`Select: ${a.title}`} className="h-4 w-4 accent-brand-600" />
                      </label>
                    )}
                    <SevIcon s={a.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <StatusPill status={a.severity} label={SEVERITY_TEXT[a.severity] ?? a.severity} />
                        {a.status !== "open" && <StatusPill status={a.status} label={snoozedActive ? `Snoozed until ${fmtDate(a.snoozedUntil)}` : undefined} />}
                        <span className="text-caption text-ink-soft">{agentName.get(a.agent) ?? a.agent}</span>
                        {a.dueDate && <span className={cx("text-caption", late ? "font-medium text-danger" : "text-ink-soft")}>Due {fmtDate(a.dueDate)}</span>}
                      </div>
                      <p className="mt-1 font-medium text-ink">
                        {a.link ? <Link href={a.link} className="hover:text-brand-700 hover:underline dark:hover:text-brand-300">{a.title}</Link> : a.title}
                      </p>
                      {a.message && <p className="mt-0.5 text-sm text-ink-soft">{a.message}</p>}
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {a.link && (
                          <Link href={a.link} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-xs hover:border-line-strong hover:bg-muted">
                            Open <ExternalLink className="icon-xs" aria-hidden />
                          </Link>
                        )}
                        {a.status !== "done" ? (
                          <>
                            <SubmitButton size="sm" variant="success" formAction={markAlertDoneAction} name="id" value={String(a.id)} pendingText="Saving…">Mark done</SubmitButton>
                            <span className="ml-1 text-caption text-ink-soft" id={`snz-${a.id}`}>Snooze for</span>
                            {[1, 3, 7].map((d) => (
                              <SubmitButton key={d} size="sm" variant="ghost" formAction={snoozeAlertAction} name="snooze" value={`${a.id}:${d}`}
                                pendingText="Snoozing…" aria-describedby={`snz-${a.id}`}>{d} day{d === 1 ? "" : "s"}</SubmitButton>
                            ))}
                          </>
                        ) : (
                          <>
                            <span className="text-caption text-ink-soft">Resolved {fmtDateTime(a.resolvedAt)}</span>
                            <SubmitButton size="sm" variant="ghost" formAction={reopenAlertAction} name="reopen" value={String(a.id)} pendingText="Reopening…">Reopen</SubmitButton>
                          </>
                        )}
                        <span className="ml-auto text-caption text-ink-faint">Raised {fmtDate(a.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </form>
    </ListPage>
  );
}
