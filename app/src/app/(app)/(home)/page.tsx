/**
 * Home dashboard: a role-aware summary of the day. Hero (home only), metric strips grouped by what the
 * person does with them (today's focus, sales, money, operations), the attention list, a sales vs quotes
 * chart and the short lists. Every block only shows when the role can read that module.
 */
import Link from "next/link";
import { and, desc, eq, gte, inArray, ne, notInArray, sql } from "drizzle-orm";
import {
  AlertTriangle, BarChart3, Bell, CalendarDays, ClipboardCheck, Clock, FileText, FireExtinguisher, FolderKanban, Info, LineChart,
  OctagonAlert, PhoneCall, Plus, Receipt, ShoppingCart, Tags, TrendingUp, Truck, Wallet, Warehouse, Wrench, type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { getDb, type DB } from "@/db";
import { agentRuns, alerts, amcContracts, amcVisits, customers, extinguisherAssets, projects, purchaseInvoices, quotations, salesInvoices, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canSeeCost, canWrite } from "@/lib/rbac";
import { ROLES, type Role } from "@/lib/constants";
import { addDays, addMonths, daysBetween, fmtDate, money0, moneyShort, pct, qty, todayIST } from "@/lib/format";
import { lastMonths, istDayStart, monthStart, describeDue } from "@/lib/agents/rules";
import { pendingDeliveryCounts, pendingDeliveryLines, refillsDueByCustomer, topAlerts } from "@/lib/agents/queries";
import { projectCosts } from "@/lib/agents/hygiene";
import { monthlyPnl } from "@/lib/reports";
import { pendingQtyOf } from "@/lib/orders";
import { CardLink, EmptyState, buttonClass, cx } from "@/components/ui";
import { BarChart, Metric, MetricStrip, ResponsiveTable, SectionCard, StatusPill, type Column } from "@/components/patterns";

export const dynamic = "force-dynamic";

const n = (v: unknown) => Number(v ?? 0) || 0;
/** "Apr 26" (short) or "April 2026" for a "2026-04" month key. */
const chartMonth = (m: string, short = true) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: short ? "short" : "long", year: short ? "2-digit" : "numeric", timeZone: "UTC" });

async function quoteKpis(db: DB, today: string) {
  const yearAgo = addDays(today, -365);
  const [r] = await db
    .select({
      pipeline: sql<number>`coalesce(sum(${quotations.grandTotal}) filter (where ${quotations.status} in ('sent','negotiation')),0)`.mapWith(Number),
      pipelineCount: sql<number>`count(*) filter (where ${quotations.status} in ('sent','negotiation'))`.mapWith(Number),
      thisMonth: sql<number>`count(*) filter (where ${quotations.quoteDate} >= ${monthStart(today)}::date)`.mapWith(Number),
      thisMonthValue: sql<number>`coalesce(sum(${quotations.grandTotal}) filter (where ${quotations.quoteDate} >= ${monthStart(today)}::date),0)`.mapWith(Number),
      // same stretch of days last month, for the trend chip
      prevMonthValue: sql<number>`coalesce(sum(${quotations.grandTotal}) filter (where ${quotations.quoteDate} >= ${monthStart(addMonths(today, -1))}::date and ${quotations.quoteDate} <= ${addMonths(today, -1)}::date),0)`.mapWith(Number),
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

/** This month's business P&L so far (rule 18). */
async function profitKpi(db: DB, today: string) {
  const r = await monthlyPnl(db, { from: monthStart(today), to: today });
  return r.total;
}

async function approvalKpi(db: DB) {
  const [r] = await db.select({ c: sql<number>`count(*)`.mapWith(Number) }).from(quotations).where(eq(quotations.approvalStatus, "pending"));
  return r?.c ?? 0;
}

/** Preventive AMC visits still scheduled up to 7 days ahead (overdue ones included) on live contracts. */
async function amcKpi(db: DB, today: string) {
  const [r] = await db
    .select({
      due: sql<number>`count(*)`.mapWith(Number),
      overdue: sql<number>`count(*) filter (where ${amcVisits.scheduledDate} < ${today}::date)`.mapWith(Number),
    })
    .from(amcVisits)
    .innerJoin(amcContracts, eq(amcContracts.id, amcVisits.contractId))
    .where(and(eq(amcVisits.status, "scheduled"), eq(amcContracts.status, "active"), sql`${amcVisits.scheduledDate} <= ${addDays(today, 7)}::date`));
  return r ?? { due: 0, overdue: 0 };
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
    profit: money && canRead(role, "reports"),
    approval: role === "admin",
    amc: ["admin", "sales", "engineer"].includes(role),
  };
  const none = Promise.resolve(null);

  const [qk, pd, rk, pk, rf, pj, stale, low, saved, attention, lines, refills, recent, series, profit, approvals, amc] = await Promise.all([
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
    show.profit ? profitKpi(db, today) : none,
    show.approval ? approvalKpi(db) : none,
    show.amc ? amcKpi(db, today) : none,
  ]);
  const hoursSaved = n(saved[0]?.m) / 60;
  const firstName = user.name.split(" ")[0];
  const hourIST = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const greet = hourIST < 12 ? "Good morning" : hourIST < 17 ? "Good afternoon" : "Good evening";
  const longDate = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const critical = attention.filter((a) => a.severity === "critical").length;
  const quoteTrend = qk && qk.prevMonthValue > 0 ? ((qk.thisMonthValue - qk.prevMonthValue) / qk.prevMonthValue) * 100 : null;

  // Last full month of invoiced sales against the month before it (same data as the chart).
  const lastFull = series.length >= 2 ? series[series.length - 2] : null;
  const prevFull = series.length >= 3 ? series[series.length - 3] : null;
  const salesTrend = lastFull && prevFull && prevFull.sales > 0 ? ((lastFull.sales - prevFull.sales) / prevFull.sales) * 100 : null;
  const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" });

  // ------------------------------------------------------------------ metric groups
  const focus: ReactNode[] = [];
  if (show.approval && approvals != null) focus.push(
    <Metric key="appr" icon={ClipboardCheck} label="Awaiting your approval" value={qty(approvals)}
      hint={approvals ? "Quotes waiting before they can be sent" : "No quotes waiting"} tone={approvals ? "warn" : "good"} href="/quotations?approval=pending" />,
  );
  if (show.followups && qk) focus.push(
    <Metric key="fu" icon={PhoneCall} label="Follow-ups due" value={qty(qk.fuOverdue + qk.fuToday)}
      hint={`${qk.fuToday} today · ${qk.fuOverdue} overdue`} tone={qk.fuOverdue ? "bad" : qk.fuToday ? "warn" : "good"} href="/follow-ups" />,
  );
  if (show.amc && amc) focus.push(
    <Metric key="amc" icon={Wrench} label="AMC visits this week" value={qty(amc.due)}
      hint={amc.overdue ? `${amc.overdue} overdue` : "Next 7 days"} tone={amc.overdue ? "bad" : amc.due ? "warn" : "good"} href="/amc" />,
  );
  if (show.deliveries && pd) focus.push(
    <Metric key="del" icon={Truck} label="PO lines to deliver" value={qty(pd.total)}
      hint={`${pd.overdue} overdue across ${pd.orders} orders`} tone={pd.overdue ? "bad" : pd.total ? "warn" : "good"} href="/orders" />,
  );

  const sales: ReactNode[] = [];
  if (show.quotes && qk) {
    sales.push(
      <Metric key="pipe" icon={TrendingUp} label="Open pipeline" value={moneyShort(qk.pipeline)} hint={`${qk.pipelineCount} quotes sent or in negotiation`} href="/quotations?status=sent" />,
      <Metric key="qm" icon={FileText} label="Quoted this month" value={moneyShort(qk.thisMonthValue)}
        trend={quoteTrend == null ? undefined : { value: quoteTrend, goodWhen: "up", label: "vs same days last month" }}
        hint={`${qty(qk.thisMonth)} quotes · win rate ${qk.decided ? pct((qk.won / qk.decided) * 100, 0) : "-"} (12 months)`} href="/quotations" />,
    );
  }
  if (show.chart && lastFull) sales.push(
    <Metric key="inv" icon={Receipt} label={`Invoiced in ${monthName(lastFull.month)}`} value={moneyShort(lastFull.sales)}
      trend={salesTrend == null ? undefined : { value: salesTrend, goodWhen: "up", label: prevFull ? `vs ${monthName(prevFull.month)}` : undefined }}
      hint={salesTrend == null ? "Last full month" : undefined} />,
  );

  const moneyTiles: ReactNode[] = [];
  if (show.profit && profit) moneyTiles.push(
    <Metric key="pnl" icon={LineChart} label="Profit this month" value={moneyShort(profit.netProfit)}
      hint={`${moneyShort(profit.sales)} sales · gross ${moneyShort(profit.grossProfit)}${profit.sales ? ` (${pct(profit.grossMarginPct, 0)})` : ""}`}
      tone={profit.netProfit < 0 ? "bad" : profit.sales ? "good" : "default"} href="/reports?tab=pnl" />,
  );
  if (show.receivables && rk) moneyTiles.push(
    <Metric key="rcv" icon={Wallet} label="Receivables" value={moneyShort(rk.outstanding)}
      hint={`${moneyShort(rk.overdue)} overdue (${rk.overdueCount} invoices)`} tone={rk.overdue ? "bad" : "default"} href="/billing" />,
  );
  if (show.payables && pk) moneyTiles.push(
    <Metric key="pay" icon={ShoppingCart} label="Payables due in 7 days" value={moneyShort(pk.due)}
      hint={`${pk.count} vendor bills, overdue included`} tone={pk.count ? "warn" : "good"} href="/purchases" />,
  );

  const ops: ReactNode[] = [];
  if (show.refills && rf) ops.push(
    <Metric key="ref" icon={FireExtinguisher} label="Refills due in 10 days" value={qty(rf.units)}
      hint={`${rf.customers} customers · ${rf.overdue} overdue`} tone={rf.overdue ? "bad" : rf.units ? "warn" : "good"} href="/refills" />,
  );
  if (show.projects && pj) ops.push(
    <Metric key="prj" icon={FolderKanban} label="Active projects" value={qty(pj.active)}
      hint={money ? `Average margin ${pj.avgMargin == null ? "-" : pct(pj.avgMargin, 0)}` : "Open the list for site details"}
      tone={money && pj.avgMargin != null && pj.avgMargin < 10 ? "warn" : "default"} href="/projects" />,
  );
  if (show.stale && stale != null) ops.push(
    <Metric key="stale" icon={Tags} label="Prices to confirm again" value={qty(stale)} hint="Item groups with old prices" tone={stale ? "warn" : "good"} href="/alerts?agent=stale_price" />,
  );
  if (show.lowStock && low != null) ops.push(
    <Metric key="low" icon={Warehouse} label="Low stock items" value={qty(low)} hint="Below the reorder level" tone={low ? "warn" : "good"} href="/alerts?agent=low_stock" />,
  );

  const groups = [
    { id: "focus", title: "Today's focus", tiles: focus },
    { id: "sales", title: "Sales", tiles: sales },
    { id: "money", title: "Money", tiles: moneyTiles },
    { id: "ops", title: "Operations", tiles: ops },
  ].filter((g) => g.tiles.length > 0);

  type Recent = (typeof recent)[number];
  const recentCols: Column<Recent>[] = [
    { key: "no", header: "Quotation", card: "title", nowrap: true,
      cell: (q) => <Link href={`/quotations/${q.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{q.number}</Link> },
    { key: "customer", header: "Customer", card: "subtitle", className: "max-w-48 truncate", cell: (q) => q.customer },
    { key: "date", header: "Date", nowrap: true, priority: 3, cell: (q) => fmtDate(q.quoteDate) },
    { key: "status", header: "Status", card: "badge", cell: (q) => <StatusPill status={q.status} /> },
    ...(money ? [{ key: "value", header: "Value", align: "right" as const, card: "amount" as const, nowrap: true, cell: (q: Recent) => money0(q.grandTotal) }] : []),
  ];

  const sevIcon: Record<string, { icon: LucideIcon; cls: string; label: string }> = {
    critical: { icon: OctagonAlert, cls: "bg-danger-soft text-danger", label: "Critical" },
    warning: { icon: AlertTriangle, cls: "bg-warning-soft text-warning", label: "Warning" },
    info: { icon: Info, cls: "bg-info-soft text-info", label: "Info" },
  };

  const summary = attention.length === 0
    ? "Nothing urgent today, nice and calm."
    : critical > 0
      ? `${critical} critical item${critical === 1 ? "" : "s"} first, then the rest of your list below.`
      : `${attention.length} item${attention.length === 1 ? "" : "s"} could use your attention today.`;

  const nothingAtAll = groups.length === 0 && !show.chart && attention.length === 0 && lines.length === 0 && refills.length === 0 && recent.length === 0;

  return (
    <div className="space-y-6">
      {/* Hero: home only */}
      <section className="ui-fade-in relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 px-5 py-6 text-white shadow-md sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-accent-400/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-brand-400/25 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-overline uppercase text-white/80"><CalendarDays className="icon-sm" aria-hidden />{longDate}</p>
            <h1 className="mt-2 font-display text-[1.75rem] font-bold leading-9 tracking-tight sm:text-display">{greet}, {firstName}</h1>
            <p className="mt-1.5 max-w-xl text-sm text-white/90">{ROLES[role]} workspace. {summary}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 text-caption text-white/90 ring-1 ring-inset ring-white/20">
              <Clock className="icon-xs" aria-hidden />
              Agents saved about {qty(Math.round(hoursSaved * 10) / 10)} h of checking this month
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite(role, "quotations") && (
              <Link href="/quotations/new" className={buttonClass("secondary", "lg", "border-transparent text-brand-700 dark:text-brand-300")}>
                <Plus className="icon-sm" aria-hidden /> New quotation
              </Link>
            )}
            <Link href="/alerts" className={buttonClass("ghost", "lg", "bg-white/15 text-white ring-1 ring-inset ring-white/25 hover:bg-white/25 hover:text-white")}>
              <Bell className="icon-sm" aria-hidden /> View alerts
            </Link>
          </div>
        </div>
      </section>

      {/* Role-based summary */}
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`kpi-${g.id}`}>
          <h2 id={`kpi-${g.id}`} className="mb-2 text-overline uppercase text-ink-soft">{g.title}</h2>
          <MetricStrip className={cx(g.tiles.length === 3 && "lg:grid-cols-3", g.tiles.length === 2 && "lg:grid-cols-2")}>{g.tiles}</MetricStrip>
        </section>
      ))}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          <SectionCard title="Needs your attention" icon={Bell} count={attention.length} flush
            actions={<CardLink href="/alerts">All alerts</CardLink>}
            empty={attention.length === 0 && "All clear. The agents found nothing for you today."}>
            <ul className="divide-y divide-line">
              {attention.map((a) => {
                const s = sevIcon[a.severity] ?? sevIcon.info;
                const Icon = s.icon;
                const late = a.dueDate != null && a.dueDate < today;
                return (
                  <li key={a.id}>
                    <Link href={a.link ?? "/alerts"} className="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-muted sm:px-5">
                      <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg", s.cls)}><Icon className="icon-sm" aria-label={s.label} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-ink">{a.title}</span>
                        {a.dueDate && <span className={cx("text-caption", late ? "font-medium text-danger" : "text-ink-soft")}>Due {fmtDate(a.dueDate)}</span>}
                      </span>
                      {a.severity === "critical" && <StatusPill status="critical" label="Critical" className="shrink-0 max-sm:hidden" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </SectionCard>

          {show.chart && series.length > 0 && (
            <SectionCard title="Sales vs quotes" description="Last 6 months, by month" icon={BarChart3} actions={show.profit ? <CardLink href="/reports">Reports</CardLink> : undefined}>
              <BarChart data={series} title="Invoiced sales and quoted value for the last six months" description="The table below has the same numbers."
                category={(d) => chartMonth(d.month)} categoryLong={(d) => chartMonth(d.month, false)} width={640} height={240} table
                emptyText="No quotes or invoices yet"
                series={[
                  { key: "sales", label: "Sales (invoiced)", shortLabel: "Sales", value: (d) => d.sales },
                  { key: "quoted", label: "Quoted (sent quotes)", shortLabel: "Quoted", value: (d) => d.quoted },
                ]} />
            </SectionCard>
          )}

          {recent.length > 0 && (
            <SectionCard title="Recent quotations" icon={FileText} flush actions={<CardLink href="/quotations">All quotations</CardLink>}>
              <ResponsiveTable flush rows={recent} columns={recentCols} rowKey={(q) => q.id} caption="Recent quotations" />
            </SectionCard>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {show.deliveries && (
            <SectionCard title="Pending deliveries" icon={Truck} flush actions={<CardLink href="/orders">All orders</CardLink>}
              empty={lines.length === 0 && "Every customer PO line has been delivered."}>
              <ul className="divide-y divide-line">
                {lines.map((l) => {
                  const late = l.expected ? daysBetween(l.expected, today) : null;
                  return (
                    <li key={l.lineId}>
                      <Link href={`/orders/${l.orderId}`} className="flex min-h-14 items-start justify-between gap-3 px-4 py-3 hover:bg-muted sm:px-5">
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">{l.description}</span>
                          <span className="block truncate text-caption text-ink-soft">{l.poNumber ? `PO ${l.poNumber}` : l.orderNumber} · {l.customer}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-medium tabular-nums text-ink">{qty(pendingQtyOf(l))} {l.uom}</span>
                          <span className={cx("block text-caption", late != null && late > 0 ? "font-medium text-danger" : "text-ink-soft")}>
                            {l.expected ? describeDue(l.expected, today) : "No date set"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          )}

          {show.refills && (
            <SectionCard title="Refills due in 10 days" icon={FireExtinguisher} flush actions={<CardLink href="/refills">Refill tracker</CardLink>}
              empty={refills.length === 0 && "No refills due in the next 10 days."}>
              <ul className="divide-y divide-line">
                {refills.map((r) => (
                  <li key={r.customerId}>
                    <Link href={`/refills?customer=${r.customerId}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-muted sm:px-5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{r.customer}</span>
                        <span className="block text-caption text-ink-soft">{r.units} extinguisher{r.units === 1 ? "" : "s"}{r.phone ? ` · ${r.phone}` : ""}</span>
                      </span>
                      <span className={cx("shrink-0 text-caption", r.due < today ? "font-medium text-danger" : "text-ink-soft")}>{describeDue(r.due, today)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      </div>

      {nothingAtAll && <EmptyState title="Nothing pending">Your daily summary shows here as work comes in.</EmptyState>}
    </div>
  );
}
