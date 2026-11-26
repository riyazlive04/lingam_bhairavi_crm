import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, inArray, or, type SQL } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, Plus, Wrench } from "lucide-react";
import { getDb } from "@/db";
import { amcContracts, customers, serviceCalls, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDateTime, money0 } from "@/lib/format";
import { CALL_PRIORITIES, PRIORITY_TONE, slaState, systemLabel, type CallPriority } from "@/lib/amc";
import { Badge, Card, EmptyState, FilterBar, Flash, LinkButton, PageHeader, Select, Stat, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { amcAccess } from "../amc/_lib/access";
import { SlaChip } from "./_components/sla-chip";
import { updateCallStatus } from "./actions";

export const metadata = { title: "Service calls" };

type SP = { q?: string; customerId?: string; engineerId?: string; priority?: string; mine?: string; ok?: string; err?: string };
const COLUMNS = [
  { key: "open", title: "Open", statuses: ["open"] },
  { key: "assigned", title: "Assigned", statuses: ["assigned"] },
  { key: "in_progress", title: "In progress", statuses: ["in_progress"] },
  { key: "resolved", title: "Resolved (30 days)", statuses: ["resolved", "closed"] },
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

  return (
    <div>
      <PageHeader
        title="Service Calls"
        subtitle={mineFirst ? "Your calls are shown first in every column. Red means the response deadline has passed." : "Breakdown and complaint calls. The response deadline comes from the customer's AMC, or 48 hours without one."}
        actions={<>
          <LinkButton variant="secondary" href="/amc">AMC contracts</LinkButton>
          {acc.write && <LinkButton href="/service-calls/new"><Plus className="h-4 w-4" aria-hidden /> Log call</LinkButton>}
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open calls" value={open.length} icon={Wrench} hint={mineFirst ? `${mine} assigned to you` : undefined} />
        <Stat label="Past SLA" value={breached} icon={AlertTriangle} tone={breached ? "bad" : "good"} hint={breached ? "needs attention now" : "all within time"} />
        <Stat label="Resolved in 30 days" value={resolved30.length} icon={CheckCircle2} hint={resolved30.length ? `${metSla} within SLA` : undefined} />
        {acc.money
          ? <Stat label="Chargeable (30 days)" value={money0(resolved30.filter((r) => r.chargeable).reduce((s, r) => s + Number(r.chargeAmount), 0))} hint="to invoice" />
          : <Stat label="Unassigned" value={open.filter((r) => !r.engineerId).length} tone={open.some((r) => !r.engineerId) ? "warn" : "default"} />}
      </div>

      <FilterBar q={sp.q} placeholder="Call no, customer, problem">
        <Select name="customerId" defaultValue={sp.customerId ?? ""} aria-label="Customer" className="sm:max-w-52">
          <option value="">All customers</option>
          {customerList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select name="engineerId" defaultValue={sp.engineerId ?? ""} aria-label="Engineer" className="sm:max-w-44">
          <option value="">All engineers</option>
          {engineerList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
        <Select name="priority" defaultValue={sp.priority ?? ""} aria-label="Priority" className="sm:max-w-36">
          <option value="">Any priority</option>
          {Object.entries(CALL_PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {mineFirst && (
          <label className="inline-flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} className="h-4 w-4 accent-brand-600" /> Only mine
          </label>
        )}
      </FilterBar>
      {filtered && <p className="-mt-2 mb-3 text-sm"><Link href="/service-calls" className="text-ink-soft hover:text-brand-700">Clear filters</Link></p>}

      {rows.length === 0 ? (
        <EmptyState icon={Wrench} title={filtered ? "No calls match these filters" : "No service calls right now"}
          action={acc.write && !filtered ? <LinkButton href="/service-calls/new">Log a call</LinkButton> : undefined}>
          {filtered ? "Try clearing a filter." : "When a customer reports a breakdown, log it here so the response deadline is tracked."}
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const list = sorted(rows.filter((r) => (col.statuses as readonly string[]).includes(r.status)), col.key === "resolved");
            return (
              <Card key={col.key} title={`${col.title} (${list.length})`} bodyClassName="space-y-3 bg-muted/40 p-3">
                {list.length === 0 && <p className="py-4 text-center text-sm text-ink-faint">Nothing here</p>}
                {list.map((r) => {
                  const isMine = r.engineerId === user.id;
                  const sla = slaState(r, now);
                  const canWork = acc.write && (acc.manage || !r.engineerId || isMine);
                  return (
                    <article key={r.id} className={cx("rounded-xl border bg-surface p-3 shadow-xs",
                      sla.state === "breached" && col.key !== "resolved" ? "border-red-400 dark:border-red-800" : "border-line", isMine && "ring-1 ring-brand-500/40")}>
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/service-calls/${r.id}`} className="min-w-0 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">{r.number}</Link>
                        <Badge tone={PRIORITY_TONE[r.priority as CallPriority] ?? "gray"}>{CALL_PRIORITIES[r.priority as CallPriority] ?? r.priority}</Badge>
                      </div>
                      <div className="mt-1 truncate text-sm font-medium text-ink">{r.customerName}</div>
                      <p className="mt-0.5 text-sm text-ink-soft">{truncateText(r.description, 110)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                        {r.system && <Badge tone="violet">{systemLabel(r.system)}</Badge>}
                        {r.contractNumber ? <Badge tone="blue">AMC</Badge> : <Badge tone="amber">Chargeable</Badge>}
                        <span>{r.engineerName ? (isMine ? "You" : r.engineerName) : "Unassigned"}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        {col.key === "resolved"
                          ? <span className={cx("text-xs", sla.state === "breached" ? "text-red-600" : "text-emerald-700 dark:text-emerald-400")}>{sla.label} · {fmtDateTime(r.resolvedAt)}</span>
                          : <SlaChip dueBy={r.dueBy ? new Date(r.dueBy).toISOString() : null} nowMs={nowMs} />}
                        {canWork && (col.key === "assigned" || (col.key === "open" && user.role === "engineer")) && (
                          <form action={updateCallStatus}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="status" value="in_progress" />
                            <input type="hidden" name="back" value="board" />
                            <SubmitButton size="sm" variant="secondary" pendingText="...">{col.key === "open" ? "Take and start" : "Start"}</SubmitButton>
                          </form>
                        )}
                        {canWork && col.key === "in_progress" && <LinkButton size="sm" variant="secondary" href={`/service-calls/${r.id}#resolve`}>Resolve</LinkButton>}
                      </div>
                    </article>
                  );
                })}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
