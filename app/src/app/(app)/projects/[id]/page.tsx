import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Download, FileText, History, Package, Pencil, Printer, Receipt, Scale, StickyNote, Truck, Wallet } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { canApproveExpenses, canRead } from "@/lib/rbac";
import { EXPENSE_CATEGORIES, PROJECT_STATUSES } from "@/lib/constants";
import { fmtDate, money, money0, pct, qty } from "@/lib/format";
import { CardLink, Field, Flash, LinkButton, Select, Textarea, buttonClass, cx } from "@/components/ui";
import {
  Callout, DetailPage, KeyValueGrid, MetaChip, Metric, MetricStrip, ResponsiveTable, SectionCard, StatusPill, SummaryRows, Tabs, activeTab,
  statusLabel, type Column, type TabItem,
} from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { BudgetBar, ProgressBar } from "../_components/budget-bar";
import { projectAccess } from "../_lib/access";
import { loadCostingSheet } from "../_lib/sheet";
import { loadProjectHistory } from "../_lib/history";
import { HistoryFeed, HistoryFilters, applyHistoryFilter, historyFilter, type HistorySP } from "../_components/history-feed";
import { BuyVsSellTable } from "../_components/buy-vs-sell";
import { projectBuyVsSell } from "@/lib/reports";
import { LinkedPosCard } from "../../purchase-orders/_components/linked-pos-card";
import { addProjectNote, setProjectStatus } from "../actions";

export const metadata = { title: "Project" };

const catLabel = (k: string) => EXPENSE_CATEGORIES[k as keyof typeof EXPENSE_CATEGORIES] ?? k;
const link = "font-medium text-brand-700 hover:underline dark:text-brand-300";

type SP = HistorySP & { ok?: string; err?: string; tab?: string };
type Sheet = NonNullable<Awaited<ReturnType<typeof loadCostingSheet>>>;

export default async function ProjectSheetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireUser("projects");
  const { id } = await params;
  const sp = await searchParams;
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0) notFound();
  const db = await getDb();
  const s = await loadCostingSheet(db, pid);
  if (!s) notFound();
  const { project: p, cost: c } = s;
  const acc = projectAccess(user, p);
  // only render links the viewer can open (avoid landing on /forbidden)
  const canPurchases = canRead(user.role, "purchases"), canBilling = canRead(user.role, "billing"), canQuotes = canRead(user.role, "quotations");
  const canReturns = canRead(user.role, "returns");
  const canOpenExpense = (ownerId: number | null) => canApproveExpenses(user.role) || ownerId === user.id;
  const remainingBudget = round(c.budget - c.actualCost);

  // ------------------------------------------------------------------ tabs (?tab=)
  const tabIds = acc.spend
    ? (["costing", "materials", ...(acc.full ? ["buy-vs-sell" as const] : []), "expenses", ...(acc.full ? ["billing" as const] : []), "orders", "history"] as const)
    : (["orders"] as const);
  const tab = activeTab(sp.tab, tabIds);
  const tabItems: TabItem[] = [
    { id: "costing", label: "Costing" },
    { id: "materials", label: "Materials", count: s.issues.length },
    ...(acc.full ? [{ id: "buy-vs-sell", label: "Buy vs sell" }] : []),
    { id: "expenses", label: "Expenses", count: s.expenses.length, alert: s.expenses.some((e) => e.status === "pending") },
    ...(acc.full ? [{ id: "billing", label: "Billing", count: s.invoices.length }] : []),
    { id: "orders", label: "Orders", count: s.orders.length },
    { id: "history", label: "History" },
  ];
  const base = `/projects/${p.id}`;
  const filter = historyFilter(sp);
  const [buyVsSell, history] = await Promise.all([
    tab === "buy-vs-sell" && acc.full ? projectBuyVsSell(db, { projectId: p.id }) : Promise.resolve([]),
    tab === "history" ? loadProjectHistory(db, p, user, acc.full) : Promise.resolve([]),
  ]);
  const printHref = `/projects/${p.id}/history${filter.types.length || filter.oldestFirst ? `?${new URLSearchParams([...filter.types.map((t) => ["t", t]), ...(filter.oldestFirst ? [["order", "oldest"]] : [])]).toString()}` : ""}`;

  // ------------------------------------------------------------------ table columns
  type Issue = Sheet["issues"][number];
  const issueCols: Column<Issue>[] = [
    { key: "item", header: "Item", card: "title", className: "max-w-72 whitespace-normal", cell: (m) => <><div className="font-medium">{m.itemName}</div><div className="text-caption font-normal text-ink-soft">{m.itemCode}</div></> },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (m) => fmtDate(m.date) },
    { key: "qty", header: "Qty", align: "right", nowrap: true, cell: (m) => <>{qty(m.absQty)} {m.uom}</> },
    ...(acc.full ? [{ key: "rate", header: "Rate", align: "right" as const, nowrap: true, cell: (m: Issue) => money(m.rate) }] : []),
    { key: "value", header: "Value", align: "right", card: "amount", nowrap: true, cell: (m) => money(m.value) },
    { key: "source", header: "Source", priority: 3, className: "text-caption text-ink-soft",
      cell: (m) => (m.refType === "purchase_invoice" ? "Direct purchase" : m.refType ? statusLabel(m.refType) : "Store issue") },
  ];
  const returnCols = issueCols.filter((col) => col.key !== "source");
  const totalRow = (label: string, value: number, span: number, trailing = 0) => (
    <tr className="bg-muted font-semibold">
      <td className="ui-td" colSpan={span}>{label}</td>
      <td className="ui-td text-right tabular-nums">{money(value)}</td>
      {trailing > 0 && <td className="ui-td" colSpan={trailing} />}
    </tr>
  );

  type Pur = Sheet["purchases"][number];
  const purCols: Column<Pur>[] = [
    { key: "no", header: "Invoice", card: "title", nowrap: true, cell: (pi) => (canPurchases ? <Link className={cx("rt-stretch", link)} href={`/purchases/${pi.id}`}>{pi.invoiceNo}</Link> : pi.invoiceNo) },
    { key: "vendor", header: "Vendor", card: "subtitle", cell: (pi) => pi.vendorName },
    { key: "date", header: "Date", nowrap: true, cell: (pi) => fmtDate(pi.invoiceDate) },
    { key: "status", header: "Status", card: "badge", cell: (pi) => <StatusPill status={pi.status} /> },
    { key: "sub", header: "Subtotal", align: "right", priority: 3, nowrap: true, cell: (pi) => money(pi.subtotal) },
    { key: "total", header: "Total", align: "right", card: "amount", nowrap: true, cell: (pi) => money(pi.total) },
  ];

  type Exp = Sheet["expenses"][number];
  const expCols: Column<Exp>[] = [
    {
      key: "no", header: "Voucher", card: "title", nowrap: true,
      cell: (e) => (
        <>
          {canOpenExpense(e.userId) ? <Link className={cx("rt-stretch", link)} href={`/expenses/${e.expenseId}`}>{e.voucherNo}</Link> : <span className="font-medium">{e.voucherNo}</span>}
          {e.description && <div className="max-w-64 truncate text-caption font-normal text-ink-soft">{e.description}</div>}
        </>
      ),
    },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (e) => fmtDate(e.date) },
    { key: "cat", header: "Category", cell: (e) => catLabel(e.category) },
    { key: "by", header: "Entered by", priority: 3, cell: (e) => e.userName ?? "-" },
    { key: "status", header: "Status", card: "badge", cell: (e) => <StatusPill status={e.status} /> },
    {
      key: "amount", header: "Allocated", align: "right", card: "amount", nowrap: true,
      cell: (e) => <>{money(e.amount)}{Math.abs(Number(e.voucherTotal) - Number(e.amount)) > 0.009 && <div className="text-caption font-normal text-ink-soft">split of {money0(e.voucherTotal)}</div>}</>,
    },
  ];

  type Inv = Sheet["invoices"][number];
  const invCols: Column<Inv>[] = [
    { key: "no", header: "Invoice", card: "title", nowrap: true, cell: (i) => (canBilling ? <Link className={cx("rt-stretch", link)} href={`/billing/invoices/${i.id}`}>{i.number}</Link> : i.number) },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (i) => fmtDate(i.invoiceDate) },
    { key: "status", header: "Status", card: "badge", cell: (i) => <StatusPill status={i.status} /> },
    { key: "sub", header: "Excl. GST", align: "right", card: "amount", nowrap: true, cell: (i) => money(i.subtotal) },
    { key: "paid", header: "Paid", align: "right", nowrap: true, cell: (i) => money(i.paidAmount) },
  ];

  type Rec = Sheet["receipts"][number];
  const recCols: Column<Rec>[] = [
    { key: "date", header: "Date", card: "title", nowrap: true, cell: (r) => fmtDate(r.date) },
    {
      key: "inv", header: "Invoice", card: "subtitle",
      cell: (r) => (r.isAdvance ? <span className="text-ink-soft">Advance{Number(r.allocatedAmount) > 0 ? `, ${money0(r.allocatedAmount)} applied` : ""}</span> : r.invoiceNumber),
    },
    { key: "mode", header: "Mode", cell: (r) => <><span className="uppercase">{r.mode}</span>{r.reference ? <span className="text-ink-soft"> · {r.reference}</span> : null}</> },
    { key: "amount", header: "Amount", align: "right", card: "amount", nowrap: true, cell: (r) => money(r.amount) },
  ];

  type Cn = Sheet["creditNotes"][number];
  const cnCols: Column<Cn>[] = [
    { key: "no", header: "Credit note", card: "title", nowrap: true, cell: (cn) => (canReturns ? <Link className={cx("rt-stretch", link)} href={`/returns/${cn.id}`}>{cn.number}</Link> : cn.number) },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (cn) => fmtDate(cn.date) },
    { key: "reason", header: "Reason", cell: (cn) => statusLabel(cn.reason) },
    { key: "status", header: "Status", card: "badge", cell: (cn) => <StatusPill status={cn.status} /> },
    { key: "sub", header: "Excl. GST", align: "right", card: "amount", nowrap: true, cell: (cn) => money(cn.subtotal) },
    { key: "adj", header: "Adjusted", align: "right", nowrap: true, cell: (cn) => money(cn.adjustedAmount) },
  ];

  type Ord = Sheet["orders"][number];
  const ordCols: Column<Ord>[] = [
    { key: "no", header: "Order", card: "title", nowrap: true, cell: (o) => <Link className={cx("rt-stretch", link)} href={`/orders/${o.id}`}>{o.number}</Link> },
    { key: "po", header: "Customer PO", card: "subtitle", cell: (o) => o.customerPoNumber ?? "-" },
    { key: "date", header: "Date", nowrap: true, cell: (o) => fmtDate(o.orderDate) },
    { key: "status", header: "Status", card: "badge", cell: (o) => <StatusPill status={o.status} /> },
    { key: "delivered", header: "Delivered", cell: (o) => <ProgressBar value={o.deliveredPct} label="Delivered" /> },
    {
      key: "pending", header: "Pending lines",
      cell: (o) => (o.pendingLines ? <StatusPill semantic="warning" label={`${o.pendingLines} of ${o.lineCount} pending`} /> : <StatusPill semantic="success" label="All delivered" />),
    },
  ];

  // ------------------------------------------------------------------ actions
  const expenseBtn = (variant: "primary" | "secondary") => (
    <LinkButton variant={variant} href={`/expenses/new?projectId=${p.id}`}><Receipt className="icon-sm" aria-hidden /> Add expense</LinkButton>
  );
  const editBtn = (variant: "primary" | "secondary") => (
    <LinkButton variant={variant} href={`/projects/${p.id}/edit`}><Pencil className="icon-sm" aria-hidden /> Edit project</LinkButton>
  );
  const primary = acc.spend ? expenseBtn("primary") : acc.edit ? editBtn("primary") : null;
  const hasSecondary = (acc.spend && acc.edit) || acc.full;
  const secondary = (
    <>
      {acc.spend && acc.edit && editBtn("secondary")}
      {acc.full && (
        <a className={buttonClass("secondary")} href={`/projects/${p.id}/export`}>
          <Download className="icon-sm" aria-hidden /> Download Excel
        </a>
      )}
    </>
  );

  const details = (
    <KeyValueGrid columns={1} items={[
      { label: "Code", value: p.code },
      { label: "Customer", value: s.customerName },
      { label: "Site engineer", value: s.engineerName ?? "Unassigned" },
      { label: "Quotation", value: s.quotationNumber && p.quotationId ? (canQuotes ? <Link className={link} href={`/quotations/${p.quotationId}`}>{s.quotationNumber}</Link> : s.quotationNumber) : null },
      { label: "Start", value: fmtDate(p.startDate) },
      { label: "End", value: fmtDate(p.endDate) },
      { label: "Site address", value: p.siteAddress },
    ]} />
  );

  return (
    <DetailPage
      back={{ href: "/projects", label: "Projects" }}
      eyebrow="Project"
      title={p.name}
      status={<StatusPill status={p.status} />}
      meta={
        <>
          <MetaChip label="Code">{p.code}</MetaChip>
          <MetaChip label="Customer">{s.customerName}</MetaChip>
          <MetaChip label="Engineer">{s.engineerName ?? "Unassigned"}</MetaChip>
          {acc.full && c.contractValue > 0 && <MetaChip label="Contract">{money0(c.contractValue)}</MetaChip>}
          {(p.startDate || p.endDate) && <MetaChip label="Dates">{fmtDate(p.startDate)} to {fmtDate(p.endDate)}</MetaChip>}
        </>
      }
      primaryAction={primary}
      secondaryActions={hasSecondary ? secondary : undefined}
      notices={
        <>
          <Flash ok={sp.ok} err={sp.err} />
          {acc.spend && c.budget > 0 && c.budgetUsedPct > 100 && (
            <Callout tone="danger" title={`Over budget by ${money0(-remainingBudget)}`}>
              {money0(c.actualCost)} has been spent against a budget of {money0(c.budget)}. Review the materials and expenses, or raise the budget.
            </Callout>
          )}
          {!acc.spend && (
            <Callout tone="info" title="Costing is limited to the project team">
              Costing details are visible to the assigned engineer and management.
            </Callout>
          )}
        </>
      }
      tabs={acc.spend && <Tabs label="Project sections" basePath={base} params={{ tab: sp.tab }} active={tab} items={tabItems} />}
      aside={
        <>
          <SectionCard title="Project details">{details}</SectionCard>
          <SectionCard title="Status and notes" icon={StickyNote}>
            {acc.edit && (
              <form action={setProjectStatus} className="mb-4 flex flex-col gap-2">
                <input type="hidden" name="id" value={p.id} />
                <Field label="Status">
                  <Select name="status" defaultValue={p.status}>
                    {PROJECT_STATUSES.map((st) => <option key={st} value={st}>{statusLabel(st)}</option>)}
                  </Select>
                </Field>
                <SubmitButton variant="secondary" pendingText="Updating…">Update status</SubmitButton>
              </form>
            )}
            {p.notes ? (
              <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-sm text-ink">{p.notes}</pre>
            ) : (
              <p className="text-sm text-ink-soft">No notes yet.{acc.edit ? " Add a site update below." : ""}</p>
            )}
            {acc.edit && (
              <form action={addProjectNote} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={p.id} />
                <Textarea name="note" rows={2} required maxLength={2000} placeholder="Add a site update or note" aria-label="New note" />
                <SubmitButton size="sm" pendingText="Adding…" className="max-sm:w-full">Add note</SubmitButton>
              </form>
            )}
          </SectionCard>
        </>
      }
    >
      {tab === "costing" && (
        <>
          <MetricStrip>
            {acc.full && <Metric label="Contract value" value={money0(c.contractValue)} hint="Excl. GST" />}
            <Metric label="Budget" value={money0(c.budget)} hint={c.budget ? `Remaining ${money0(remainingBudget)}` : "Not set"} tone={c.budget && remainingBudget < 0 ? "bad" : "default"} />
            <Metric label="Actual cost" value={money0(c.actualCost)} hint={c.pendingExpenses ? `Plus ${money0(c.pendingExpenses)} in vouchers awaiting approval` : "Materials and approved expenses"} />
            {acc.full ? (
              <Metric label="Margin" value={money0(c.margin)} hint={c.contractValue ? `${pct(c.marginPct)} of contract` : "Set the contract value"}
                tone={c.margin < 0 ? "bad" : c.contractValue && c.marginPct < 10 ? "warn" : "good"} />
            ) : (
              <Metric label="Budget used" value={c.budget ? pct(c.budgetUsedPct, 0) : "-"} tone={c.budgetUsedPct > 100 ? "bad" : c.budgetUsedPct >= 80 ? "warn" : "default"} />
            )}
          </MetricStrip>

          <SectionCard title="Budget burn">
            <BudgetBar usedPct={c.budgetUsedPct} budget={c.budget} />
            {c.budget > 0 && (
              <p className="mt-2 text-sm text-ink-soft">
                {money0(c.actualCost)} of {money0(c.budget)} spent
                {c.budgetUsedPct > 100 && <span className="font-semibold text-danger">, over budget by {money0(-remainingBudget)}</span>}
              </p>
            )}
          </SectionCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Cost breakdown">
              <SummaryRows rows={[
                ["Materials issued to site", amt(c.materials)],
                ["Less materials returned", amt(-c.returns)],
                ...(c.customerReturns > 0 ? [["Less customer returns put back in stock", amt(-c.customerReturns)] as [ReactNode, ReactNode]] : []),
                ...Object.entries(c.expensesByCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => [`Expense: ${catLabel(k)}`, amt(v)] as [ReactNode, ReactNode]),
                ...(Object.keys(c.expensesByCategory).length === 0 ? [["Approved expenses", amt(0)] as [ReactNode, ReactNode]] : []),
              ]} />
              <TotalLine label="Actual cost" value={c.actualCost} />
              {acc.full && (
                <>
                  <SummaryRows className="mt-3" rows={[["Contract value", amt(c.contractValue)]]} />
                  <TotalLine label={`Profit${c.contractValue ? ` (${pct(c.marginPct)})` : ""}`} value={c.margin} tone={c.margin < 0 ? "bad" : "good"} />
                </>
              )}
            </SectionCard>

            {acc.full && (
              <SectionCard title="Billed, received and standing" description="Invoiced amounts exclude GST. Received and net due include GST, count advances as cash and leave out credit note adjustments.">
                <SummaryRows rows={[
                  ["Invoiced to customer (excl. GST)", amt(c.invoicedGross)],
                  ...(c.creditNotes > 0 ? [["Less credit notes (excl. GST)", amt(-c.creditNotes)] as [ReactNode, ReactNode]] : []),
                  ["Received from customer (incl. GST)", amt(c.received)],
                  ...(c.advances > 0 ? [["Of which advances", amt(c.advances)] as [ReactNode, ReactNode]] : []),
                  ["Yet to invoice (contract less invoiced)", amt(Math.max(0, round(c.contractValue - c.invoiced)))],
                ]} />
                <TotalLine label="Net due from customer (incl. GST)" value={c.netDue} tone={c.netDue > 0.5 ? "warn" : undefined} />
                <TotalLine label="Cash position (received less spent)" value={round(c.received - c.actualCost)} tone={c.received - c.actualCost < 0 ? "bad" : "good"} />
              </SectionCard>
            )}
          </div>
        </>
      )}

      {tab === "materials" && (
        <>
          <SectionCard title="Materials issued" count={s.issues.length} icon={Package} flush={s.issues.length > 0}
            empty={s.issues.length === 0 && "No materials issued to this project yet. Store issues and project-tagged purchase invoices appear here."}>
            <ResponsiveTable flush rows={s.issues} columns={issueCols} rowKey={(m) => m.id} caption="Materials issued"
              footer={totalRow("Total issued", c.materials, issueCols.length - 2, 1)} />
          </SectionCard>
          {s.returns.length > 0 && (
            <SectionCard title="Materials returned" count={s.returns.length} flush>
              <ResponsiveTable flush rows={s.returns} columns={returnCols} rowKey={(m) => m.id} caption="Materials returned"
                footer={totalRow("Total returned", c.returns, returnCols.length - 1)} />
            </SectionCard>
          )}
          {acc.full && (
            <SectionCard title="Purchase invoices tagged to this project" count={s.purchases.length} flush={s.purchases.length > 0}
              description="Posted invoices are already counted in materials issued (direct to site purchases). Drafts are not counted until posted."
              empty={s.purchases.length === 0 && "No purchase invoices are tagged to this project."}>
              <ResponsiveTable flush rows={s.purchases} columns={purCols} rowKey={(pi) => pi.id} caption="Purchase invoices" />
            </SectionCard>
          )}
          {acc.full && <LinkedPosCard role={user.role} projectId={p.id} hideWhenEmpty />}
        </>
      )}

      {tab === "buy-vs-sell" && acc.full && (
        <SectionCard title="Buy vs sell" icon={Scale} flush description="Average buying rate of what went to site, against the rate we sell it at.">
          <BuyVsSellTable rows={buyVsSell} />
        </SectionCard>
      )}

      {tab === "expenses" && (
        <SectionCard title="Expense vouchers" count={s.expenses.length} icon={Wallet} flush={s.expenses.length > 0}
          description="Only approved vouchers count in the actual cost."
          actions={<CardLink href={`/expenses/new?projectId=${p.id}`}>Add expense</CardLink>}
          empty={s.expenses.length === 0 && "No expense vouchers allocated to this project yet. Add one for petrol, lodging, food or labour at site."}>
          <ResponsiveTable flush rows={s.expenses} columns={expCols} rowKey={(e) => e.allocationId} caption="Expense vouchers" />
        </SectionCard>
      )}

      {tab === "billing" && acc.full && (
        <>
          <SectionCard title="Sales invoices" count={s.invoices.length} icon={FileText} flush={s.invoices.length > 0}
            empty={s.invoices.length === 0 && "Nothing invoiced yet. Invoices raised against this project's orders appear here."}>
            <ResponsiveTable flush rows={s.invoices} columns={invCols} rowKey={(i) => i.id} caption="Sales invoices" />
          </SectionCard>
          <SectionCard title="Receipts" count={s.receipts.length} icon={Wallet} flush={s.receipts.length > 0}
            empty={s.receipts.length === 0 && "No payments received yet."}>
            <ResponsiveTable flush rows={s.receipts} columns={recCols} rowKey={(r) => r.id} caption="Receipts" />
          </SectionCard>
          {s.creditNotes.length > 0 && (
            <SectionCard title="Credit notes" count={s.creditNotes.length} flush
              description="Posted credit notes reduce what was invoiced. Restocked goods also come off the actual cost.">
              <ResponsiveTable flush rows={s.creditNotes} columns={cnCols} rowKey={(cn) => cn.id} caption="Credit notes" />
            </SectionCard>
          )}
        </>
      )}

      {tab === "orders" && (
        <SectionCard title="Customer orders and delivery" count={s.orders.length} icon={Truck} flush={s.orders.length > 0}
          empty={s.orders.length === 0 && "No customer orders are linked to this project."}>
          <ResponsiveTable flush rows={s.orders} columns={ordCols} rowKey={(o) => o.id} caption="Customer orders" />
        </SectionCard>
      )}

      {tab === "history" && (
        <SectionCard title="Project history" icon={History}
          description="Everything that happened on this project, from the first quote to the last service call."
          actions={<LinkButton variant="secondary" size="sm" href={printHref}><Printer className="icon-sm" aria-hidden /> Printable view</LinkButton>}>
          <div className="space-y-5">
            <HistoryFilters action={base} events={history} filter={filter} hidden={{ tab: "history" }} />
            <HistoryFeed events={applyHistoryFilter(history, filter)} />
          </div>
        </SectionCard>
      )}
    </DetailPage>
  );
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/** Money value for a breakdown row; deductions in the danger colour. */
function amt(value: number) {
  return <span className={cx(value < 0 ? "text-danger" : "text-ink")}>{money(value)}</span>;
}

function TotalLine({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className={cx("mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-2 text-sm font-semibold",
      tone === "good" ? "text-success" : tone === "warn" ? "text-warning" : tone === "bad" ? "text-danger" : "text-ink")}>
      <span>{label}</span>
      <span className="tabular-nums">{money(value)}</span>
    </div>
  );
}
