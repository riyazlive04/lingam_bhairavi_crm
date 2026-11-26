import Link from "next/link";
import { and, asc, count, eq, ilike, max, or, sql, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { purchaseInvoices, vendorItems, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { SYSTEMS } from "@/lib/constants";
import { fmtDate, money, moneyShort } from "@/lib/format";
import { vendorOutstanding } from "@/lib/purchasing";
import { openDebitNotes } from "@/lib/returns";
import { netDueOf } from "@/lib/billing";
import { Badge, Flash, LinkButton, Select } from "@/components/ui";
import {
  FilterPills, ListEmpty, ListFilters, ListPage, Metric, MetricStrip, ResponsiveTable, StatusPill, type Column, type FilterPillItem,
} from "@/components/patterns";
import { qs } from "../purchase-orders/_components/po-bits";

export const metadata = { title: "Vendors" };

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ q?: string; system?: string; status?: string; ok?: string; err?: string }> }) {
  const user = await requireUser("vendors");
  const sp = await searchParams;
  const db = await getDb();
  const write = canWrite(user.role, "vendors");
  const system = sp.system && sp.system in SYSTEMS ? sp.system : "";

  const conds: (SQL | undefined)[] = [];
  if (sp.status !== "all") conds.push(eq(vendors.active, sp.status !== "inactive"));
  if (system) conds.push(sql`${vendors.systems} @> ${JSON.stringify([system])}::jsonb`);
  if (sp.q) {
    const like = `%${sp.q.trim()}%`;
    conds.push(or(ilike(vendors.name, like), ilike(vendors.city, like), ilike(vendors.contactPerson, like), ilike(vendors.gstin, like)));
  }
  const list = await db.select().from(vendors).where(and(...conds)).orderBy(asc(vendors.name));
  const ids = list.map((v) => v.id);
  const [outstanding, itemCounts, lastBuys, dns] = await Promise.all([
    vendorOutstanding(db),
    db.select({ vendorId: vendorItems.vendorId, n: count() }).from(vendorItems).groupBy(vendorItems.vendorId),
    db.select({ vendorId: purchaseInvoices.vendorId, d: max(purchaseInvoices.invoiceDate) }).from(purchaseInvoices).where(eq(purchaseInvoices.status, "posted")).groupBy(purchaseInvoices.vendorId),
    openDebitNotes(db),
  ]);
  // rule 14: net due = bills due − unadjusted debit notes (same as Billing > Payables)
  const debitBy = new Map<number, number>();
  for (const d of dns) debitBy.set(d.vendorId, (debitBy.get(d.vendorId) ?? 0) + d.balance);
  const netOf = (id: number) => netDueOf(outstanding.get(id) ?? 0, debitBy.get(id) ?? 0);
  const itemsBy = new Map(itemCounts.map((r) => [r.vendorId, Number(r.n)]));
  const lastBy = new Map(lastBuys.map((r) => [r.vendorId, r.d]));
  const totalPayable = ids.reduce((s, id) => s + (outstanding.get(id) ?? 0), 0);
  const totalNet = ids.reduce((s, id) => s + netOf(id), 0);
  const withDues = ids.filter((id) => (outstanding.get(id) ?? 0) > 0.5).length;

  const status = sp.status === "inactive" || sp.status === "all" ? sp.status : undefined;
  const href = (patch: Record<string, string | undefined>) => "/vendors" + qs({ q: sp.q, system, status, ...patch });
  const activeFilters = [sp.q?.trim(), system].filter(Boolean).length;
  const pills: FilterPillItem[] = [
    { label: "Active", href: href({ status: undefined }), active: !status },
    { label: "Inactive", href: href({ status: "inactive" }), active: status === "inactive" },
    { label: "All", href: href({ status: "all" }), active: status === "all" },
  ];

  type V = (typeof list)[number];
  const columns: Column<V>[] = [
    {
      key: "name", header: "Vendor", card: "title",
      cell: (v) => (
        <>
          <Link href={`/vendors/${v.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{v.name}</Link>
          {v.city && <div className="text-caption font-normal text-ink-faint">{v.city}</div>}
        </>
      ),
    },
    { key: "status", header: "Status", card: "badge", priority: 3, cell: (v) => <StatusPill status={v.active ? "active" : "inactive"} /> },
    {
      key: "systems", header: "Systems", className: "max-w-80 whitespace-normal", priority: 3,
      cell: (v) => (
        <div className="flex flex-wrap gap-1">
          {v.systems.length ? v.systems.map((s) => <Badge key={s} tone="blue">{SYSTEMS[s as keyof typeof SYSTEMS] ?? s}</Badge>) : <span className="text-ink-faint">-</span>}
        </div>
      ),
    },
    {
      key: "contact", header: "Contact", card: "subtitle",
      cell: (v) => <>{v.contactPerson ?? "-"}{v.phone && <div><a href={`tel:${v.phone}`} className="relative z-[1] text-caption text-ink-soft hover:underline">{v.phone}</a></div>}</>,
    },
    { key: "items", header: "Items", align: "right", cell: (v) => itemsBy.get(v.id) ?? 0 },
    { key: "last", header: "Last purchase", nowrap: true, cell: (v) => fmtDate(lastBy.get(v.id) ?? null) },
    {
      key: "due", header: "Bills due", align: "right", card: "amount", nowrap: true,
      cell: (v) => { const due = outstanding.get(v.id) ?? 0; return due > 0.5 ? <span className="font-medium text-warning">{money(due)}</span> : <span className="text-ink-faint">-</span>; },
    },
    {
      key: "net", header: "Net due", align: "right", nowrap: true,
      cell: (v) => { const net = netOf(v.id); return Math.abs(net) > 0.5 ? money(net) : <span className="text-ink-faint">-</span>; },
    },
  ];

  return (
    <ListPage
      title="Vendors"
      subtitle="Vendor master: who supplies what, at what rate, and what we owe them."
      primaryAction={write && <LinkButton href="/vendors/new"><Plus className="icon-sm" aria-hidden /> New vendor</LinkButton>}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      stats={
        <MetricStrip>
          <Metric label="Vendors" value={list.length} />
          <Metric label="Bills due" value={moneyShort(totalPayable)} tone={totalPayable > 0 ? "warn" : "default"} />
          <Metric label="Net due" value={moneyShort(totalNet)} hint="After debit notes" />
          <Metric label="Vendors with dues" value={withDues} />
        </MetricStrip>
      }
      filters={
        <>
          <FilterPills label="Filter by status" items={pills} />
          <ListFilters q={sp.q} placeholder="Search name, city, GSTIN" clearHref={href({ q: undefined, system: undefined })} activeCount={activeFilters} hidden={{ status }}>
            <Select name="system" defaultValue={system} aria-label="System">
              <option value="">All systems</option>
              {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </ListFilters>
        </>
      }
      isEmpty={list.length === 0}
      empty={
        <ListEmpty filtered={activeFilters > 0 || !!status} noun="vendors" clearHref="/vendors"
          action={write && <LinkButton href="/vendors/new"><Plus className="icon-sm" aria-hidden /> Add the first vendor</LinkButton>}>
          Vendors are linked to items automatically when their purchase invoices are posted.
        </ListEmpty>
      }
      resultSummary={`${list.length} vendor${list.length === 1 ? "" : "s"}`}
    >
      <ResponsiveTable rows={list} columns={columns} rowKey={(v) => v.id} caption="Vendors" />
    </ListPage>
  );
}
