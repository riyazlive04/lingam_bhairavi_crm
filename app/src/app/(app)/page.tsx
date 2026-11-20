/** Dashboard — role-aware KPIs, what needs attention, pending deliveries, refills, recent quotes, sales vs quotes. */
import Link from "next/link";
import { and, desc, eq, gte, inArray, ne, notInArray, sql } from "drizzle-orm";
import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import { getDb, type DB } from "@/db";
import { agentRuns, alerts, customers, extinguisherAssets, projects, purchaseInvoices, quotations, salesInvoices, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canSeeCost } from "@/lib/rbac";
import { ROLES, type Role } from "@/lib/constants";
import { addDays, daysBetween, fmtDate, money0, moneyShort, pct, qty, todayIST } from "@/lib/format";
import { lastMonths, istDayStart, monthStart, describeDue } from "@/lib/agents/rules";
import { pendingDeliveryCounts, pendingDeliveryLines, refillsDueByCustomer, topAlerts } from "@/lib/agents/queries";
import { projectCosts } from "@/lib/agents/hygiene";
import { Card, EmptyState, PageHeader, Stat, StatusBadge, Table, Td, Th, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

const n = (v: unknown) => Number(v ?? 0) || 0;

async function quoteKpis(db: DB, today: string) {
  const yearAgo = addDays(today, -365);
  const [r] = await db
    .select({
      pipeline: sql<number>`coalesce(sum(${quotations.grandTotal}) filter (where ${quotations.status} in ('sent','negotiation')),0)`.mapWith(Number),
      pipelineCount: sql<number>`count(*) filter (where ${quotations.status} in ('sent','negotiation'))`.mapWith(Number),
      thisMonth: sql<number>`count(*) filter (where ${quotations.quoteDate} >= ${monthStart(today)}::date)`.mapWith(Number),
      thisMonthValue: sql<number>`coalesce(sum(${quotations.grandTotal}) filter (where ${quotations.quoteDate} >= ${monthStart(today)}::date),0)`.mapWith(Number),
      won: sql<number>`count(*) filter (where ${quotations.status} = 'won' and ${quotations.quoteDate} >= ${yearAgo}::date)`.mapWith(Number),
      decided: sql<number>`count(*) filter (where ${quotations.status} in ('won','lost','expired') and ${quotations.quoteDate} >= ${yearAgo}::date)`.mapWith(Number),
      fuOverdue: sql<number>`count(*) filter (where ${quotations.status} in ('sent','negotiation') and ${quotations.nextFollowUpDate} < ${today}::date)`.mapWith(Number),
      fuToday: sql<number>`count(*) filter (where ${quotations.status} in ('sent','negotiation') and ${quotations.nextFollowUpDate} = ${today}::date)`.mapWith(Number),
    })
    .from(quotations);
  return r;
}

async function receivableKpis(db: DB, today: string) {
  const [r] = await db
    .select({
      outstanding: sql<number>`coalesce(sum(${salesInvoices.total} - ${salesInvoices.paidAmount}),0)`.mapWith(Number),
      overdue: sql<number>`coalesce(sum(${salesInvoices.total} - ${salesInvoices.paidAmount}) filter (where ${salesInvoices.dueDate} < ${today}::date),0)`.mapWith(Number),
      overdueCount: sql<number>`count(*) filter (where ${salesInvoices.dueDate} < ${today}::date)`.mapWith(Number),
    })
    .from(salesInvoices)
    .where(and(inArray(salesInvoices.status, ["issued", "partially_paid"]), sql`${salesInvoices.total} - ${salesInvoices.paidAmount} > 0.5`));
  return r;
}

async function payableKpis(db: DB, today: string) {
  const [r] = await db
    .select({
      due: sql<number>`coalesce(sum(${purchaseInvoices.total} - ${purchaseInvoices.paidAmount}),0)`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(purchaseInvoices)
    .innerJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId))
    .where(and(
      eq(purchaseInvoices.status, "posted"),
      sql`${purchaseInvoices.total} - ${purchaseInvoices.paidAmount} > 0.5`,
      sql`coalesce(${purchaseInvoices.dueDate}, ${purchaseInvoices.invoiceDate} + ${vendors.paymentTermsDays}) <= ${addDays(today, 7)}::date`,
    ));
  return r;
}

async function refillKpis(db: DB, today: string) {
  const [r] = await db
    .select({
      units: sql<number>`coalesce(sum(${extinguisherAssets.qty}),0)`.mapWith(Number),
      customers: sql<number>`count(distinct ${extinguisherAssets.customerId})`.mapWith(Number),
      overdue: sql<number>`coalesce(sum(${extinguisherAssets.qty}) filter (where ${extinguisherAssets.nextDueDate} < ${today}::date),0)`.mapWith(Number),
    })
    .from(extinguisherAssets)
    .where(and(eq(extinguisherAssets.status, "active"), sql`${extinguisherAssets.nextDueDate} <= ${addDays(today, 10)}::date`));
  return r;
}

async function projectKpis(db: DB) {
  const rows = await db.select({ id: projects.id, cv: projects.contractValue }).from(projects).where(eq(projects.status, "active"));
  const costs = await projectCosts(db, rows.map((r) => r.id));
  const margins = rows.filter((r) => n(r.cv) > 0).map((r) => ((n(r.cv) - (costs.get(r.id)?.actual ?? 0)) / n(r.cv)) * 100);
  return { active: rows.length, avgMargin: margins.length ? margins.reduce((s, m) => s + m, 0) / margins.length : null };
}

async function openAlertCount(db: DB, agent: string) {
  const [r] = await db.select({ c: sql<number>`count(*)`.mapWith(Number) }).from(alerts).where(and(eq(alerts.agent, agent), eq(alerts.status, "open")));
  return r?.c ?? 0;
}

async function monthlySeries(db: DB, today: string) {
  const months = lastMonths(today, 6);
  const from = `${months[0]}-01`;
  const [q, s] = await Promise.all([
    db.select({ m: sql<string>`to_char(${quotations.quoteDate}, 'YYYY-MM')`, v: sql<number>`coalesce(sum(${quotations.grandTotal}),0)`.mapWith(Number) })
      .from(quotations).where(and(ne(quotations.status, "draft"), gte(quotations.quoteDate, from))).groupBy(sql`1`),
    db.select({ m: sql<string>`to_char(${salesInvoices.invoiceDate}, 'YYYY-MM')`, v: sql<number>`coalesce(sum(${salesInvoices.total}),0)`.mapWith(Number) })
      .from(salesInvoices).where(and(notInArray(salesInvoices.status, ["draft", "cancelled"]), gte(salesInvoices.invoiceDate, from))).groupBy(sql`1`),
  ]);
  const qm = new Map(q.map((r) => [r.m, r.v])), sm = new Map(s.map((r) => [r.m, r.v]));
  return months.map((m) => ({ month: m, quoted: qm.get(m) ?? 0, sales: sm.get(m) ?? 0 }));
}

export default async function Dashboard() {
  const user = await requireUser("dashboard");
  const db = await getDb();
  const today = todayIST();
  const role: Role = user.role;
  const money = canSeeCost(role);
  const show = {
    quotes: money && canRead(role, "quotations"),
    followups: canRead(role, "followups"),
    deliveries: canRead(role, "orders"),
    receivables: canRead(role, "billing"),
    payables: canRead(role, "purchases") && ["admin", "accounts", "purchase"].includes(role),
    refills: canRead(role, "refills"),
    projects: canRead(role, "projects"),
    stale: ["admin", "purchase", "sales"].includes(role),
    lowStock: ["admin", "purchase", "store"].includes(role),
    chart: money && canRead(role, "quotations"),
  };
  const none = Promise.resolve(null);

  const [qk, pd, rk, pk, rf, pj, stale, low, saved, attention, lines, refills, recent, series] = await Promise.all([
    show.quotes || show.followups ? quoteKpis(db, today) : none,
    show.deliveries ? pendingDeliveryCounts(db, today) : none,
    show.receivables ? receivableKpis(db, today) : none,
    show.payables ? payableKpis(db, today) : none,
    show.refills ? refillKpis(db, today) : none,
    show.projects ? projectKpis(db) : none,
    show.stale ? openAlertCount(db, "stale_price") : none,
    show.lowStock ? openAlertCount(db, "low_stock") : none,
    db.select({ m: sql<number>`coalesce(sum(${agentRuns.minutesSaved}),0)`.mapWith(Number) }).from(agentRuns).where(gte(agentRuns.startedAt, istDayStart(monthStart(today)))),
    topAlerts(db, user, 8),
    show.deliveries ? pendingDeliveryLines(db, 8) : Promise.resolve([]),
    show.refills ? refillsDueByCustomer(db, today, 10, 6) : Promise.resolve([]),
    canRead(role, "quotations")
      ? db.select({ id: quotations.id, number: quotations.number, status: quotations.status, quoteDate: quotations.quoteDate, grandTotal: quotations.grandTotal, customer: customers.name })
        .from(quotations).innerJoin(customers, eq(customers.id, quotations.customerId)).orderBy(desc(quotations.createdAt), desc(quotations.id)).limit(6)
      : Promise.resolve([]),
    show.chart ? monthlySeries(db, today) : Promise.resolve([]),
  ]);
  const hoursSaved = n(saved[0]?.m) / 60;

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} subtitle={`${ROLES[role]} · ${fmtDate(today)}`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {show.quotes && qk && (
          <>
            <Stat label="Open pipeline" value={moneyShort(qk.pipeline)} hint={`${qk.pipelineCount} quotes sent / negotiating`} href="/quotations?status=sent" />
            <Stat label="Quotes this month" value={qty(qk.thisMonth)} hint={`${moneyShort(qk.thisMonthValue)} · win rate ${qk.decided ? pct((qk.won / qk.decided) * 100, 0) : "—"} (12 mo)`} href="/quotations" />
          </>
        )}
        {show.followups && qk && (
          <Stat label="Follow-ups due" value={qty(qk.fuOverdue + qk.fuToday)} hint={`${qk.fuToday} today · ${qk.fuOverdue} overdue`} tone={qk.fuOverdue ? "bad" : qk.fuToday ? "warn" : "good"} href="/follow-ups" />
        )}
        {show.deliveries && pd && (
          <Stat label="Undelivered PO lines" value={qty(pd.total)} hint={`${pd.overdue} overdue · ${pd.orders} orders`} tone={pd.overdue ? "bad" : pd.total ? "warn" : "good"} href="/orders" />
        )}
        {show.receivables && rk && (
          <Stat label="Receivables" value={moneyShort(rk.outstanding)} hint={`${moneyShort(rk.overdue)} overdue (${rk.overdueCount} invoices)`} tone={rk.overdue ? "bad" : "default"} href="/billing" />
        )}
        {show.payables && pk && (
          <Stat label="Payables due ≤ 7 days" value={moneyShort(pk.due)} hint={`${pk.count} vendor bills (incl. overdue)`} tone={pk.count ? "warn" : "good"} href="/purchases" />
        )}
        {show.refills && rf && (
          <Stat label="Refills due ≤ 10 days" value={qty(rf.units)} hint={`${rf.customers} customers · ${rf.overdue} overdue`} tone={rf.overdue ? "bad" : rf.units ? "warn" : "good"} href="/refills" />
        )}
        {show.projects && pj && (
          <Stat label="Active projects" value={qty(pj.active)} hint={money ? `Avg margin ${pj.avgMargin == null ? "—" : pct(pj.avgMargin, 0)}` : undefined}
            tone={money && pj.avgMargin != null && pj.avgMargin < 10 ? "warn" : "default"} href="/projects" />
        )}
        {show.stale && stale != null && (
          <Stat label="Stale price alerts" value={qty(stale)} hint="Item groups to re-confirm" tone={stale ? "warn" : "good"} href="/alerts?agent=stale_price" />
        )}
        {show.lowStock && low != null && (
          <Stat label="Low stock items" value={qty(low)} hint="Below re-order level" tone={low ? "warn" : "good"} href="/alerts?agent=low_stock" />
        )}
        <Stat label="Hours saved by agents" value={`${qty(Math.round(hoursSaved * 10) / 10)} h`} hint="This month · zero AI credits" tone="good" href="/agents" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Needs attention" actions={<Link href="/alerts" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">All alerts</Link>} bodyClassName="p-0">
          {attention.length === 0 ? (
            <p className="p-4 text-sm text-ink-soft">All clear — the agents found nothing for you.</p>
          ) : (
            <ul className="divide-y divide-line">
              {attention.map((a) => (
                <li key={a.id}>
                  <Link href={a.link ?? "/alerts"} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-muted">
                    {a.severity === "critical" ? <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="Critical" />
                      : a.severity === "warning" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-label="Warning" />
                        : <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-label="Info" />}
                    <span className="min-w-0">
                      <span className="block text-sm text-ink">{a.title}</span>
                      {a.dueDate && <span className={cx("text-xs", a.dueDate < today ? "text-red-600" : "text-ink-soft")}>Due {fmtDate(a.dueDate)}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {show.deliveries && (
          <Card title="Pending deliveries" actions={<Link href="/orders" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">All orders</Link>} bodyClassName="p-0">
            {lines.length === 0 ? (
              <p className="p-4 text-sm text-ink-soft">Every customer PO line is delivered.</p>
            ) : (
              <ul className="divide-y divide-line">
                {lines.map((l) => {
                  const late = l.expected ? daysBetween(l.expected, today) : null;
                  return (
                    <li key={l.lineId}>
                      <Link href={`/orders/${l.orderId}`} className="flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-muted">
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">{l.description}</span>
                          <span className="block truncate text-xs text-ink-soft">{l.poNumber ? `PO ${l.poNumber}` : l.orderNumber} · {l.customer}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm tabular-nums text-ink">{qty(n(l.qty) - n(l.deliveredQty))} {l.uom}</span>
                          <span className={cx("block text-xs", late != null && late > 0 ? "font-medium text-red-600" : "text-ink-soft")}>
                            {l.expected ? describeDue(l.expected, today) : "no date"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {show.refills && (
          <Card title="Refills due (10 days)" actions={<Link href="/refills" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">Refill tracker</Link>} bodyClassName="p-0">
            {refills.length === 0 ? (
              <p className="p-4 text-sm text-ink-soft">No refills due in the next 10 days.</p>
            ) : (
              <ul className="divide-y divide-line">
                {refills.map((r) => (
                  <li key={r.customerId}>
                    <Link href={`/refills?customer=${r.customerId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted">
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{r.customer}</span>
                        <span className="block text-xs text-ink-soft">{r.units} extinguisher{r.units === 1 ? "" : "s"}{r.phone ? ` · ${r.phone}` : ""}</span>
                      </span>
                      <span className={cx("shrink-0 text-xs", r.due < today ? "font-medium text-red-600" : "text-ink-soft")}>{describeDue(r.due, today)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {recent.length > 0 && (
          <Card title="Recent quotations" actions={<Link href="/quotations" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">All quotations</Link>} bodyClassName="p-0">
            <Table className="rounded-none border-0 shadow-none">
              <thead><tr><Th>Quote</Th><Th>Customer</Th><Th>Status</Th>{money && <Th className="text-right">Value</Th>}</tr></thead>
              <tbody>
                {recent.map((q) => (
                  <tr key={q.id}>
                    <Td><Link href={`/quotations/${q.id}`} className="font-medium hover:text-brand-700 hover:underline">{q.number}</Link><div className="text-xs text-ink-soft">{fmtDate(q.quoteDate)}</div></Td>
                    <Td className="max-w-48 truncate">{q.customer}</Td>
                    <Td><StatusBadge status={q.status} /></Td>
                    {money && <Td className="text-right tabular-nums">{money0(q.grandTotal)}</Td>}
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>

      {show.chart && series.length > 0 && (
        <Card title="Monthly sales vs quotes (last 6 months)" className="mt-6">
          <SalesVsQuotesChart data={series} />
        </Card>
      )}
      {!show.chart && attention.length === 0 && lines.length === 0 && refills.length === 0 && recent.length === 0 && (
        <div className="mt-6"><EmptyState title="Nothing pending">Your daily summary will show here as work comes in.</EmptyState></div>
      )}
    </>
  );
}

/** Grouped bar chart, inline SVG (no chart library). Colours come from theme tokens so dark mode works. */
function SalesVsQuotesChart({ data }: { data: { month: string; quoted: number; sales: number }[] }) {
  const W = 640, H = 240, padL = 56, padR = 8, padT = 12, padB = 28;
  const max = Math.max(1, ...data.flatMap((d) => [d.quoted, d.sales]));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const groupW = (W - padL - padR) / data.length;
  const barW = Math.min(28, (groupW - 16) / 2);
  const label = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
  const bar = (x: number, v: number) => {
    const yy = y(v), h = H - padB - yy, r = Math.min(4, h, barW / 2);
    if (h <= 0) return "";
    return `M${x},${H - padB} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + barW - r} Q${x + barW},${yy} ${x + barW},${yy + r} V${H - padB} Z`;
  };
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const empty = data.every((d) => !d.quoted && !d.sales);

  return (
    <figure>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-ink-soft" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink-faint" /> Quoted (sent quotes)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> Sales (invoiced)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Bar chart of quoted value and invoiced sales for the last six months. Data table follows.">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-soft text-[11px]">{moneyShort(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const gx = padL + i * groupW + (groupW - (barW * 2 + 2)) / 2;
          return (
            <g key={d.month}>
              <path d={bar(gx, d.quoted)} className="fill-ink-faint"><title>{`${label(d.month)} quoted: ${money0(d.quoted)}`}</title></path>
              <path d={bar(gx + barW + 2, d.sales)} className="fill-brand-600"><title>{`${label(d.month)} sales: ${money0(d.sales)}`}</title></path>
              {/* larger invisible hit target for the native tooltip */}
              <rect x={padL + i * groupW} y={padT} width={groupW} height={H - padT - padB} fill="transparent">
                <title>{`${label(d.month)} — quoted ${money0(d.quoted)}, sales ${money0(d.sales)}`}</title>
              </rect>
              <text x={padL + i * groupW + groupW / 2} y={H - 8} textAnchor="middle" className="fill-ink-soft text-[11px]">{label(d.month)}</text>
            </g>
          );
        })}
        {empty && <text x={W / 2} y={H / 2} textAnchor="middle" className="fill-ink-faint text-[13px]">No quotes or invoices yet</text>}
      </svg>
      <figcaption className="sr-only">
        <table>
          <thead><tr><th>Month</th><th>Quoted</th><th>Sales</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.month}><td>{label(d.month)}</td><td>{money0(d.quoted)}</td><td>{money0(d.sales)}</td></tr>)}</tbody>
        </table>
      </figcaption>
    </figure>
  );
}

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

