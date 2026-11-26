import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, Download, Table2 } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { canRead, canSeeCost } from "@/lib/rbac";
import { PROJECT_STATUSES, SYSTEMS } from "@/lib/constants";
import { fmtDate, money0, moneyShort, pct, qty, todayIST } from "@/lib/format";
import {
  customerProfitability, financialYearOptions, itemMargins, monthLabel, monthlyPnl, orderProfitability, projectProfitability,
  type CustomerProfit, type ItemMargin, type OrderPnl, type PnlReport, type ProjectProfit,
} from "@/lib/reports";
import { EmptyState, Flash, Select, Td, buttonClass, cx } from "@/components/ui";
import {
  Callout, ListEmpty, ListFilters, ListPage, Metric, MetricStrip, ResponsiveTable, SectionCard, StatusPill, Tabs, statusLabel,
  type Column,
} from "@/components/patterns";
import { BudgetBar } from "../projects/_components/budget-bar";
import { PnlChart } from "./_components/pnl-chart";
import { REPORT_TABS, parseReportParams, periodLabel, reportQuery, type ReportParams, type ReportSP, type ReportTab } from "./_lib/params";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports and profit" };

const TITLE = "Reports and profit";

/** Colour for a margin percentage: loss, thin (under 10%) or healthy. */
const marginTone = (m: number, hasRevenue = true) =>
  !hasRevenue ? "text-ink-faint" : m < 0 ? "font-semibold text-danger" : m < 10 ? "text-warning" : "text-success";

const linkCls = "rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300";

/** What each report tab hands to ListPage. */
type TabView = {
  stats?: ReactNode; notices?: ReactNode; filters?: ReactNode; isEmpty?: boolean; empty?: ReactNode; summary?: ReactNode; content: ReactNode;
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportSP & { ok?: string; err?: string }> }) {
  const user = await requireUser("reports");
  const sp = await searchParams;
  const today = todayIST();
  const p = parseReportParams(sp, today);

  if (!canSeeCost(user.role)) {
    return (
      <ListPage title={TITLE} density={false} notices={<Flash ok={sp.ok} err={sp.err} />} isEmpty
        empty={<EmptyState title="These reports show buying prices">Ask the admin if you need access.</EmptyState>} />
    );
  }

  const db = await getDb();
  const exportHref = `/reports/export?${reportQuery({ tab: p.tab, fy: p.fy, q: p.q, kind: p.kind, sort: p.sort, status: p.status, system: p.system, flagged: p.flagged })}`;

  let view: TabView;
  if (p.tab === "pnl") view = pnlView(await monthlyPnl(db, p.range!), p, today);
  else if (p.tab === "orders") view = ordersView(await orderProfitability(db, { from: p.range?.from, to: p.range?.to, q: p.q, kind: p.kind, sort: p.sort }), p, today, canRead(user.role, "orders"));
  else if (p.tab === "projects") view = projectsView(await projectProfitability(db, { status: p.status }), p);
  else if (p.tab === "customers") view = customersView(await customerProfitability(db, { q: p.q }), p, canRead(user.role, "customers"));
  else view = itemsView(await itemMargins(db, { q: p.q, system: p.system, today, onlyFlagged: p.flagged }), p);

  return (
    <ListPage
      title={TITLE}
      subtitle="See what you made on every sale: what you bought it for, what you sold it at, month by month, order by order and project by project."
      secondaryActions={
        // A plain link: the export is a route handler that returns a file, so it must not be prefetched.
        <a href={exportHref} className={buttonClass("secondary")}><Download className="icon-sm" aria-hidden /> Download Excel</a>
      }
      notices={<><Flash ok={sp.ok} err={sp.err} />{view.notices}</>}
      stats={view.stats}
      filters={
        <>
          <Tabs label="Report sections" basePath="/reports" active={p.tab}
            items={(Object.keys(REPORT_TABS) as ReportTab[]).map((t) => ({ id: t, label: REPORT_TABS[t] }))} />
          {view.filters}
        </>
      }
      isEmpty={view.isEmpty}
      empty={view.empty}
      resultSummary={view.summary}
    >
      {view.content}
    </ListPage>
  );
}

// ------------------------------------------------------------------------------------------------ filters
function PeriodSelect({ p, today, all }: { p: ReportParams; today: string; all?: boolean }) {
  return (
    <Select name="fy" defaultValue={p.fy} aria-label="Period">
      {all ? <option value="all">All time</option> : <option value="last12">Last 12 months</option>}
      {all && <option value="last12">Last 12 months</option>}
      {financialYearOptions(today, 5).map((fy) => <option key={fy} value={fy}>FY {fy}</option>)}
    </Select>
  );
}

const clearHref = (tab: ReportTab) => (tab === "pnl" ? "/reports" : `/reports?tab=${tab}`);

function Footnote({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-caption text-ink-soft">{children}</p>;
}

/** A footer cell that also reads well as a phone card row. */
function FootTd({ label, children, className, slot = "field" }: { label: string; children: ReactNode; className?: string; slot?: string }) {
  return <Td data-slot={slot} data-label={label} className={cx("text-right tabular-nums", className)}>{children}</Td>;
}

// ------------------------------------------------------------------------------------------------ a) monthly P&L
function pnlView(report: PnlReport, p: ReportParams, today: string): TabView {
  const { months, total } = report;
  const current = months.find((m) => m.month === today.slice(0, 7));
  type M = (typeof months)[number];
  const cols: Column<M>[] = [
    { key: "month", header: "Month", card: "title", nowrap: true, cell: (m) => monthLabel(m.month) },
    { key: "sales", header: "Sales", align: "right", card: "amount", nowrap: true,
      cell: (m) => <>{money0(m.sales)}{m.creditNotes > 0 && <div className="text-caption font-normal text-ink-soft">after {money0(m.creditNotes)} credit notes</div>}</> },
    { key: "cogs", header: "Cost of goods", align: "right", nowrap: true, cell: (m) => money0(m.cogs) },
    { key: "gross", header: "Gross profit", align: "right", nowrap: true, cell: (m) => <span className={cx(m.grossProfit < 0 && "text-danger")}>{money0(m.grossProfit)}</span> },
    { key: "grossPct", header: "Gross %", align: "right", priority: 3, cell: (m) => <span className={marginTone(m.grossMarginPct, m.sales !== 0)}>{m.sales ? pct(m.grossMarginPct) : "-"}</span> },
    { key: "exp", header: "Expenses", align: "right", nowrap: true, cell: (m) => money0(m.expenses) },
    { key: "net", header: "Net profit", align: "right", nowrap: true,
      cell: (m) => <span className={cx("font-medium", m.netProfit < 0 ? "text-danger" : "text-ink")}>{money0(m.netProfit)}</span> },
    { key: "netPct", header: "Net %", align: "right", cell: (m) => <span className={marginTone(m.netMarginPct, m.sales !== 0)}>{m.sales ? pct(m.netMarginPct) : "-"}</span> },
  ];
  return {
    stats: (
      <MetricStrip>
        <Metric label={`Sales, ${periodLabel(p.fy).toLowerCase()}`} value={moneyShort(total.sales)} hint="Invoiced less credit notes, before GST" />
        <Metric label="Gross profit" value={moneyShort(total.grossProfit)} hint={`${pct(total.grossMarginPct)} of sales`} tone={total.grossProfit < 0 ? "bad" : "good"} />
        <Metric label="Net profit" value={moneyShort(total.netProfit)} hint={`After ${moneyShort(total.expenses)} expenses · ${pct(total.netMarginPct)}`} tone={total.netProfit < 0 ? "bad" : "good"} />
        {current ? (
          <Metric label="This month so far" value={moneyShort(current.netProfit)} hint={`Net profit on ${moneyShort(current.sales)} sales`} tone={current.netProfit < 0 ? "bad" : "default"} />
        ) : (
          <Metric label="Cost of goods" value={moneyShort(total.cogs)} hint="Delivered and issued to sites" />
        )}
      </MetricStrip>
    ),
    notices: report.deliveryLinesWithoutCost > 0 && (
      <Callout tone="warning" title={`${report.deliveryLinesWithoutCost} delivered line${report.deliveryLinesWithoutCost === 1 ? " was" : "s were"} recorded without a cost`}>
        Cost of goods is a little low and profit a little high. Usually these are older deliveries made before costs were tracked.
      </Callout>
    ),
    filters: (
      <ListFilters searchName={false} hidden={{ tab: "pnl" }} clearHref={clearHref("pnl")} activeCount={p.fy !== "last12" ? 1 : 0}>
        <PeriodSelect p={p} today={today} />
      </ListFilters>
    ),
    summary: periodLabel(p.fy),
    content: (
      <div className="space-y-4">
        <SectionCard title="Month by month" description={periodLabel(p.fy)} icon={BarChart3}>
          <PnlChart months={months} />
        </SectionCard>
        <SectionCard title="The numbers behind the chart" icon={Table2} flush>
          <ResponsiveTable flush rows={months} columns={cols} rowKey={(m) => m.month} caption="Monthly profit and loss"
            footer={
              <tr className="bg-muted font-semibold">
                <Td data-slot="title" data-label="Month">Total</Td>
                <FootTd label="Sales" slot="amount">{money0(total.sales)}</FootTd>
                <FootTd label="Cost of goods">{money0(total.cogs)}</FootTd>
                <FootTd label="Gross profit">{money0(total.grossProfit)}</FootTd>
                <FootTd label="Gross %" className="rt-p3">{pct(total.grossMarginPct)}</FootTd>
                <FootTd label="Expenses">{money0(total.expenses)}</FootTd>
                <FootTd label="Net profit" className={cx(total.netProfit < 0 && "text-danger")}>{money0(total.netProfit)}</FootTd>
                <FootTd label="Net %">{pct(total.netMarginPct)}</FootTd>
              </tr>
            } />
        </SectionCard>
        <Footnote>
          How this is worked out: sales are invoices less credit notes (before GST) by invoice date. Cost of goods is what delivered supply orders cost us,
          plus materials issued to project sites, less site returns and customer returns put back in stock. Purchases only count once the goods are delivered or issued.
          Expenses are approved vouchers by voucher date.
        </Footnote>
      </div>
    ),
  };
}

// ------------------------------------------------------------------------------------------------ b) orders
function ordersView(rows: OrderPnl[], p: ReportParams, today: string, canOrders: boolean): TabView {
  const t = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, cost: a.cost + r.cost, profit: a.profit + r.grossProfit }), { revenue: 0, cost: 0, profit: 0 });
  const losing = rows.filter((r) => r.revenue > 0 && r.grossProfit < 0).length;
  const active = [p.q, p.kind, p.fy !== "all" ? p.fy : undefined, p.sort !== "margin_asc" ? p.sort : undefined].filter(Boolean).length;
  const cols: Column<OrderPnl>[] = [
    { key: "order", header: "Order", card: "title",
      cell: (r) => (
        <>
          {canOrders ? <Link href={`/orders/${r.orderId}`} className={linkCls}>{r.number}</Link> : <span className="font-medium">{r.number}</span>}
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-caption font-normal text-ink-soft">
            {fmtDate(r.orderDate)}{r.customerPoNumber ? ` · PO ${r.customerPoNumber}` : ""}
            {r.supplyOnly ? <StatusPill semantic="info" label="Supply" noDot /> : <StatusPill semantic="progress" label={`Project ${r.projectCode ?? ""}`} noDot />}
            {r.linesWithoutCost > 0 && <StatusPill semantic="warning" label={`${r.linesWithoutCost} without cost`} noDot />}
          </div>
        </>
      ) },
    { key: "customer", header: "Customer", card: "subtitle", className: "max-w-52 truncate", cell: (r) => r.customerName },
    { key: "revenue", header: "Revenue", align: "right", nowrap: true,
      cell: (r) => <>{money0(r.revenue)}{r.creditNotes > 0 && <div className="text-caption text-ink-soft">less {money0(r.creditNotes)} CN</div>}</> },
    { key: "cost", header: "Cost", align: "right", nowrap: true, priority: 3, cell: (r) => money0(r.cost) },
    { key: "profit", header: "Gross profit", align: "right", card: "amount", nowrap: true,
      cell: (r) => <span className={cx("font-medium", r.grossProfit < 0 ? "text-danger" : "text-ink")}>{money0(r.grossProfit)}</span> },
    { key: "margin", header: "Margin", align: "right", nowrap: true,
      cell: (r) => <span className={marginTone(r.marginPct, r.revenue !== 0)}>{r.revenue ? pct(r.marginPct) : "Not billed"}</span> },
    { key: "delivered", header: "Delivered", cell: (r) => <DeliveredBar value={r.deliveredPct} /> },
  ];
  return {
    stats: (
      <MetricStrip>
        <Metric label="Orders" value={qty(rows.length)} hint={periodLabel(p.fy)} />
        <Metric label="Revenue" value={moneyShort(t.revenue)} hint="Invoiced less credit notes" />
        <Metric label="Gross profit" value={moneyShort(t.profit)} hint={t.revenue ? `${pct((t.profit / t.revenue) * 100)} margin` : undefined} tone={t.profit < 0 ? "bad" : "good"} />
        <Metric label="Orders losing money" value={qty(losing)} tone={losing ? "bad" : "good"} hint="Billed, but cost more than revenue" />
      </MetricStrip>
    ),
    filters: (
      <ListFilters q={p.q} placeholder="Order, customer PO or customer" hidden={{ tab: "orders" }} clearHref={clearHref("orders")} activeCount={active}>
        <PeriodSelect p={p} today={today} all />
        <Select name="kind" defaultValue={p.kind ?? ""} aria-label="Order type">
          <option value="">All orders</option>
          <option value="supply">Supply only</option>
          <option value="project">Project orders</option>
        </Select>
        <Select name="sort" defaultValue={p.sort} aria-label="Sort">
          <option value="margin_asc">Lowest margin first</option>
          <option value="margin_desc">Highest margin first</option>
          <option value="profit_desc">Biggest profit first</option>
          <option value="revenue_desc">Biggest revenue first</option>
          <option value="date_desc">Newest first</option>
        </Select>
      </ListFilters>
    ),
    isEmpty: rows.length === 0,
    empty: <ListEmpty filtered={active > 0} noun="orders" clearHref={clearHref("orders")}>Order profit shows once a customer order is invoiced or delivered.</ListEmpty>,
    summary: `${rows.length} order${rows.length === 1 ? "" : "s"}`,
    content: (
      <>
        <ResponsiveTable tall rows={rows} columns={cols} rowKey={(r) => r.orderId} caption="Order profit" />
        <Footnote>Revenue is invoiced value before GST less posted credit notes. Cost is each delivered line at the cost on the day it went out, less goods returned to stock.</Footnote>
      </>
    ),
  };
}

// ------------------------------------------------------------------------------------------------ c) projects
function projectsView(rows: ProjectProfit[], p: ReportParams): TabView {
  const t = rows.reduce((a, r) => ({ cv: a.cv + r.contractValue, cost: a.cost + r.actualCost, inv: a.inv + r.invoiced, rec: a.rec + r.received }), { cv: 0, cost: 0, inv: 0, rec: 0 });
  const cols: Column<ProjectProfit>[] = [
    { key: "project", header: "Project", card: "title",
      cell: (r) => (
        <>
          <Link href={`/projects/${r.projectId}`} className={linkCls}>{r.name}</Link>
          <div className="text-caption font-normal text-ink-soft">{r.code} · {r.customerName}</div>
        </>
      ) },
    { key: "status", header: "Status", card: "badge", cell: (r) => <StatusPill status={r.status} /> },
    { key: "contract", header: "Contract", align: "right", nowrap: true, cell: (r) => money0(r.contractValue) },
    { key: "cost", header: "Actual cost", align: "right", nowrap: true, cell: (r) => money0(r.actualCost) },
    { key: "invoiced", header: "Invoiced", align: "right", nowrap: true, priority: 3,
      cell: (r) => <>{money0(r.invoiced)}{r.creditNotes > 0 && <div className="text-caption text-ink-soft">after {money0(r.creditNotes)} CN</div>}</> },
    { key: "received", header: "Received", align: "right", nowrap: true, priority: 3,
      cell: (r) => <>{money0(r.received)}{r.netDue > 0.5 && <div className="text-caption text-warning">{money0(r.netDue)} due</div>}</> },
    { key: "margin", header: "Margin", align: "right", card: "amount", nowrap: true,
      cell: (r) => <><span className={marginTone(r.marginPct, r.contractValue !== 0)}>{r.contractValue ? pct(r.marginPct) : "-"}</span><div className="text-caption font-normal text-ink-soft">{money0(r.margin)}</div></> },
    { key: "budget", header: "Budget used", cell: (r) => <BudgetBar usedPct={r.budgetUsedPct} budget={r.budget} /> },
  ];
  return {
    stats: (
      <MetricStrip>
        <Metric label="Contract value" value={moneyShort(t.cv)} hint={`${rows.length} project${rows.length === 1 ? "" : "s"}`} />
        <Metric label="Actual cost" value={moneyShort(t.cost)} hint="Materials and approved expenses" />
        <Metric label="Margin on contract" value={moneyShort(t.cv - t.cost)} tone={t.cv - t.cost < 0 ? "bad" : "good"} hint={t.cv ? `${pct(((t.cv - t.cost) / t.cv) * 100)}` : undefined} />
        <Metric label="Invoiced and received" value={moneyShort(t.inv)} hint={`${moneyShort(t.rec)} received`} />
      </MetricStrip>
    ),
    filters: (
      <ListFilters searchName={false} hidden={{ tab: "projects" }} clearHref={clearHref("projects")} activeCount={p.status ? 1 : 0}>
        <Select name="status" defaultValue={p.status ?? ""} aria-label="Status">
          <option value="">All statuses</option>
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </Select>
      </ListFilters>
    ),
    isEmpty: rows.length === 0,
    empty: <ListEmpty filtered={!!p.status} noun="projects" clearHref={clearHref("projects")}>Projects appear once an order is won and a project is opened for it.</ListEmpty>,
    summary: `${rows.length} project${rows.length === 1 ? "" : "s"}`,
    content: (
      <>
        <ResponsiveTable tall rows={rows} columns={cols} rowKey={(r) => r.projectId} caption="Project profit" />
        <Footnote>Margin is contract value less actual cost. Actual cost is materials issued to site, less returns, plus approved expense vouchers. Received includes advances.</Footnote>
      </>
    ),
  };
}

// ------------------------------------------------------------------------------------------------ d) customers
function customersView(rows: CustomerProfit[], p: ReportParams, canCustomers: boolean): TabView {
  const cols: Column<CustomerProfit>[] = [
    { key: "customer", header: "Customer", card: "title",
      cell: (r) => (
        <>
          {canCustomers ? <Link href={`/customers/${r.customerId}`} className={linkCls}>{r.name}</Link> : <span className="font-medium">{r.name}</span>}
          {r.projectCount > 0 && <div className="text-caption font-normal text-ink-soft">{r.projectCount} project{r.projectCount === 1 ? "" : "s"}</div>}
        </>
      ) },
    { key: "revenue", header: "Revenue", align: "right", nowrap: true,
      cell: (r) => <>{money0(r.revenue)}{r.creditNotes > 0 && <div className="text-caption text-ink-soft">after {money0(r.creditNotes)} CN</div>}</> },
    { key: "cost", header: "Cost", align: "right", nowrap: true, priority: 3, cell: (r) => money0(r.cost) },
    { key: "profit", header: "Gross profit", align: "right", card: "amount", nowrap: true,
      cell: (r) => <span className={cx("font-medium", r.grossProfit < 0 ? "text-danger" : "text-ink")}>{money0(r.grossProfit)}</span> },
    { key: "margin", header: "Margin", align: "right", cell: (r) => <span className={marginTone(r.marginPct, r.revenue !== 0)}>{r.revenue ? pct(r.marginPct) : "-"}</span> },
    { key: "out", header: "Outstanding", align: "right", nowrap: true, cell: (r) => <span className={cx(r.outstanding > 0.5 && "text-warning")}>{money0(r.outstanding)}</span> },
  ];
  return {
    filters: <ListFilters q={p.q} placeholder="Customer name" hidden={{ tab: "customers" }} clearHref={clearHref("customers")} activeCount={p.q ? 1 : 0} />,
    isEmpty: rows.length === 0,
    empty: <ListEmpty filtered={!!p.q} noun="customers" title={p.q ? undefined : "No sales yet"} clearHref={clearHref("customers")}>Customer profit shows once invoices are raised.</ListEmpty>,
    summary: `${rows.length} customer${rows.length === 1 ? "" : "s"}`,
    content: (
      <>
        <ResponsiveTable tall rows={rows} columns={cols} rowKey={(r) => r.customerId} caption="Customer profit" />
        <Footnote>Cost is what supply orders cost us when delivered (less goods returned to stock) plus the actual cost of the customer&apos;s projects. Outstanding includes GST and is after credit notes and unused advances.</Footnote>
      </>
    ),
  };
}

// ------------------------------------------------------------------------------------------------ e) items
function itemsView(rows: ItemMargin[], p: ReportParams): TabView {
  const flagged = rows.filter((r) => r.sellingBelowCost).length;
  const active = [p.q, p.system, p.flagged].filter(Boolean).length;
  const cols: Column<ItemMargin>[] = [
    { key: "item", header: "Item", card: "title",
      cell: (r) => (
        <>
          <Link href={`/items/${r.itemId}`} className={linkCls}>{r.name}</Link>
          <div className="text-caption font-normal text-ink-soft">{r.code} · {r.groupName}</div>
        </>
      ) },
    { key: "flag", header: <span className="sr-only">Flag</span>, label: "Flag", card: "badge",
      cell: (r) => r.sellingBelowCost ? <StatusPill semantic="danger" label="Below cost" /> : null },
    { key: "buy90", header: "Avg buy, 90 days", align: "right", nowrap: true, cell: (r) => money0(r.avgPurchase90) },
    { key: "buyAll", header: "Avg buy, all time", align: "right", nowrap: true, priority: 3, cell: (r) => money0(r.avgPurchaseAll) },
    { key: "latest", header: "Latest cost", align: "right", nowrap: true, cell: (r) => money0(r.latestCost) },
    { key: "sell", header: "Avg sell", align: "right", nowrap: true, priority: 3, cell: (r) => money0(r.avgSale) },
    { key: "last", header: "Last sale", align: "right", nowrap: true,
      cell: (r) => <span className={cx(r.sellingBelowCost && "font-semibold text-danger")}>{money0(r.lastSaleRate)}</span> },
    { key: "qty", header: "Qty sold", align: "right", nowrap: true, priority: 3, cell: (r) => (r.qtySold ? `${qty(r.qtySold)} ${r.uom}` : "-") },
    { key: "margin", header: "Margin", align: "right", card: "amount", nowrap: true,
      cell: (r) => (
        <>
          <span className={r.marginPct == null ? "text-ink-faint" : marginTone(r.marginPct)}>{r.marginPct == null ? "-" : pct(r.marginPct)}</span>
          {r.marginAtLatestPct != null && <div className="text-caption font-normal text-ink-soft">{pct(r.marginAtLatestPct)} at latest cost</div>}
        </>
      ) },
    { key: "dates", header: "Last bought and sold", nowrap: true, priority: 3, className: "text-caption text-ink-soft",
      cell: (r) => <><div>Bought {fmtDate(r.lastPurchaseDate)}</div><div>Sold {fmtDate(r.lastSaleDate)}</div></> },
  ];
  return {
    notices: flagged > 0 && (
      <Callout tone="danger" title={`${flagged} item${flagged === 1 ? " was" : "s were"} last sold below today's buying cost`}>
        Update the selling rate before the next quote.
      </Callout>
    ),
    filters: (
      <ListFilters q={p.q} placeholder="Item name, code, group or make" hidden={{ tab: "items" }} clearHref={clearHref("items")} activeCount={active}>
        <Select name="system" defaultValue={p.system ?? ""} aria-label="System">
          <option value="">All systems</option>
          {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <label className="inline-flex min-h-9.5 items-center gap-2 px-1 text-sm text-ink">
          <input type="checkbox" name="flagged" value="1" defaultChecked={p.flagged} className="icon-sm accent-brand-600" /> Only selling below cost
        </label>
      </ListFilters>
    ),
    isEmpty: rows.length === 0,
    empty: <ListEmpty filtered={active > 0} noun="items" clearHref={clearHref("items")}>Items appear here once they have been bought or sold at least once.</ListEmpty>,
    summary: `${rows.length} item${rows.length === 1 ? "" : "s"}`,
    content: (
      <>
        <ResponsiveTable tall rows={rows} columns={cols} rowKey={(r) => r.itemId} caption="Item margins"
          rowClassName={(r) => r.sellingBelowCost && "bg-danger-soft"} />
        <Footnote>Averages are weighted by quantity from the price history of posted purchase bills and issued invoices. Latest cost is the last purchase rate, or the list price when the item has never been bought.</Footnote>
      </>
    ),
  };
}

function DeliveredBar({ value }: { value: number }) {
  const w = Math.max(0, Math.min(100, value));
  return (
    <div className="flex min-w-28 items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-line" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label="Delivered">
        <div className={cx("h-full rounded-full", value >= 100 ? "bg-success" : "bg-chart-1")} style={{ width: `${w}%` }} />
      </div>
      <span className="w-10 text-right text-caption tabular-nums text-ink-soft">{pct(value, 0)}</span>
    </div>
  );
}

