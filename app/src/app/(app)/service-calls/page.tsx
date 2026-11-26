import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, inArray, or, type SQL } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, CircleDot, Hammer, Play, Plus, UserCheck, Wrench } from "lucide-react";
import { getDb } from "@/db";
import { amcContracts, customers, serviceCalls, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDateTime, money0 } from "@/lib/format";
import { CALL_PRIORITIES, slaState, systemLabel, type CallPriority } from "@/lib/amc";
import { Badge, Flash, LinkButton, Select, cx } from "@/components/ui";
import { ListEmpty, ListFilters, ListPage, Metric, MetricStrip, SectionCard, StatusPill } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { amcAccess } from "../amc/_lib/access";
import { SlaChip } from "./_components/sla-chip";
import { updateCallStatus } from "./actions";

export const metadata = { title: "Service calls" };

type SP = { q?: string; customerId?: string; engineerId?: string; priority?: string; mine?: string; ok?: string; err?: string };
const COLUMNS = [
  { key: "open", title: "Open", statuses: ["open"], icon: CircleDot, empty: "No open calls. New calls land here until someone takes them." },
  { key: "assigned", title: "Assigned", statuses: ["assigned"], icon: UserCheck, empty: "No calls waiting to start." },
  { key: "in_progress", title: "In progress", statuses: ["in_progress"], icon: Hammer, empty: "Nobody is working on a call right now." },
  { key: "resolved", title: "Resolved (30 days)", statuses: ["resolved", "closed"], icon: CheckCircle2, empty: "No calls resolved in the last 30 days." },
] as const;
const truncateText = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };

export default async function ServiceCallsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("amc");
  const sp = await searchParams;
  const db = await getDb();
  const acc = amcAccess(user.role);
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86400_000);

  const conds: SQL[] = [or(inArray(serviceCalls.status, ["open", "assigned", "in_progress"]), gte(serviceCalls.resolvedAt, since))!];
  const q = sp.q?.trim();
  if (q) {
    const like = `%${q}%`;
    const c = or(ilike(serviceCalls.number, like), ilike(customers.name, like), ilike(serviceCalls.description, like), ilike(serviceCalls.reportedBy, like));
    if (c) conds.push(c);
  }
  const customerId = Number(sp.customerId) || 0;
  if (customerId) conds.push(eq(serviceCalls.customerId, customerId));
  const engineerId = sp.mine === "1" ? user.id : Number(sp.engineerId) || 0;
  if (engineerId) conds.push(eq(serviceCalls.engineerId, engineerId));
  if (sp.priority && sp.priority in CALL_PRIORITIES) conds.push(eq(serviceCalls.priority, sp.priority));

  const [rows, customerList, engineerList] = await Promise.all([
    db
      .select({
        id: serviceCalls.id, number: serviceCalls.number, status: serviceCalls.status, priority: serviceCalls.priority, system: serviceCalls.system,
        description: serviceCalls.description, raisedAt: serviceCalls.raisedAt, dueBy: serviceCalls.dueBy, resolvedAt: serviceCalls.resolvedAt,
        engineerId: serviceCalls.engineerId, chargeable: serviceCalls.chargeable, chargeAmount: serviceCalls.chargeAmount,
        customerName: customers.name, engineerName: users.name, contractNumber: amcContracts.number,
      })
      .from(serviceCalls)
      .innerJoin(customers, eq(customers.id, serviceCalls.customerId))
      .leftJoin(users, eq(users.id, serviceCalls.engineerId))
      .leftJoin(amcContracts, eq(amcContracts.id, serviceCalls.contractId))
      .where(and(...conds))
      .orderBy(asc(serviceCalls.dueBy), desc(serviceCalls.id))
      .limit(400),
    db.selectDistinct({ id: customers.id, name: customers.name }).from(customers).innerJoin(serviceCalls, eq(serviceCalls.customerId, customers.id)).orderBy(asc(customers.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "engineer")).orderBy(asc(users.name)),
  ]);

  const mineFirst = user.role === "engineer";
  const sorted = (list: typeof rows, resolved: boolean) => [...list].sort((a, b) => {
    if (mineFirst) {
      const am = a.engineerId === user.id ? 0 : 1, bm = b.engineerId === user.id ? 0 : 1;
      if (am !== bm) return am - bm;
    }
    if (resolved) return new Date(b.resolvedAt ?? 0).getTime() - new Date(a.resolvedAt ?? 0).getTime();
    const ad = a.dueBy ? new Date(a.dueBy).getTime() : Infinity, bd = b.dueBy ? new Date(b.dueBy).getTime() : Infinity;
    return ad - bd || (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  });
  const open = rows.filter((r) => r.status !== "resolved" && r.status !== "closed");
  const breached = open.filter((r) => slaState(r, now).state === "breached").length;
  const mine = open.filter((r) => r.engineerId === user.id).length;
  const resolved30 = rows.filter((r) => r.status === "resolved" || r.status === "closed");
  const metSla = resolved30.filter((r) => slaState(r, now).state === "met").length;
  const filtered = !!(q || customerId || engineerId || sp.priority);
  const nowMs = now.getTime();

  const activeFilters = [q, sp.customerId, sp.engineerId, sp.priority, sp.mine].filter(Boolean).length;

  return (
    <ListPage
      title="Service calls"
      subtitle={mineFirst ? "Your calls are shown first in every column. Red means the response deadline has passed." : "Breakdown and complaint calls. The response deadline comes from the customer's AMC, or 48 hours without one."}
      secondaryActions={<LinkButton variant="secondary" href="/amc">AMC contracts</LinkButton>}
      primaryAction={acc.write && <LinkButton href="/service-calls/new"><Plus className="icon-sm" aria-hidden /> Log a call</LinkButton>}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      stats={
        <MetricStrip>
          <Metric label="Open calls" value={open.length} icon={Wrench} hint={mineFirst ? `${mine} assigned to you` : undefined} />
          <Metric label="Past SLA" value={breached} icon={AlertTriangle} tone={breached ? "bad" : "good"} hint={breached ? "Needs attention now" : "All within time"} />
          <Metric label="Resolved in 30 days" value={resolved30.length} icon={CheckCircle2} hint={resolved30.length ? `${metSla} within SLA` : undefined} />
          {acc.money
            ? <Metric label="Chargeable (30 days)" value={money0(resolved30.filter((r) => r.chargeable).reduce((s, r) => s + Number(r.chargeAmount), 0))} hint="To invoice" />
            : <Metric label="Unassigned" value={open.filter((r) => !r.engineerId).length} tone={open.some((r) => !r.engineerId) ? "warn" : "default"} />}
        </MetricStrip>
      }
      filters={
        <ListFilters q={sp.q} placeholder="Call no, customer, problem" clearHref="/service-calls" activeCount={activeFilters}>
          <Select name="customerId" defaultValue={sp.customerId ?? ""} aria-label="Customer">
            <option value="">All customers</option>
            {customerList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select name="engineerId" defaultValue={sp.engineerId ?? ""} aria-label="Engineer">
            <option value="">All engineers</option>
            {engineerList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
          <Select name="priority" defaultValue={sp.priority ?? ""} aria-label="Priority">
            <option value="">Any priority</option>
            {Object.entries(CALL_PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {mineFirst && (
            <label className="inline-flex min-h-9.5 items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} className="icon-sm accent-brand-600" /> Only mine
            </label>
          )}
        </ListFilters>
      }
      density={false}
      isEmpty={rows.length === 0}
      empty={
        <ListEmpty filtered={filtered} noun="calls" clearHref="/service-calls" title={filtered ? undefined : "No service calls right now"}
          action={acc.write && <LinkButton href="/service-calls/new"><Plus className="icon-sm" aria-hidden /> Log a call</LinkButton>}>
          When a customer reports a breakdown, log it here so the response deadline is tracked.
        </ListEmpty>
      }
    >
      <div className="-mx-4 grid auto-cols-[85%] grid-flow-col gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid-flow-row sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const list = sorted(rows.filter((r) => (col.statuses as readonly string[]).includes(r.status)), col.key === "resolved");
          return (
            <SectionCard key={col.key} title={col.title} count={list.length} icon={col.icon} flush className="self-start" empty={list.length === 0 && col.empty}>
              <ul className="space-y-3 bg-muted/40 p-3">
                {list.map((r) => {
                  const isMine = r.engineerId === user.id;
                  const sla = slaState(r, now);
                  const canWork = acc.write && (acc.manage || !r.engineerId || isMine);
                  const late = sla.state === "breached" && col.key !== "resolved";
                  return (
                    <li key={r.id} className={cx("relative rounded-xl border bg-surface p-3 shadow-xs transition hover:border-line-strong hover:shadow-sm",
                      late ? "border-danger-line" : "border-line", isMine && "ring-1 ring-brand-500/40")}>
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/service-calls/${r.id}`} className="min-w-0 text-sm font-semibold text-brand-700 after:absolute after:inset-0 after:rounded-xl hover:underline dark:text-brand-300">{r.number}</Link>
                        <StatusPill status={r.priority} label={CALL_PRIORITIES[r.priority as CallPriority] ?? r.priority} />
                      </div>
                      <div className="mt-1 truncate text-sm font-medium text-ink">{r.customerName}</div>
                      <p className="mt-0.5 text-sm text-ink-soft">{truncateText(r.description, 110)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-caption text-ink-soft">
                        {r.system && <Badge tone="gray">{systemLabel(r.system)}</Badge>}
                        {r.contractNumber ? <StatusPill semantic="info" label="AMC" noDot /> : <StatusPill semantic="warning" label="Chargeable" noDot />}
                        <span>{r.engineerName ? (isMine ? "You" : r.engineerName) : "Unassigned"}</span>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                        {col.key === "resolved"
                          ? <span className={cx("text-caption", sla.state === "breached" ? "text-danger" : "text-success")}>{sla.label} · {fmtDateTime(r.resolvedAt)}</span>
                          : <SlaChip dueBy={r.dueBy ? new Date(r.dueBy).toISOString() : null} nowMs={nowMs} />}
                        {canWork && (col.key === "assigned" || (col.key === "open" && user.role === "engineer")) && (
                          <form action={updateCallStatus} className="relative z-[1]">
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="status" value="in_progress" />
                            <input type="hidden" name="back" value="board" />
                            <SubmitButton variant="secondary" pendingText="Starting…"><Play className="icon-sm" aria-hidden /> {col.key === "open" ? "Take and start" : "Start work"}</SubmitButton>
                          </form>
                        )}
                        {canWork && col.key === "in_progress" && (
                          <LinkButton variant="secondary" href={`/service-calls/${r.id}#resolve`} className="relative z-[1]"><CheckCircle2 className="icon-sm" aria-hidden /> Mark resolved</LinkButton>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          );
        })}
      </div>
    </ListPage>
  );
}
