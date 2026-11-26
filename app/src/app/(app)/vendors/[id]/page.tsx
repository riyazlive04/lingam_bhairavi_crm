import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { FileText, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { getDb } from "@/db";
import { items, projects, purchaseInvoices, vendorItems, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { SYSTEMS } from "@/lib/constants";
import { fmtDate, money, moneyShort, pct, round2, todayIST } from "@/lib/format";
import { purchaseOutstanding } from "@/lib/purchasing";
import { Badge, Field, Flash, Input, LinkButton, Select, cx } from "@/components/ui";
import {
  ConfirmButton, DetailPage, KeyValueGrid, MetaChip, Metric, MetricStrip, ResponsiveTable, SectionCard, StatusPill, Tabs, activeTab,
  type Column,
} from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { linkVendorItem, unlinkVendorItem } from "../actions";

export const metadata = { title: "Vendor" };

export default async function VendorDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; tab?: string }> }) {
  const user = await requireUser("vendors");
  const { id } = await params;
  const sp = await searchParams;
  const vendorId = Number(id);
  if (!Number.isInteger(vendorId)) notFound();
  const db = await getDb();
  const [v] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
  if (!v) notFound();
  const write = canWrite(user.role, "vendors");
  const today = todayIST();

  const [supplied, invoices] = await Promise.all([
    db.select({ itemId: items.id, code: items.code, name: items.name, size: items.size, make: items.make, uom: items.uom, system: items.system,
      lastRate: vendorItems.lastRate, lastDate: vendorItems.lastDate, leadTimeDays: vendorItems.leadTimeDays, itemLatest: items.lastPurchaseRate, itemLatestVendor: items.lastPurchaseVendorId })
      .from(vendorItems).innerJoin(items, eq(items.id, vendorItems.itemId))
      .where(eq(vendorItems.vendorId, vendorId)).orderBy(asc(items.system), asc(items.groupName), asc(items.code)),
    db.select({ inv: purchaseInvoices, projectName: projects.name }).from(purchaseInvoices)
      .leftJoin(projects, eq(projects.id, purchaseInvoices.projectId))
      .where(eq(purchaseInvoices.vendorId, vendorId)).orderBy(desc(purchaseInvoices.invoiceDate), desc(purchaseInvoices.id)),
  ]);

  // Competitiveness: compare this vendor's last rate with other vendors' last rates for the same items.
  const itemIds = supplied.map((s) => s.itemId);
  const others = itemIds.length
    ? await db.select({ itemId: vendorItems.itemId, lastRate: vendorItems.lastRate, vendorName: vendors.name })
      .from(vendorItems).innerJoin(vendors, eq(vendors.id, vendorItems.vendorId))
      .where(and(inArray(vendorItems.itemId, itemIds), ne(vendorItems.vendorId, vendorId)))
    : [];
  const otherBy = new Map<number, { rates: number[]; min: number; minVendor: string }>();
  for (const o of others) {
    if (o.lastRate == null || o.lastRate <= 0) continue;
    const e = otherBy.get(o.itemId) ?? { rates: [], min: Infinity, minVendor: "" };
    e.rates.push(Number(o.lastRate));
    if (o.lastRate < e.min) { e.min = Number(o.lastRate); e.minVendor = o.vendorName; }
    otherBy.set(o.itemId, e);
  }
  const diffs: number[] = [];
  let cheapestCount = 0;
  const rows = supplied.map((s) => {
    const o = otherBy.get(s.itemId);
    let diff: number | null = null;
    if (o && s.lastRate) {
      const avg = o.rates.reduce((a, b) => a + b, 0) / o.rates.length;
      diff = round2(((Number(s.lastRate) - avg) / avg) * 100);
      diffs.push(diff);
      if (Number(s.lastRate) <= o.min) cheapestCount++;
    }
    return { ...s, diff, other: o };
  });
  const avgDiff = diffs.length ? round2(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null;

  const posted = invoices.filter((r) => r.inv.status === "posted");
  const outstanding = round2(posted.reduce((s, r) => s + purchaseOutstanding(r.inv), 0));
  const overdue = round2(posted.filter((r) => r.inv.dueDate && r.inv.dueDate < today).reduce((s, r) => s + purchaseOutstanding(r.inv), 0));
  const fyStart = `${Number(today.slice(5, 7)) >= 4 ? today.slice(0, 4) : Number(today.slice(0, 4)) - 1}-04-01`;
  const fyPurchases = round2(posted.filter((r) => r.inv.invoiceDate >= fyStart).reduce((s, r) => s + Number(r.inv.total), 0));

  const allItems = write
    ? await db.select({ id: items.id, code: items.code, name: items.name }).from(items).where(eq(items.active, true)).orderBy(asc(items.code))
    : [];
  const canPurchases = canRead(user.role, "purchases");

  const tab = activeTab(sp.tab, ["items", "invoices"] as const);
  const base = `/vendors/${v.id}`;

  type R = (typeof rows)[number];
  const itemCols: Column<R>[] = [
    {
      key: "item", header: "Item", card: "title", className: "max-w-72 whitespace-normal",
      cell: (r) => (
        <>
          <Link href={`/items/${r.itemId}`} className="hover:underline">{r.name}</Link>
          <div className="font-mono text-caption font-normal text-ink-faint">{r.code} · {SYSTEMS[r.system as keyof typeof SYSTEMS] ?? r.system}</div>
        </>
      ),
    },
    { key: "size", header: "Size / make", priority: 3, cell: (r) => <>{r.size ?? "-"}<div className="text-caption text-ink-faint">{r.make ?? ""}</div></> },
    {
      key: "rate", header: "Last rate", align: "right", card: "amount", nowrap: true,
      cell: (r) => <>{money(r.lastRate)} <span className="text-caption text-ink-faint">/{r.uom}</span>{r.itemLatestVendor === v.id && <div><StatusPill semantic="success" label="Current latest" /></div>}</>,
    },
    { key: "date", header: "Last date", nowrap: true, cell: (r) => fmtDate(r.lastDate) },
    { key: "lead", header: "Lead time", align: "right", priority: 3, cell: (r) => (r.leadTimeDays != null ? `${r.leadTimeDays} d` : "-") },
    {
      key: "diff", header: "vs other vendors", label: "Compared with other vendors", align: "right",
      cell: (r) => r.diff == null ? <span className="text-ink-faint">Only vendor</span> : (
        <span className={cx(r.diff <= 0 ? "text-success" : "text-danger")}>
          {r.diff > 0 ? "+" : ""}{pct(r.diff)}
          <span className="block text-caption text-ink-faint">Best {money(r.other!.min)} · {r.other!.minVendor}</span>
        </span>
      ),
    },
    ...(write ? [{
      key: "actions", header: <span className="sr-only">Actions</span>, label: "Actions", card: "actions" as const,
      cell: (r: R) => (
        <form action={unlinkVendorItem.bind(null, v.id, r.itemId)}>
          <ConfirmButton variant="ghost" size="sm" stacked className="text-danger" confirmVariant="danger" pendingText="Removing…" confirmLabel="Yes, remove"
            confirm={`Remove ${r.code} from this vendor's list?`} aria-label={`Remove ${r.code} from vendor`} title="Remove from vendor list">
            <Trash2 className="icon-xs" aria-hidden /><span className="sm:sr-only">Remove</span>
          </ConfirmButton>
        </form>
      ),
    }] : []),
  ];
  type I = (typeof invoices)[number];
  const invCols: Column<I>[] = [
    {
      key: "no", header: "Invoice", card: "title", nowrap: true,
      cell: ({ inv }) => canPurchases ? <Link href={`/purchases/${inv.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{inv.invoiceNo}</Link> : inv.invoiceNo,
    },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: ({ inv }) => fmtDate(inv.invoiceDate) },
    {
      key: "due", header: "Due", nowrap: true,
      cell: ({ inv }) => {
        const out = inv.status === "posted" ? purchaseOutstanding(inv) : 0;
        const od = inv.status === "posted" && out > 0.5 && inv.dueDate && inv.dueDate < today;
        return <span className={cx(od && "font-medium text-danger")}>{fmtDate(inv.dueDate)}</span>;
      },
    },
    { key: "project", header: "Project", priority: 3, cell: ({ projectName }) => projectName ?? <span className="text-ink-faint">Stock</span> },
    {
      key: "status", header: "Status", card: "badge",
      cell: ({ inv }) => <StatusPill status={inv.status === "posted" && purchaseOutstanding(inv) <= 0.5 ? "paid" : inv.status} />,
    },
    { key: "total", header: "Total", align: "right", nowrap: true, cell: ({ inv }) => money(inv.total) },
    { key: "out", header: "Outstanding", align: "right", card: "amount", nowrap: true, cell: ({ inv }) => (inv.status === "posted" ? money(purchaseOutstanding(inv)) : "-") },
  ];

  return (
    <DetailPage
      back={{ href: "/vendors", label: "Vendors" }}
      eyebrow="Vendor"
      title={v.name}
      status={!v.active ? <StatusPill status="inactive" /> : undefined}
      meta={
        <>
          {v.city && <MetaChip label="City">{v.city}</MetaChip>}
          {v.gstin && <MetaChip label="GSTIN"><span className="font-mono">{v.gstin}</span></MetaChip>}
          <MetaChip label="Terms">{v.paymentTermsDays} days</MetaChip>
          {v.phone && <MetaChip label="Phone">{v.phone}</MetaChip>}
        </>
      }
      primaryAction={canWrite(user.role, "purchases") && <LinkButton href={`/purchases/new?vendor=${v.id}`}><Plus className="icon-sm" aria-hidden /> New purchase invoice</LinkButton>}
      secondaryActions={write && <LinkButton href={`/vendors/${v.id}/edit`} variant="secondary"><Pencil className="icon-sm" aria-hidden /> Edit</LinkButton>}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      tabs={
        <Tabs label="Vendor sections" basePath={base} params={{ tab: sp.tab }} active={tab} items={[
          { id: "items", label: "Items supplied", count: supplied.length },
          { id: "invoices", label: "Purchase invoices", count: invoices.length, alert: overdue > 0 },
        ]} />
      }
      aside={
        <>
          <SectionCard title="Details">
            <KeyValueGrid columns={1} items={[
              { label: "Contact person", value: v.contactPerson },
              { label: "Phone", value: v.phone ? <a href={`tel:${v.phone}`} className="hover:underline">{v.phone}</a> : null },
              { label: "Email", value: v.email ? <a href={`mailto:${v.email}`} className="hover:underline">{v.email}</a> : null },
              { label: "Payment terms", value: `${v.paymentTermsDays} days` },
              { label: "Address", value: v.address ? <span className="whitespace-pre-line">{v.address}</span> : null },
              { label: "Systems", value: v.systems.length ? <div className="flex flex-wrap gap-1">{v.systems.map((s) => <Badge key={s} tone="blue">{SYSTEMS[s as keyof typeof SYSTEMS] ?? s}</Badge>)}</div> : null },
              { label: "Notes", value: v.notes },
            ]} />
          </SectionCard>
          {write && (
            <SectionCard title="Link item or update rate" description="Rates from posted purchase invoices update automatically. Use this for quoted rates or new suppliers.">
              <form action={linkVendorItem.bind(null, v.id)} className="space-y-3">
                <Field label="Item" required>
                  <Select name="itemId" required defaultValue="">
                    <option value="" disabled>Choose item…</option>
                    {allItems.map((i) => <option key={i.id} value={i.id}>{i.code} · {i.name}</option>)}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quoted rate (₹)"><Input name="lastRate" type="number" inputMode="decimal" step="0.01" min={0} className="text-right" /></Field>
                  <Field label="Lead time (days)"><Input name="leadTimeDays" type="number" inputMode="numeric" min={0} max={365} className="text-right" /></Field>
                </div>
                <SubmitButton size="sm" pendingText="Saving…">Save rate</SubmitButton>
              </form>
            </SectionCard>
          )}
        </>
      }
    >
      <MetricStrip>
        <Metric label="Outstanding payable" value={moneyShort(outstanding)} tone={overdue > 0 ? "bad" : outstanding > 0 ? "warn" : "default"} hint={overdue > 0 ? `${money(overdue)} overdue` : "Posted invoices less payments"} />
        <Metric label="Purchases this FY" value={moneyShort(fyPurchases)} hint={`${posted.length} posted invoice${posted.length === 1 ? "" : "s"} in total`} />
        <Metric label="Items supplied" value={supplied.length} hint={`${cheapestCount} where this vendor is cheapest`} />
        <Metric label="Price competitiveness" value={avgDiff == null ? "-" : `${avgDiff > 0 ? "+" : ""}${pct(avgDiff)}`}
          tone={avgDiff == null ? "default" : avgDiff <= 0 ? "good" : avgDiff > 5 ? "bad" : "warn"}
          hint={avgDiff == null ? "No other vendor supplies the same items" : `Average vs other vendors on ${diffs.length} common item${diffs.length === 1 ? "" : "s"} (negative is cheaper)`} />
      </MetricStrip>

      {tab === "items" && (
        <SectionCard title="Items supplied" count={supplied.length} icon={Package} flush
          empty={rows.length === 0 && "No items linked yet. Items are added automatically when a purchase invoice from this vendor is posted."}>
          <ResponsiveTable flush rows={rows} columns={itemCols} rowKey={(r) => r.itemId} caption="Items supplied" />
        </SectionCard>
      )}

      {tab === "invoices" && (
        <SectionCard title="Purchase invoices" count={invoices.length} icon={FileText} flush
          empty={invoices.length === 0 && "No purchase invoices yet."}>
          <ResponsiveTable flush rows={invoices} columns={invCols} rowKey={(r) => r.inv.id} caption="Purchase invoices" />
        </SectionCard>
      )}
    </DetailPage>
  );
}
