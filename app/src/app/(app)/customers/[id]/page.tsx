import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { FileText, FolderKanban, Pencil, Plus, ReceiptText, Tag, Truck, Wallet } from "lucide-react";
import { getDb } from "@/db";
import { customers, extinguisherAssets, items, priceHistory, projects, quotationLines, quotations, salesInvoices, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { fmtDate, money, qty, round2, todayIST } from "@/lib/format";
import { Badge, Flash, LinkButton, cx } from "@/components/ui";
import {
  DetailPage, KeyValueGrid, MetaChip, Metric, MetricStrip, ResponsiveTable, SectionCard, StatusPill, SummaryRows, Tabs, activeTab,
  type Column, type TabItem,
} from "@/components/patterns";
import { customerAdvances, netDueOf } from "@/lib/billing";
import { openCreditNotes } from "@/lib/returns";
import { CUSTOMER_TYPES } from "../_components/customer-form";

export const metadata = { title: "Customer" };

const TABS = ["overview", "quotations", "orders", "invoices", "assets", "projects", "prices"] as const;
const OPEN_SI = ["issued", "partially_paid"];
const TYPE_TONE = { customer: "blue", consultant: "violet", builder: "amber" } as const;
const linkCls = "font-medium text-brand-700 hover:underline dark:text-brand-300";

export default async function CustomerDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; ok?: string; err?: string }> }) {
  const user = await requireUser("customers");
  const { id } = await params;
  const sp = await searchParams;
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) notFound();
  const db = await getDb();
  const [c] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!c) notFound();
  const tab = activeTab(sp.tab, TABS);
  const today = todayIST();
  const r = user.role;

  const [quotes, orders, invoices, assets, projs, qPrices, sPrices, cns, advs] = await Promise.all([
    db.select().from(quotations).where(eq(quotations.customerId, customerId)).orderBy(desc(quotations.quoteDate), desc(quotations.id)),
    db.select().from(salesOrders).where(eq(salesOrders.customerId, customerId)).orderBy(desc(salesOrders.orderDate), desc(salesOrders.id)),
    db.select().from(salesInvoices).where(eq(salesInvoices.customerId, customerId)).orderBy(desc(salesInvoices.invoiceDate), desc(salesInvoices.id)),
    db.select().from(extinguisherAssets).where(eq(extinguisherAssets.customerId, customerId)).orderBy(extinguisherAssets.nextDueDate),
    db.select().from(projects).where(eq(projects.customerId, customerId)).orderBy(desc(projects.id)),
    db.select({ itemId: quotationLines.itemId, rate: quotationLines.supplyRate, date: quotations.quoteDate, qid: quotations.id, number: quotations.number, code: items.code, name: items.name, uom: items.uom })
      .from(quotationLines).innerJoin(quotations, eq(quotations.id, quotationLines.quotationId)).innerJoin(items, eq(items.id, quotationLines.itemId))
      .where(eq(quotations.customerId, customerId)).orderBy(desc(quotations.quoteDate), desc(quotationLines.id)),
    db.select({ itemId: priceHistory.itemId, rate: priceHistory.rate, date: priceHistory.date, refId: priceHistory.refId, refType: priceHistory.refType, code: items.code, name: items.name, uom: items.uom })
      .from(priceHistory).innerJoin(items, eq(items.id, priceHistory.itemId))
      .where(and(eq(priceHistory.customerId, customerId), inArray(priceHistory.kind, ["sale"]))).orderBy(desc(priceHistory.date), desc(priceHistory.id)),
    openCreditNotes(db, { customerId }),
    customerAdvances(db, { customerId, openOnly: true }),
  ]);

  const openInv = invoices.filter((i) => OPEN_SI.includes(i.status));
  const outstanding = round2(openInv.reduce((s, i) => s + Math.max(0, i.total - i.paidAmount), 0));
  const overdue = round2(openInv.filter((i) => i.dueDate < today).reduce((s, i) => s + Math.max(0, i.total - i.paidAmount), 0));
  // same as Billing > Receivables (rules 13, 15): invoices due − unadjusted credit notes − unapplied advances
  const credits = round2(cns.reduce((s, n) => s + n.balance, 0));
  const advanceBal = round2(advs.reduce((s, a) => s + a.balance, 0));
  const netDue = netDueOf(outstanding, credits, advanceBal);
  const lessText = [credits > 0.005 && `${money(credits)} credit notes`, advanceBal > 0.005 && `${money(advanceBal)} advances`].filter(Boolean).join(" and ");
  const activeAssets = assets.filter((a) => a.status === "active");
  const assetQty = activeAssets.reduce((s, a) => s + a.qty, 0);
  const nextDue = activeAssets.map((a) => a.nextDueDate).sort()[0] ?? null;
  const dueSoon = activeAssets.filter((a) => a.nextDueDate <= today).reduce((s, a) => s + a.qty, 0);
  const won = quotes.filter((q) => q.status === "won");
  const openQuotes = quotes.filter((q) => ["draft", "sent", "negotiation"].includes(q.status));

  // Customer-wise last quoted / sold price per item
  const priceMap = new Map<number, { code: string; name: string; uom: string; q?: { rate: number; date: string; qid: number; number: string }; s?: { rate: number; date: string; refId: number | null; refType: string | null } }>();
  for (const p of qPrices) {
    if (p.itemId == null || !p.rate) continue;
    const e = priceMap.get(p.itemId) ?? { code: p.code, name: p.name, uom: p.uom };
    if (!e.q) e.q = { rate: Number(p.rate), date: p.date, qid: p.qid, number: p.number };
    priceMap.set(p.itemId, e);
  }
  for (const p of sPrices) {
    const e = priceMap.get(p.itemId) ?? { code: p.code, name: p.name, uom: p.uom };
    if (!e.s) e.s = { rate: Number(p.rate), date: p.date, refId: p.refId, refType: p.refType };
    priceMap.set(p.itemId, e);
  }
  const prices = [...priceMap.entries()].sort((a, b) => a[1].code.localeCompare(b[1].code));

  const base = `/customers/${c.id}`;
  const tabItems: TabItem[] = [
    { id: "overview", label: "Overview" },
    { id: "quotations", label: "Quotations", count: quotes.length },
    { id: "orders", label: "Orders", count: orders.length },
    { id: "invoices", label: "Invoices and dues", count: invoices.length, alert: overdue > 0 },
    { id: "assets", label: "Extinguishers", count: assetQty, alert: dueSoon > 0 },
    { id: "projects", label: "Projects", count: projs.length },
    { id: "prices", label: "Price history", count: prices.length },
  ];

  const L = (mod: Parameters<typeof canRead>[1], href: string, text: string, stretch = false) =>
    canRead(r, mod) ? <Link href={href} className={cx(linkCls, stretch && "rt-stretch")}>{text}</Link> : <span className="font-medium">{text}</span>;

  // ------------------------------------------------------------------ table columns
  type Q = (typeof quotes)[number];
  const quoteCols: Column<Q>[] = [
    { key: "no", header: "Quotation", card: "title", nowrap: true, cell: (q) => L("quotations", `/quotations/${q.id}`, q.number + (q.revision ? ` R${q.revision}` : ""), true) },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (q) => fmtDate(q.quoteDate) },
    { key: "project", header: "Project", className: "max-w-64 whitespace-normal", cell: (q) => q.projectName ?? "-" },
    { key: "status", header: "Status", card: "badge", cell: (q) => <StatusPill status={q.status} /> },
    { key: "total", header: "Grand total", align: "right", card: "amount", nowrap: true, cell: (q) => money(q.grandTotal) },
  ];
  type O = (typeof orders)[number];
  const orderCols: Column<O>[] = [
    { key: "no", header: "Order", card: "title", nowrap: true, cell: (o) => L("orders", `/orders/${o.id}`, o.number, true) },
    { key: "po", header: "Customer PO", cell: (o) => <>{o.customerPoNumber ?? "-"}{o.customerPoDate && <div className="text-caption text-ink-faint">{fmtDate(o.customerPoDate)}</div>}</> },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (o) => fmtDate(o.orderDate) },
    { key: "expected", header: "Expected", nowrap: true, priority: 3, cell: (o) => fmtDate(o.expectedDelivery) },
    { key: "status", header: "Status", card: "badge", cell: (o) => <StatusPill status={o.status} /> },
    { key: "total", header: "Total", align: "right", card: "amount", nowrap: true, cell: (o) => money(o.total) },
  ];
  type I = (typeof invoices)[number];
  const invOut = (i: I) => (OPEN_SI.includes(i.status) ? Math.max(0, i.total - i.paidAmount) : 0);
  const invCols: Column<I>[] = [
    { key: "no", header: "Invoice", card: "title", nowrap: true, cell: (i) => L("billing", `/billing/invoices/${i.id}`, i.number, true) },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (i) => fmtDate(i.invoiceDate) },
    {
      key: "due", header: "Due", nowrap: true,
      cell: (i) => {
        const od = invOut(i) > 0.5 && i.dueDate < today;
        return <span className="inline-flex flex-col items-end gap-0.5 sm:items-start">{fmtDate(i.dueDate)}{od && <StatusPill status="overdue" />}</span>;
      },
    },
    { key: "status", header: "Status", card: "badge", cell: (i) => <StatusPill status={i.status} /> },
    { key: "total", header: "Total", align: "right", nowrap: true, cell: (i) => money(i.total) },
    { key: "paid", header: "Paid", align: "right", nowrap: true, priority: 3, cell: (i) => money(i.paidAmount) },
    { key: "out", header: "Outstanding", align: "right", card: "amount", nowrap: true, cell: (i) => (invOut(i) > 0.5 ? money(invOut(i)) : "-") },
  ];
  type A = (typeof assets)[number];
  const assetCols: Column<A>[] = [
    { key: "type", header: "Type", card: "title", cell: (a) => <>{a.extType}<div className="text-caption font-normal text-ink-faint">{[a.make, a.serialNo].filter(Boolean).join(" · ")}</div></> },
    { key: "loc", header: "Location", card: "subtitle", className: "max-w-56 whitespace-normal", cell: (a) => a.location ?? "-" },
    { key: "qty", header: "Qty", align: "right", card: "amount", cell: (a) => a.qty },
    { key: "last", header: "Last refill", nowrap: true, priority: 3, cell: (a) => fmtDate(a.lastRefillDate) },
    {
      key: "next", header: "Next due", nowrap: true,
      cell: (a) => <span className={cx(a.status === "active" && a.nextDueDate <= today && "font-medium text-danger")}>{fmtDate(a.nextDueDate)}</span>,
    },
    { key: "hpt", header: "HPT due", nowrap: true, priority: 3, cell: (a) => fmtDate(a.hptDueDate) },
    { key: "status", header: "Status", card: "badge", cell: (a) => <StatusPill status={a.status} /> },
  ];
  type P = (typeof projs)[number];
  const projCols: Column<P>[] = [
    { key: "code", header: "Code", card: "title", nowrap: true, cell: (p) => L("projects", `/projects/${p.id}`, p.code, true) },
    { key: "name", header: "Project", card: "subtitle", className: "max-w-64 whitespace-normal", cell: (p) => p.name },
    { key: "status", header: "Status", card: "badge", cell: (p) => <StatusPill status={p.status} /> },
    { key: "start", header: "Start", nowrap: true, cell: (p) => fmtDate(p.startDate) },
    { key: "end", header: "End", nowrap: true, cell: (p) => fmtDate(p.endDate) },
    { key: "value", header: "Contract value", align: "right", card: "amount", nowrap: true, cell: (p) => money(p.contractValue) },
  ];
  type Pr = (typeof prices)[number];
  const priceCols: Column<Pr>[] = [
    {
      key: "item", header: "Item", card: "title", className: "max-w-72 whitespace-normal",
      cell: ([itemId, p]) => <><Link href={`/items/${itemId}`} className="hover:underline">{p.name}</Link><div className="font-mono text-caption font-normal text-ink-faint">{p.code}</div></>,
    },
    {
      key: "quoted", header: "Last quoted", align: "right", nowrap: true,
      cell: ([, p]) => (p.q ? <>{money(p.q.rate)}<span className="text-caption text-ink-faint">/{p.uom}</span></> : "-"),
    },
    {
      key: "quote", header: "Quotation", priority: 3,
      cell: ([, p]) => (p.q ? <>{L("quotations", `/quotations/${p.q.qid}`, p.q.number)}<div className="text-caption text-ink-faint">{fmtDate(p.q.date)}</div></> : "-"),
    },
    {
      key: "sold", header: "Last sold", align: "right", card: "amount", nowrap: true,
      cell: ([, p]) => (p.s ? <>{money(p.s.rate)}<span className="text-caption text-ink-faint">/{p.uom}</span></> : "-"),
    },
    {
      key: "inv", header: "Invoice", priority: 3,
      cell: ([, p]) => (p.s
        ? <>{p.s.refType === "sales_invoice" && p.s.refId ? L("billing", `/billing/invoices/${p.s.refId}`, `Invoice #${p.s.refId}`) : "-"}<div className="text-caption text-ink-faint">{fmtDate(p.s.date)}</div></>
        : "-"),
    },
  ];

  const quoteWrite = canWrite(r, "quotations");
  const custWrite = canWrite(r, "customers");
  const typeLabel = CUSTOMER_TYPES[c.type as keyof typeof CUSTOMER_TYPES] ?? c.type;

  return (
    <DetailPage
      back={{ href: "/customers", label: "Customers" }}
      eyebrow={typeLabel}
      title={c.name}
      status={<>
        <Badge tone={TYPE_TONE[c.type as keyof typeof TYPE_TONE] ?? "gray"}>{typeLabel}</Badge>
        {!c.active && <StatusPill semantic="neutral" label="Inactive" />}
      </>}
      meta={<>
        {c.city && <MetaChip label="City">{c.city}</MetaChip>}
        {c.contactPerson && <MetaChip label="Contact">{c.contactPerson}</MetaChip>}
        {c.phone && <MetaChip label="Phone" href={`tel:${c.phone}`}>{c.phone}</MetaChip>}
        {c.gstin && <MetaChip label="GSTIN">{c.gstin}</MetaChip>}
        <MetaChip label="Terms">{c.paymentTermsDays} days</MetaChip>
      </>}
      primaryAction={quoteWrite && <LinkButton href={`/quotations/new?customerId=${c.id}`}><Plus className="icon-sm" aria-hidden /> New quotation</LinkButton>}
      secondaryActions={custWrite && <LinkButton href={`/customers/${c.id}/edit`} variant="secondary"><Pencil className="icon-sm" aria-hidden /> Edit customer</LinkButton>}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      tabs={
        <div className="space-y-4">
          <MetricStrip>
            <Metric label="Net due" value={money(netDue)} tone={overdue > 0 ? "bad" : netDue > 0.5 ? "warn" : "default"}
              hint={`Invoices due ${money(outstanding)}${lessText ? `, less ${lessText}` : ""}${overdue > 0 ? ` · ${money(overdue)} overdue` : ""}`} />
            <Metric label="Quotations" value={quotes.length} hint={`${openQuotes.length} open · ${won.length} won (${money(won.reduce((s, q) => s + q.grandTotal, 0))})`} />
            <Metric label="Extinguishers" value={qty(assetQty)} tone={dueSoon > 0 ? "warn" : "default"} hint={nextDue ? `Next refill due ${fmtDate(nextDue)}${dueSoon ? ` · ${dueSoon} due now` : ""}` : "None tracked yet"} />
            <Metric label="Projects" value={projs.length} hint={`${projs.filter((p) => p.status === "active").length} active`} />
          </MetricStrip>
          <Tabs label="Customer sections" basePath={base} params={{ tab: sp.tab }} active={tab} items={tabItems} />
        </div>
      }
      aside={
        <SectionCard title="Open receivables" icon={Wallet} count={openInv.length}
          empty={openInv.length === 0 && "Nothing outstanding. Unpaid invoices for this customer appear here."}>
          <SummaryRows rows={[
            ["Invoices due", money(outstanding)],
            ...(lessText ? [["Less credits and advances", money(round2(credits + advanceBal))] as [string, string]] : []),
            ["Net due", <span key="n" className="font-semibold">{money(netDue)}</span>],
            ["Overdue", <span key="o" className={cx(overdue > 0 && "text-danger")}>{money(overdue)}</span>],
          ]} />
          <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
            {openInv.slice(0, 8).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                <span>{L("billing", `/billing/invoices/${i.id}`, i.number)}<span className={cx("block text-caption", i.dueDate < today ? "text-danger" : "text-ink-faint")}>Due {fmtDate(i.dueDate)}</span></span>
                <span className="tabular-nums">{money(Math.max(0, i.total - i.paidAmount))}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      }
    >
      {tab === "overview" && (
        <>
          <SectionCard title="Details">
            <KeyValueGrid columns={2} items={[
              { label: "Contact person", value: c.contactPerson },
              { label: "Phone", value: c.phone ? <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a> : null },
              { label: "Email", value: c.email ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a> : null },
              { label: "GSTIN", value: c.gstin ? <span className="font-mono">{c.gstin}</span> : null },
              { label: "Address", value: [c.address, c.city, c.state].filter(Boolean).join(", ") || null, wide: true },
              { label: "Payment terms", value: `${c.paymentTermsDays} days` },
              { label: "Credit limit", value: c.creditLimit > 0 ? money(c.creditLimit) : "No limit" },
              { label: "Automatic reminders", value: c.autoReminders ? "On" : "Off" },
              { label: "Notes", value: c.notes, wide: true },
            ]} />
          </SectionCard>
          <SectionCard title="Recent quotations" icon={FileText} count={quotes.length} flush
            actions={quotes.length > 5 && <Link href={`${base}?tab=quotations`} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">View all</Link>}
            empty={quotes.length === 0 && (quoteWrite ? "No quotations yet. Use New quotation to price a BOQ for this customer." : "No quotations yet.")}>
            <ResponsiveTable flush rows={quotes.slice(0, 5)} columns={quoteCols} rowKey={(q) => q.id} caption="Recent quotations" />
          </SectionCard>
        </>
      )}

      {tab === "quotations" && (
        <SectionCard title="Quotations" icon={FileText} count={quotes.length} flush
          empty={quotes.length === 0 && (quoteWrite ? "No quotations yet. Use New quotation to price a BOQ for this customer." : "No quotations yet.")}>
          <ResponsiveTable flush rows={quotes} columns={quoteCols} rowKey={(q) => q.id} caption="Quotations" />
        </SectionCard>
      )}

      {tab === "orders" && (
        <SectionCard title="Orders" icon={Truck} count={orders.length} flush
          empty={orders.length === 0 && "No orders yet. Orders appear here once a quotation is won."}>
          <ResponsiveTable flush rows={orders} columns={orderCols} rowKey={(o) => o.id} caption="Orders" />
        </SectionCard>
      )}

      {tab === "invoices" && (
        <SectionCard title="Invoices" icon={ReceiptText} count={invoices.length} flush
          description={<>Invoices due {money(outstanding)}{lessText && <> · less {lessText}</>} · <span className="font-medium text-ink">Net due {money(netDue)}</span>{overdue > 0 && <> · <span className="font-medium text-danger">{money(overdue)} overdue</span></>}</>}
          empty={invoices.length === 0 && "No invoices yet. Invoices raised from this customer's orders appear here."}>
          <ResponsiveTable flush rows={invoices} columns={invCols} rowKey={(i) => i.id} caption="Invoices" />
        </SectionCard>
      )}

      {tab === "assets" && (
        <SectionCard title="Extinguishers" count={assets.length} flush
          actions={canWrite(r, "refills") && <LinkButton href={`/refills?customerId=${c.id}`} variant="secondary" size="sm">Open refill tracker</LinkButton>}
          empty={assets.length === 0 && "No extinguishers tracked yet. Add them in the refill tracker to get due date reminders."}>
          <ResponsiveTable flush rows={assets} columns={assetCols} rowKey={(a) => a.id} caption="Extinguishers" />
        </SectionCard>
      )}

      {tab === "projects" && (
        <SectionCard title="Projects" icon={FolderKanban} count={projs.length} flush
          empty={projs.length === 0 && "No projects yet. Projects for this customer appear here."}>
          <ResponsiveTable flush rows={projs} columns={projCols} rowKey={(p) => p.id} caption="Projects" />
        </SectionCard>
      )}

      {tab === "prices" && (
        <SectionCard title="Price history" icon={Tag} count={prices.length} flush
          description={`Last rate quoted and sold to ${c.name}, per item. Use this to stay consistent when quoting again.`}
          empty={prices.length === 0 && "No price history yet. Last quoted and sold rates per item appear here."}>
          <ResponsiveTable flush rows={prices} columns={priceCols} rowKey={([itemId]) => itemId} caption="Price history" />
        </SectionCard>
      )}
    </DetailPage>
  );
}
