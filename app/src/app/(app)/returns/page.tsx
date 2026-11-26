import Link from "next/link";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { customers, purchaseInvoices, purchaseReturns, salesInvoices, salesOrders, salesReturns, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { fmtDate, money, moneyShort, round2 } from "@/lib/format";
import { noteBalance, reasonLabel } from "@/lib/returns";
import { Flash, LinkButton, Select } from "@/components/ui";
import {
  ListEmpty, ListFilters, ListPage, Metric, MetricStrip, ResponsiveTable, StatusPill, Tabs, statusLabel, type Column,
} from "@/components/patterns";

export const metadata = { title: "Returns" };

type SP = { tab?: string; q?: string; status?: string; ok?: string; err?: string };
const STATUSES = ["draft", "posted"] as const;

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("returns");
  const sp = await searchParams;
  const tab = sp.tab === "vendor" ? "vendor" : "customer";
  const q = sp.q?.trim().slice(0, 80);
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const write = canWrite(user.role, "returns");
  const db = await getDb();
  const filtered = !!(q || status);
  const activeCount = [q, status].filter(Boolean).length;
  const clearHref = tab === "vendor" ? "/returns?tab=vendor" : "/returns";
  const tabs = <Tabs label="Return types" basePath="/returns" active={tab} items={[{ id: "customer", label: "Customer returns" }, { id: "vendor", label: "Returns to vendor" }]} />;
  const statusSelect = (
    <Select name="status" defaultValue={status ?? ""} aria-label="Status">
      <option value="">Any status</option>
      {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
    </Select>
  );
  const pageProps = {
    title: "Returns",
    subtitle: "Goods coming back from customers and goods going back to vendors.",
    notices: <Flash ok={sp.ok} err={sp.err} />,
  };

  if (tab === "vendor") {
    const where: SQL[] = [];
    if (status) where.push(eq(purchaseReturns.status, status));
    if (q) { const c = or(ilike(purchaseReturns.number, `%${q}%`), ilike(vendors.name, `%${q}%`), ilike(purchaseInvoices.invoiceNo, `%${q}%`)); if (c) where.push(c); }
    const rows = await db
      .select({ r: purchaseReturns, vendorName: vendors.name, billNo: purchaseInvoices.invoiceNo })
      .from(purchaseReturns)
      .leftJoin(vendors, eq(vendors.id, purchaseReturns.vendorId))
      .leftJoin(purchaseInvoices, eq(purchaseInvoices.id, purchaseReturns.purchaseInvoiceId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(purchaseReturns.date), desc(purchaseReturns.id))
      .limit(300);
    const posted = rows.filter((x) => x.r.status === "posted");
    const unadjusted = round2(posted.reduce((s, x) => s + noteBalance(x.r.total, x.r.adjustedAmount), 0));
    type Row = (typeof rows)[number];
    const cols: Column<Row>[] = [
      { key: "no", header: "Debit note", card: "title", nowrap: true,
        cell: ({ r }) => <Link href={`/returns/vendor/${r.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{r.status === "draft" ? "Draft" : r.number}</Link> },
      { key: "vendor", header: "Vendor", card: "subtitle", className: "max-w-56 whitespace-normal", cell: ({ vendorName }) => vendorName ?? "-" },
      { key: "status", header: "Status", card: "badge", cell: ({ r }) => <StatusPill status={r.status} /> },
      { key: "total", header: "Total", align: "right", card: "amount", nowrap: true, cell: ({ r }) => money(r.total) },
      { key: "date", header: "Date", nowrap: true, cell: ({ r }) => fmtDate(r.date) },
      { key: "bill", header: "Bill", nowrap: true, cell: ({ billNo }) => billNo ?? "-" },
      { key: "adjusted", header: "Adjusted", align: "right", priority: 3, nowrap: true, cell: ({ r }) => r.status === "posted" ? money(r.adjustedAmount) : "-" },
      { key: "balance", header: "Balance", align: "right", nowrap: true, className: "font-medium",
        cell: ({ r }) => r.status === "posted" ? money(noteBalance(r.total, r.adjustedAmount)) : "-" },
    ];
    return (
      <ListPage
        {...pageProps}
        primaryAction={write && <LinkButton href="/returns/vendor/new"><Plus className="icon-sm" aria-hidden /> Return to vendor</LinkButton>}
        stats={
          <MetricStrip className="lg:grid-cols-3">
            <Metric label="Debit notes posted" value={posted.length} hint={moneyShort(posted.reduce((s, x) => s + Number(x.r.total), 0))} />
            <Metric label="Not yet adjusted" value={moneyShort(unadjusted)} tone={unadjusted > 0 ? "warn" : "default"} hint="Reduces what we owe the vendor" />
            <Metric label="Drafts" value={rows.length - posted.length} hint="Not posted yet" />
          </MetricStrip>
        }
        tabs={tabs}
        filters={<ListFilters q={q} placeholder="Search debit note, vendor or bill no." clearHref={clearHref} activeCount={activeCount} hidden={{ tab: "vendor" }}>{statusSelect}</ListFilters>}
        isEmpty={rows.length === 0}
        empty={
          <ListEmpty filtered={filtered} noun="debit notes" clearHref={clearHref} title={filtered ? undefined : "No returns to vendors yet"}
            action={write && <LinkButton href="/returns/vendor/new"><Plus className="icon-sm" aria-hidden /> Return to vendor</LinkButton>}>
            Send faulty or excess material back to the supplier against their bill. Posting takes it out of stock and reduces what you owe.
          </ListEmpty>
        }
        resultSummary={rows.length === 300 ? "Showing the latest 300 debit notes. Use filters to narrow down." : `${rows.length} debit note${rows.length === 1 ? "" : "s"}`}
      >
        <ResponsiveTable rows={rows} columns={cols} rowKey={({ r }) => r.id} caption="Returns to vendor" />
      </ListPage>
    );
  }

  const where: SQL[] = [];
  if (status) where.push(eq(salesReturns.status, status));
  if (q) { const c = or(ilike(salesReturns.number, `%${q}%`), ilike(customers.name, `%${q}%`), ilike(salesInvoices.number, `%${q}%`), ilike(salesOrders.number, `%${q}%`)); if (c) where.push(c); }
  const rows = await db
    .select({ r: salesReturns, customerName: customers.name, invNo: salesInvoices.number, orderNo: salesOrders.number })
    .from(salesReturns)
    .leftJoin(customers, eq(customers.id, salesReturns.customerId))
    .leftJoin(salesInvoices, eq(salesInvoices.id, salesReturns.salesInvoiceId))
    .leftJoin(salesOrders, eq(salesOrders.id, salesReturns.orderId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(salesReturns.date), desc(salesReturns.id))
    .limit(300);
  const posted = rows.filter((x) => x.r.status === "posted");
  const unadjusted = round2(posted.reduce((s, x) => s + noteBalance(x.r.total, x.r.adjustedAmount), 0));
  type Row = (typeof rows)[number];
  const cols: Column<Row>[] = [
    { key: "no", header: "Credit note", card: "title", nowrap: true,
      cell: ({ r }) => <Link href={`/returns/${r.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{r.status === "draft" ? "Draft" : r.number}</Link> },
    { key: "customer", header: "Customer", card: "subtitle", className: "max-w-56 whitespace-normal", cell: ({ customerName }) => customerName ?? "-" },
    { key: "status", header: "Status", card: "badge", cell: ({ r }) => <StatusPill status={r.status} /> },
    { key: "total", header: "Total", align: "right", card: "amount", nowrap: true, cell: ({ r }) => money(r.total) },
    { key: "date", header: "Date", nowrap: true, cell: ({ r }) => fmtDate(r.date) },
    { key: "against", header: "Against", nowrap: true,
      cell: ({ invNo, orderNo }) => <>{invNo ?? orderNo ?? "-"}{invNo && orderNo && <div className="text-caption text-ink-soft">{orderNo}</div>}</> },
    { key: "reason", header: "Reason", priority: 3, cell: ({ r }) => reasonLabel(r.reason) },
    { key: "balance", header: "Balance", align: "right", nowrap: true, className: "font-medium",
      cell: ({ r }) => {
        const bal = r.status === "posted" ? noteBalance(r.total, r.adjustedAmount) : null;
        return bal == null ? "-" : bal > 0 ? money(bal) : <StatusPill status="adjusted" />;
      } },
  ];

  return (
    <ListPage
      {...pageProps}
      primaryAction={write && <LinkButton href="/returns/new"><Plus className="icon-sm" aria-hidden /> Customer return</LinkButton>}
      stats={
        <MetricStrip className="lg:grid-cols-3">
          <Metric label="Credit notes posted" value={posted.length} hint={moneyShort(posted.reduce((s, x) => s + Number(x.r.total), 0))} />
          <Metric label="Not yet adjusted" value={moneyShort(unadjusted)} tone={unadjusted > 0 ? "warn" : "default"} hint="Reduces what customers owe" />
          <Metric label="Drafts" value={rows.length - posted.length} hint="Goods not received back yet" />
        </MetricStrip>
      }
      tabs={tabs}
      filters={<ListFilters q={q} placeholder="Search credit note, customer or invoice" clearHref={clearHref} activeCount={activeCount}>{statusSelect}</ListFilters>}
      isEmpty={rows.length === 0}
      empty={
        <ListEmpty filtered={filtered} noun="credit notes" clearHref={clearHref} title={filtered ? undefined : "No customer returns yet"}
          action={write && <LinkButton href="/returns/new"><Plus className="icon-sm" aria-hidden /> Customer return</LinkButton>}>
          When a customer sends delivered material back (damaged, excess or the wrong item), record it here. Posting gives a credit note and can put the goods back in stock.
        </ListEmpty>
      }
      resultSummary={rows.length === 300 ? "Showing the latest 300 credit notes. Use filters to narrow down." : `${rows.length} credit note${rows.length === 1 ? "" : "s"}`}
    >
      <ResponsiveTable rows={rows} columns={cols} rowKey={({ r }) => r.id} caption="Customer returns" />
    </ListPage>
  );
}
