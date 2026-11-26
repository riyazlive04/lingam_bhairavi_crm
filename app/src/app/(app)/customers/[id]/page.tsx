import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Pencil, Plus } from "lucide-react";
import { getDb } from "@/db";
import { customers, extinguisherAssets, items, priceHistory, projects, quotationLines, quotations, salesInvoices, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { fmtDate, money, qty, round2, todayIST } from "@/lib/format";
import { Badge, Card, DL, EmptyState, Flash, LinkButton, PageHeader, Stat, StatusBadge, Table, Td, Th, cx } from "@/components/ui";
import { customerAdvances, netDueOf } from "@/lib/billing";
import { openCreditNotes } from "@/lib/returns";
import { CUSTOMER_TYPES } from "../_components/customer-form";
import { LinkTabs } from "../../items/_components/tabs";

const TABS = ["overview", "quotations", "orders", "invoices", "assets", "projects", "prices"] as const;
type Tab = (typeof TABS)[number];
const OPEN_SI = ["issued", "partially_paid"];

export default async function CustomerDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; ok?: string; err?: string }> }) {
  const user = await requireUser("customers");
  const { id } = await params;
  const sp = await searchParams;
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) notFound();
  const db = await getDb();
  const [c] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!c) notFound();
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "overview";
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

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "quotations", label: "Quotations", count: quotes.length },
    { key: "orders", label: "Orders", count: orders.length },
    { key: "invoices", label: "Invoices & outstanding", count: invoices.length },
    { key: "assets", label: "Extinguishers", count: assetQty },
    { key: "projects", label: "Projects", count: projs.length },
    { key: "prices", label: "Price history", count: prices.length },
  ].map((t) => ({ href: `/customers/${c.id}${t.key === "overview" ? "" : `?tab=${t.key}`}`, label: t.label, count: t.count, active: tab === t.key }));

  const L = (mod: Parameters<typeof canRead>[1], href: string, text: string) =>
    canRead(r, mod) ? <Link href={href} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{text}</Link> : <span>{text}</span>;

  const quotesTable = (list: typeof quotes) => list.length === 0 ? <EmptyState title="No quotations yet" /> : (
    <Table>
      <thead><tr><Th>Number</Th><Th>Date</Th><Th>Project</Th><Th>Status</Th><Th className="text-right">Grand total</Th></tr></thead>
      <tbody>{list.map((q) => (
        <tr key={q.id}><Td>{L("quotations", `/quotations/${q.id}`, q.number + (q.revision ? ` R${q.revision}` : ""))}</Td><Td>{fmtDate(q.quoteDate)}</Td>
          <Td className="max-w-64 whitespace-normal">{q.projectName ?? "-"}</Td><Td><StatusBadge status={q.status} /></Td><Td className="text-right tabular-nums">{money(q.grandTotal)}</Td></tr>
      ))}</tbody>
    </Table>
  );
  const invoicesTable = (list: typeof invoices) => list.length === 0 ? <EmptyState title="No invoices yet" /> : (
    <Table>
      <thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Due</Th><Th>Status</Th><Th className="text-right">Total</Th><Th className="text-right">Paid</Th><Th className="text-right">Outstanding</Th></tr></thead>
      <tbody>{list.map((i) => {
        const out = OPEN_SI.includes(i.status) ? Math.max(0, i.total - i.paidAmount) : 0;
        const od = out > 0.5 && i.dueDate < today;
        return (
          <tr key={i.id}><Td>{L("billing", `/billing/invoices/${i.id}`, i.number)}</Td><Td>{fmtDate(i.invoiceDate)}</Td>
            <Td className={cx(od && "font-medium text-red-600")}>{fmtDate(i.dueDate)}{od && <div className="text-xs">overdue</div>}</Td>
            <Td><StatusBadge status={i.status} /></Td><Td className="text-right tabular-nums">{money(i.total)}</Td>
            <Td className="text-right tabular-nums">{money(i.paidAmount)}</Td><Td className="text-right tabular-nums">{out > 0.5 ? money(out) : "-"}</Td></tr>
        );
      })}</tbody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.name}
        subtitle={<><Badge tone="blue">{CUSTOMER_TYPES[c.type as keyof typeof CUSTOMER_TYPES] ?? c.type}</Badge> {c.city ?? ""}{!c.active && <> · <Badge>inactive</Badge></>}</>}
        back={{ href: "/customers", label: "Customers" }}
        actions={<>
          {canWrite(r, "quotations") && <LinkButton href={`/quotations/new?customerId=${c.id}`} variant="secondary"><Plus size={16} aria-hidden /> Quotation</LinkButton>}
          {canWrite(r, "customers") && <LinkButton href={`/customers/${c.id}/edit`}><Pencil size={16} aria-hidden /> Edit</LinkButton>}
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net due" value={money(netDue)} tone={overdue > 0 ? "bad" : netDue > 0.5 ? "warn" : "default"}
          hint={`Invoices due ${money(outstanding)}${lessText ? `, less ${lessText}` : ""}${overdue > 0 ? ` · ${money(overdue)} overdue` : ""}`} />
        <Stat label="Quotations" value={quotes.length} hint={`${openQuotes.length} open · ${won.length} won (${money(won.reduce((s, q) => s + q.grandTotal, 0))})`} />
        <Stat label="Extinguishers" value={qty(assetQty)} tone={dueSoon > 0 ? "warn" : "default"} hint={nextDue ? `Next refill due ${fmtDate(nextDue)}${dueSoon ? ` · ${dueSoon} due now` : ""}` : "No assets tracked"} />
        <Stat label="Projects" value={projs.length} hint={`${projs.filter((p) => p.status === "active").length} active`} />
      </div>
      <LinkTabs tabs={tabs} label="Customer sections" />

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Details" className="lg:col-span-2">
            <DL items={[
              ["Contact person", c.contactPerson],
              ["Phone", c.phone ? <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a> : null],
              ["Email", c.email ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a> : null],
              ["GSTIN", c.gstin ? <span className="font-mono">{c.gstin}</span> : null],
              ["Address", [c.address, c.city, c.state].filter(Boolean).join(", ") || null],
              ["Payment terms", `${c.paymentTermsDays} days`],
              ["Credit limit", c.creditLimit > 0 ? money(c.creditLimit) : "No limit"],
              ["Auto reminders", c.autoReminders ? "On" : "Off"],
              ["Notes", c.notes],
            ]} />
          </Card>
          <Card title="Open receivables">
            {openInv.length === 0 ? <p className="text-sm text-ink-soft">Nothing outstanding.</p> : (
              <ul className="divide-y divide-line text-sm">
                {openInv.slice(0, 8).map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                    <span>{L("billing", `/billing/invoices/${i.id}`, i.number)}<span className={cx("block text-xs", i.dueDate < today ? "text-red-600" : "text-ink-faint")}>due {fmtDate(i.dueDate)}</span></span>
                    <span className="tabular-nums">{money(Math.max(0, i.total - i.paidAmount))}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="lg:col-span-3">
            <h2 className="mb-2 text-sm font-semibold text-ink">Recent quotations</h2>
            {quotesTable(quotes.slice(0, 5))}
          </div>
        </div>
      )}
      {tab === "quotations" && quotesTable(quotes)}
      {tab === "orders" && (orders.length === 0 ? <EmptyState title="No orders yet" /> : (
        <Table>
          <thead><tr><Th>Order</Th><Th>Customer PO</Th><Th>Date</Th><Th>Expected</Th><Th>Status</Th><Th className="text-right">Total</Th></tr></thead>
          <tbody>{orders.map((o) => (
            <tr key={o.id}><Td>{L("orders", `/orders/${o.id}`, o.number)}</Td><Td>{o.customerPoNumber ?? "-"}{o.customerPoDate && <div className="text-xs text-ink-faint">{fmtDate(o.customerPoDate)}</div>}</Td>
              <Td>{fmtDate(o.orderDate)}</Td><Td>{fmtDate(o.expectedDelivery)}</Td><Td><StatusBadge status={o.status} /></Td><Td className="text-right tabular-nums">{money(o.total)}</Td></tr>
          ))}</tbody>
        </Table>
      ))}
      {tab === "invoices" && (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">Invoices due {money(outstanding)}{lessText && <> · less {lessText}</>} · <span className="font-medium text-ink">Net due {money(netDue)}</span>{overdue > 0 && <> · <span className="font-medium text-red-600">{money(overdue)} overdue</span></>}</p>
          {invoicesTable(invoices)}
        </div>
      )}
      {tab === "assets" && (assets.length === 0 ? (
        <EmptyState title="No extinguishers tracked" action={canWrite(r, "refills") && <LinkButton href={`/refills?customerId=${c.id}`}>Open refill tracker</LinkButton>}>
          Add this customer&apos;s extinguishers in the refill tracker to get due-date reminders.
        </EmptyState>
      ) : (
        <Table>
          <thead><tr><Th>Type</Th><Th>Location</Th><Th className="text-right">Qty</Th><Th>Last refill</Th><Th>Next due</Th><Th>HPT due</Th><Th>Status</Th></tr></thead>
          <tbody>{assets.map((a) => (
            <tr key={a.id}><Td className="font-medium">{a.extType}<div className="text-xs text-ink-faint">{[a.make, a.serialNo].filter(Boolean).join(" · ")}</div></Td>
              <Td className="max-w-56 whitespace-normal">{a.location ?? "-"}</Td><Td className="text-right">{a.qty}</Td><Td>{fmtDate(a.lastRefillDate)}</Td>
              <Td className={cx(a.status === "active" && a.nextDueDate <= today && "font-medium text-red-600")}>{fmtDate(a.nextDueDate)}</Td>
              <Td>{fmtDate(a.hptDueDate)}</Td><Td><StatusBadge status={a.status} /></Td></tr>
          ))}</tbody>
        </Table>
      ))}
      {tab === "projects" && (projs.length === 0 ? <EmptyState title="No projects yet" /> : (
        <Table>
          <thead><tr><Th>Code</Th><Th>Project</Th><Th>Status</Th><Th>Start</Th><Th>End</Th><Th className="text-right">Contract value</Th></tr></thead>
          <tbody>{projs.map((p) => (
            <tr key={p.id}><Td className="font-mono text-xs">{L("projects", `/projects/${p.id}`, p.code)}</Td><Td className="max-w-64 whitespace-normal">{p.name}</Td>
              <Td><StatusBadge status={p.status} /></Td><Td>{fmtDate(p.startDate)}</Td><Td>{fmtDate(p.endDate)}</Td><Td className="text-right tabular-nums">{money(p.contractValue)}</Td></tr>
          ))}</tbody>
        </Table>
      ))}
      {tab === "prices" && (prices.length === 0 ? <EmptyState title="No price history with this customer">Last quoted and sold rates per item appear here.</EmptyState> : (
        <>
          <p className="text-sm text-ink-soft">Last rate quoted and sold to {c.name}, per item. Use this to stay consistent when re-quoting.</p>
          <Table>
            <thead><tr><Th>Item</Th><Th className="text-right">Last quoted</Th><Th>Quotation</Th><Th className="text-right">Last sold</Th><Th>Invoice</Th></tr></thead>
            <tbody>{prices.map(([itemId, p]) => (
              <tr key={itemId}>
                <Td className="max-w-72 whitespace-normal"><Link href={`/items/${itemId}`} className="hover:underline">{p.name}</Link><div className="font-mono text-xs text-ink-faint">{p.code}</div></Td>
                <Td className="text-right tabular-nums">{p.q ? <>{money(p.q.rate)}<span className="text-xs text-ink-faint">/{p.uom}</span></> : "-"}</Td>
                <Td>{p.q ? <>{L("quotations", `/quotations/${p.q.qid}`, p.q.number)}<div className="text-xs text-ink-faint">{fmtDate(p.q.date)}</div></> : "-"}</Td>
                <Td className="text-right tabular-nums">{p.s ? <>{money(p.s.rate)}<span className="text-xs text-ink-faint">/{p.uom}</span></> : "-"}</Td>
                <Td>{p.s ? <>{p.s.refType === "sales_invoice" && p.s.refId ? L("billing", `/billing/invoices/${p.s.refId}`, `Invoice #${p.s.refId}`) : "-"}<div className="text-xs text-ink-faint">{fmtDate(p.s.date)}</div></> : "-"}</Td>
              </tr>
            ))}</tbody>
          </Table>
        </>
      ))}
    </div>
  );
}
