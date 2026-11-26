import Link from "next/link";
import { AlertTriangle, BarChart3, Download, LineChart, Search } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { canRead, canSeeCost } from "@/lib/rbac";
import { PROJECT_STATUSES, SYSTEMS } from "@/lib/constants";
import { fmtDate, money0, moneyShort, pct, qty, todayIST } from "@/lib/format";
import {
  customerProfitability, financialYearOptions, itemMargins, monthLabel, monthlyPnl, orderProfitability, projectProfitability,
  type CustomerProfit, type ItemMargin, type OrderPnl, type PnlReport, type ProjectProfit,
} from "@/lib/reports";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Stat, Table, Td, Th, cx } from "@/components/ui";
import { BudgetBar } from "../projects/_components/budget-bar";
import { PnlChart } from "./_components/pnl-chart";
import { REPORT_TABS, parseReportParams, periodLabel, reportQuery, type ReportParams, type ReportSP, type ReportTab } from "./_lib/params";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profit & Reports" };

const marginTone = (m: number, hasRevenue = true) =>
  !hasRevenue ? "text-ink-faint" : m < 0 ? "font-semibold text-red-600 dark:text-red-400" : m < 10 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportSP> }) {
  const user = await requireUser("reports");
  const sp = await searchParams;
  const today = todayIST();
  const p = parseReportParams(sp, today);

  if (!canSeeCost(user.role)) {
    return (
      <div>
        <PageHeader title="Profit & Reports" />
        <EmptyState title="These reports show buying prices">Ask the admin if you need access.</EmptyState>
      </div>
    );
  }

  const db = await getDb();
  const exportHref = `/reports/export?${reportQuery({ tab: p.tab, fy: p.fy, q: p.q, kind: p.kind, sort: p.sort, status: p.status, system: p.system, flagged: p.flagged })}`;

  let body: React.ReactNode;
  if (p.tab === "pnl") body = <PnlTab report={await monthlyPnl(db, p.range!)} p={p} today={today} />;
  else if (p.tab === "orders") body = <OrdersTab rows={await orderProfitability(db, { from: p.range?.from, to: p.range?.to, q: p.q, kind: p.kind, sort: p.sort })} p={p} today={today} canOrders={canRead(user.role, "orders")} />;
  else if (p.tab === "projects") body = <ProjectsTab rows={await projectProfitability(db, { status: p.status })} p={p} />;
  else if (p.tab === "customers") body = <CustomersTab rows={await customerProfitability(db, { q: p.q })} p={p} canCustomers={canRead(user.role, "customers")} />;
  else body = <ItemsTab rows={await itemMargins(db, { q: p.q, system: p.system, today, onlyFlagged: p.flagged })} p={p} />;

  return (
    <div>
      <PageHeader
        title="Profit & Reports"
        subtitle="See what you made on every sale: what you bought it for, what you sold it at, month by month, order by order and project by project."
        actions={
          <a href={exportHref} className="inline-flex h-9.5 items-center gap-1.5 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink shadow-xs hover:bg-muted">
            <Download className="h-4 w-4" aria-hidden /> Excel
          </a>
        }
      />
      <nav aria-label="Reports" className="mb-5 flex items-center gap-1 overflow-x-auto border-b border-line">
        {(Object.keys(REPORT_TABS) as ReportTab[]).map((t) => (
          <Link key={t} href={`/reports?tab=${t}`} aria-current={p.tab === t ? "page" : undefined}
            className={cx("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              p.tab === t ? "border-brand-600 text-brand-700 dark:text-brand-300" : "border-transparent text-ink-soft hover:text-ink")}>
            {REPORT_TABS[t]}
          </Link>
        ))}
      </nav>
      {body}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ filters
function Filters({ p, today, children, period, periodAll, search, placeholder }: {
  p: ReportParams; today: string; children?: React.ReactNode; period?: boolean; periodAll?: boolean; search?: boolean; placeholder?: string;
}) {
  return (
    <form method="get" action="/reports" role="search" className="mb-4 flex flex-col gap-2 rounded-2xl border border-line bg-surface p-2 shadow-xs sm:flex-row sm:flex-wrap sm:items-center">
      <input type="hidden" name="tab" value={p.tab} />
      {search && (
        <label className="relative min-w-0 sm:max-w-xs sm:flex-1">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <Input name="q" type="search" defaultValue={p.q} placeholder={placeholder ?? "Search"} className="pl-9" />
        </label>
      )}
      {period && (
        <Select name="fy" defaultValue={p.fy} aria-label="Period" className="sm:max-w-52">
          {periodAll ? <option value="all">All time</option> : <option value="last12">Last 12 months</option>}
          {periodAll && <option value="last12">Last 12 months</option>}
          {financialYearOptions(today, 5).map((fy) => <option key={fy} value={fy}>FY {fy}</option>)}
        </Select>
      )}
      {children}
      <Button variant="secondary" type="submit">Apply</Button>
    </form>
  );
}

// ------------------------------------------------------------------------------------------------ a) monthly P&L
function PnlTab({ report, p, today }: { report: PnlReport; p: ReportParams; today: string }) {
  const { months, total } = report;
  const current = months.find((m) => m.month === today.slice(0, 7));
  return (
    <div className="space-y-5">
      <Filters p={p} today={today} period />
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Sales, ${periodLabel(p.fy).toLowerCase()}`} value={moneyShort(total.sales)} hint="Invoiced less credit notes, before GST" />
        <Stat label="Gross profit" value={moneyShort(total.grossProfit)} hint={`${pct(total.grossMarginPct)} of sales`} tone={total.grossProfit < 0 ? "bad" : "good"} />
        <Stat label="Net profit" value={moneyShort(total.netProfit)} hint={`After ${moneyShort(total.expenses)} expenses · ${pct(total.netMarginPct)}`} tone={total.netProfit < 0 ? "bad" : "good"} />
        {current ? (
          <Stat label="This month so far" value={moneyShort(current.netProfit)} hint={`Net profit on ${moneyShort(current.sales)} sales`} tone={current.netProfit < 0 ? "bad" : "default"} />
        ) : (
          <Stat label="Cost of goods" value={moneyShort(total.cogs)} hint="Delivered and issued to sites" />
        )}
      </div>

      <Card title="Month by month" subtitle={periodLabel(p.fy)} icon={BarChart3}>
        <PnlChart months={months} />
      </Card>

      {report.deliveryLinesWithoutCost > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {report.deliveryLinesWithoutCost} delivered line{report.deliveryLinesWithoutCost === 1 ? " was" : "s were"} recorded without a cost, so cost of goods is a little low and profit a little high. Usually these are older deliveries made before costs were tracked.
        </p>
      )}

      <Table>
        <thead>
          <tr>
            <Th>Month</Th>
            <Th className="text-right">Sales</Th>
            <Th className="text-right">Cost of goods</Th>
            <Th className="text-right">Gross profit</Th>
            <Th className="text-right">Gross %</Th>
            <Th className="text-right">Expenses</Th>
            <Th className="text-right">Net profit</Th>
            <Th className="text-right">Net %</Th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <Td className="whitespace-nowrap font-medium">{monthLabel(m.month)}</Td>
              <Td className="text-right tabular-nums">
                {money0(m.sales)}
                {m.creditNotes > 0 && <div className="text-xs text-ink-soft">after {money0(m.creditNotes)} credit notes</div>}
              </Td>
              <Td className="text-right tabular-nums">{money0(m.cogs)}</Td>
              <Td className={cx("text-right tabular-nums", m.grossProfit < 0 && "text-red-600 dark:text-red-400")}>{money0(m.grossProfit)}</Td>
              <Td className={cx("text-right tabular-nums", marginTone(m.grossMarginPct, m.sales !== 0))}>{m.sales ? pct(m.grossMarginPct) : "-"}</Td>
              <Td className="text-right tabular-nums">{money0(m.expenses)}</Td>
              <Td className={cx("text-right font-medium tabular-nums", m.netProfit < 0 ? "text-red-600 dark:text-red-400" : "text-ink")}>{money0(m.netProfit)}</Td>
              <Td className={cx("text-right tabular-nums", marginTone(m.netMarginPct, m.sales !== 0))}>{m.sales ? pct(m.netMarginPct) : "-"}</Td>
            </tr>
          ))}
          <tr className="bg-muted font-semibold">
            <Td>Total</Td>
            <Td className="text-right tabular-nums">{money0(total.sales)}</Td>
            <Td className="text-right tabular-nums">{money0(total.cogs)}</Td>
            <Td className="text-right tabular-nums">{money0(total.grossProfit)}</Td>
            <Td className="text-right tabular-nums">{pct(total.grossMarginPct)}</Td>
            <Td className="text-right tabular-nums">{money0(total.expenses)}</Td>
            <Td className={cx("text-right tabular-nums", total.netProfit < 0 && "text-red-600 dark:text-red-400")}>{money0(total.netProfit)}</Td>
            <Td className="text-right tabular-nums">{pct(total.netMarginPct)}</Td>
          </tr>
        </tbody>
      </Table>
      <p className="text-xs text-ink-soft">
        How this is worked out: sales are invoices less credit notes (before GST) by invoice date. Cost of goods is what delivered supply orders cost us,
        plus materials issued to project sites, less site returns and customer returns put back in stock. Purchases only count once the goods are delivered or issued.
        Expenses are approved vouchers by voucher date.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ b) orders
function OrdersTab({ rows, p, today, canOrders }: { rows: OrderPnl[]; p: ReportParams; today: string; canOrders: boolean }) {
  const t = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, cost: a.cost + r.cost, profit: a.profit + r.grossProfit }), { revenue: 0, cost: 0, profit: 0 });
  const losing = rows.filter((r) => r.revenue > 0 && r.grossProfit < 0).length;
  return (
    <div className="space-y-4">
      <Filters p={p} today={today} period periodAll search placeholder="Order, customer PO or customer">
        <Select name="kind" defaultValue={p.kind ?? ""} aria-label="Order type" className="sm:max-w-40">
          <option value="">All orders</option>
          <option value="supply">Supply only</option>
          <option value="project">Project orders</option>
        </Select>
        <Select name="sort" defaultValue={p.sort} aria-label="Sort" className="sm:max-w-48">
          <option value="margin_asc">Lowest margin first</option>
          <option value="margin_desc">Highest margin first</option>
          <option value="profit_desc">Biggest profit first</option>
          <option value="revenue_desc">Biggest revenue first</option>
          <option value="date_desc">Newest first</option>
        </Select>
      </Filters>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <Stat label="Orders" value={qty(rows.length)} hint={periodLabel(p.fy)} />
        <Stat label="Revenue" value={moneyShort(t.revenue)} hint="Invoiced less credit notes" />
        <Stat label="Gross profit" value={moneyShort(t.profit)} hint={t.revenue ? `${pct((t.profit / t.revenue) * 100)} margin` : undefined} tone={t.profit < 0 ? "bad" : "good"} />
        <Stat label="Orders losing money" value={qty(losing)} tone={losing ? "bad" : "good"} hint="Billed, but cost more than revenue" />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={LineChart} title="No orders in this view">Try another period or clear the search.</EmptyState>
      ) : (
        <Table tall>
          <thead>
            <tr>
              <Th>Order</Th><Th>Customer</Th><Th className="text-right">Revenue</Th><Th className="text-right">Cost</Th>
              <Th className="text-right">Gross profit</Th><Th className="text-right">Margin</Th><Th>Delivered</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.orderId} className="hover:bg-muted/60">
                <Td>
                  {canOrders ? <Link href={`/orders/${r.orderId}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.number}</Link> : <span className="font-medium">{r.number}</span>}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                    {fmtDate(r.orderDate)}{r.customerPoNumber ? ` · PO ${r.customerPoNumber}` : ""}
                    {r.supplyOnly ? <Badge tone="blue">Supply</Badge> : <Badge tone="violet">Project {r.projectCode ?? ""}</Badge>}
                    {r.linesWithoutCost > 0 && <Badge tone="amber">{r.linesWithoutCost} without cost</Badge>}
                  </div>
                </Td>
                <Td className="max-w-52 truncate">{r.customerName}</Td>
                <Td className="text-right tabular-nums">{money0(r.revenue)}{r.creditNotes > 0 && <div className="text-xs text-ink-soft">less {money0(r.creditNotes)} CN</div>}</Td>
                <Td className="text-right tabular-nums">{money0(r.cost)}</Td>
                <Td className={cx("text-right font-medium tabular-nums", r.grossProfit < 0 ? "text-red-600 dark:text-red-400" : "text-ink")}>{money0(r.grossProfit)}</Td>
                <Td className={cx("text-right tabular-nums", marginTone(r.marginPct, r.revenue !== 0))}>{r.revenue ? pct(r.marginPct) : "not billed"}</Td>
                <Td><DeliveredBar value={r.deliveredPct} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="text-xs text-ink-soft">Revenue is invoiced value before GST less posted credit notes. Cost is each delivered line at the cost on the day it went out, less goods returned to stock.</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ c) projects
function ProjectsTab({ rows, p }: { rows: ProjectProfit[]; p: ReportParams }) {
  const t = rows.reduce((a, r) => ({ cv: a.cv + r.contractValue, cost: a.cost + r.actualCost, inv: a.inv + r.invoiced, rec: a.rec + r.received }), { cv: 0, cost: 0, inv: 0, rec: 0 });
  return (
    <div className="space-y-4">
      <form method="get" action="/reports" className="mb-4 flex flex-col gap-2 rounded-2xl border border-line bg-surface p-2 shadow-xs sm:flex-row sm:items-center">
        <input type="hidden" name="tab" value="projects" />
        <Select name="status" defaultValue={p.status ?? ""} aria-label="Status" className="sm:max-w-44">
          <option value="">All statuses</option>
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </Select>
        <Button variant="secondary" type="submit">Apply</Button>
      </form>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <Stat label="Contract value" value={moneyShort(t.cv)} hint={`${rows.length} project${rows.length === 1 ? "" : "s"}`} />
        <Stat label="Actual cost" value={moneyShort(t.cost)} hint="Materials and approved expenses" />
        <Stat label="Margin on contract" value={moneyShort(t.cv - t.cost)} tone={t.cv - t.cost < 0 ? "bad" : "good"} hint={t.cv ? `${pct(((t.cv - t.cost) / t.cv) * 100)}` : undefined} />
        <Stat label="Invoiced / received" value={moneyShort(t.inv)} hint={`${moneyShort(t.rec)} received`} />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No projects here">Projects appear once an order is won and a project is opened for it.</EmptyState>
      ) : (
        <Table tall>
          <thead>
            <tr>
              <Th>Project</Th><Th className="text-right">Contract</Th><Th className="text-right">Actual cost</Th><Th className="text-right">Invoiced</Th>
              <Th className="text-right">Received</Th><Th className="text-right">Margin</Th><Th>Budget used</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.projectId} className="hover:bg-muted/60">
                <Td>
                  <Link href={`/projects/${r.projectId}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.name}</Link>
                  <div className="text-xs text-ink-soft">{r.code} · {r.customerName} · {r.status.replace("_", " ")}</div>
                </Td>
                <Td className="text-right tabular-nums">{money0(r.contractValue)}</Td>
                <Td className="text-right tabular-nums">{money0(r.actualCost)}</Td>
                <Td className="text-right tabular-nums">{money0(r.invoiced)}{r.creditNotes > 0 && <div className="text-xs text-ink-soft">after {money0(r.creditNotes)} CN</div>}</Td>
                <Td className="text-right tabular-nums">{money0(r.received)}{r.netDue > 0.5 && <div className="text-xs text-amber-700 dark:text-amber-400">{money0(r.netDue)} due</div>}</Td>
                <Td className={cx("text-right tabular-nums", marginTone(r.marginPct, r.contractValue !== 0))}>
                  {r.contractValue ? pct(r.marginPct) : "-"}<div className="text-xs text-ink-soft">{money0(r.margin)}</div>
                </Td>
                <Td><BudgetBar usedPct={r.budgetUsedPct} budget={r.budget} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="text-xs text-ink-soft">Margin is contract value less actual cost. Actual cost is materials issued to site, less returns, plus approved expense vouchers. Received includes advances.</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ d) customers
function CustomersTab({ rows, p, canCustomers }: { rows: CustomerProfit[]; p: ReportParams; canCustomers: boolean }) {
  return (
    <div className="space-y-4">
      <Filters p={p} today="" search placeholder="Customer name" />
      {rows.length === 0 ? (
        <EmptyState title={p.q ? "No customer matches" : "No sales yet"}>{p.q ? "Try a shorter name." : "Customer profit shows once invoices are raised."}</EmptyState>
      ) : (
        <Table tall>
          <thead>
            <tr>
              <Th>Customer</Th><Th className="text-right">Revenue</Th><Th className="text-right">Cost</Th><Th className="text-right">Gross profit</Th>
              <Th className="text-right">Margin</Th><Th className="text-right">Outstanding</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.customerId} className="hover:bg-muted/60">
                <Td>
                  {canCustomers ? <Link href={`/customers/${r.customerId}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.name}</Link> : <span className="font-medium">{r.name}</span>}
                  {r.projectCount > 0 && <div className="text-xs text-ink-soft">{r.projectCount} project{r.projectCount === 1 ? "" : "s"}</div>}
                </Td>
                <Td className="text-right tabular-nums">{money0(r.revenue)}{r.creditNotes > 0 && <div className="text-xs text-ink-soft">after {money0(r.creditNotes)} CN</div>}</Td>
                <Td className="text-right tabular-nums">{money0(r.cost)}</Td>
                <Td className={cx("text-right font-medium tabular-nums", r.grossProfit < 0 ? "text-red-600 dark:text-red-400" : "text-ink")}>{money0(r.grossProfit)}</Td>
                <Td className={cx("text-right tabular-nums", marginTone(r.marginPct, r.revenue !== 0))}>{r.revenue ? pct(r.marginPct) : "-"}</Td>
                <Td className={cx("text-right tabular-nums", r.outstanding > 0.5 && "text-amber-700 dark:text-amber-400")}>{money0(r.outstanding)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="text-xs text-ink-soft">Cost is what supply orders cost us when delivered (less goods returned to stock) plus the actual cost of the customer&apos;s projects. Outstanding includes GST and is after credit notes and unused advances.</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ e) items
function ItemsTab({ rows, p }: { rows: ItemMargin[]; p: ReportParams }) {
  const flagged = rows.filter((r) => r.sellingBelowCost).length;
  return (
    <div className="space-y-4">
      <Filters p={p} today="" search placeholder="Item name, code, group or make">
        <Select name="system" defaultValue={p.system ?? ""} aria-label="System" className="sm:max-w-52">
          <option value="">All systems</option>
          {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <label className="inline-flex items-center gap-2 px-1 text-sm text-ink">
          <input type="checkbox" name="flagged" value="1" defaultChecked={p.flagged} className="h-4 w-4 accent-brand-600" /> Only selling below cost
        </label>
      </Filters>
      {flagged > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {flagged} item{flagged === 1 ? " was" : "s were"} last sold below today&apos;s buying cost. Update the selling rate before the next quote.
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState title="No items match">Items appear here once they have been bought or sold at least once.</EmptyState>
      ) : (
        <Table tall>
          <thead>
            <tr>
              <Th>Item</Th><Th className="text-right">Avg buy, 90 days</Th><Th className="text-right">Avg buy, all time</Th>
              <Th className="text-right">Latest cost</Th><Th className="text-right">Avg sell</Th><Th className="text-right">Last sale</Th>
              <Th className="text-right">Qty sold</Th><Th className="text-right">Margin</Th><Th>Last bought / sold</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.itemId} className={cx("hover:bg-muted/60", r.sellingBelowCost && "bg-red-50/60 dark:bg-red-950/20")}>
                <Td>
                  <Link href={`/items/${r.itemId}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.name}</Link>
                  <div className="text-xs text-ink-soft">{r.code} · {r.groupName}{r.sellingBelowCost && <Badge tone="red" className="ml-2">Below cost</Badge>}</div>
                </Td>
                <Td className="text-right tabular-nums">{money0(r.avgPurchase90)}</Td>
                <Td className="text-right tabular-nums">{money0(r.avgPurchaseAll)}</Td>
                <Td className="text-right tabular-nums">{money0(r.latestCost)}</Td>
                <Td className="text-right tabular-nums">{money0(r.avgSale)}</Td>
                <Td className={cx("text-right tabular-nums", r.sellingBelowCost && "font-semibold text-red-600 dark:text-red-400")}>{money0(r.lastSaleRate)}</Td>
                <Td className="text-right tabular-nums">{r.qtySold ? `${qty(r.qtySold)} ${r.uom}` : "-"}</Td>
                <Td className={cx("text-right tabular-nums", r.marginPct == null ? "text-ink-faint" : marginTone(r.marginPct))}>
                  {r.marginPct == null ? "-" : pct(r.marginPct)}
                  {r.marginAtLatestPct != null && <div className="text-xs text-ink-soft">{pct(r.marginAtLatestPct)} at latest cost</div>}
                </Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">
                  <div>Bought {fmtDate(r.lastPurchaseDate)}</div>
                  <div>Sold {fmtDate(r.lastSaleDate)}</div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="text-xs text-ink-soft">Averages are weighted by quantity from the price history of posted purchase bills and issued invoices. Latest cost is the last purchase rate, or the list price when the item has never been bought.</p>
    </div>
  );
}

function DeliveredBar({ value }: { value: number }) {
  const w = Math.max(0, Math.min(100, value));
  return (
    <div className="flex min-w-28 items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-line" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label="Delivered">
        <div className={cx("h-full rounded-full", value >= 100 ? "bg-emerald-600" : "bg-blue-600")} style={{ width: `${w}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-ink-soft">{pct(value, 0)}</span>
    </div>
  );
}
