import Link from "next/link";
import { and, asc, count, eq, ilike, max, or, sql, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { purchaseInvoices, vendorItems, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { SYSTEMS } from "@/lib/constants";
import { fmtDate, money } from "@/lib/format";
import { vendorOutstanding } from "@/lib/purchasing";
import { Badge, EmptyState, FilterBar, Flash, LinkButton, PageHeader, Select, Stat, Table, Td, Th } from "@/components/ui";

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
  const [outstanding, itemCounts, lastBuys] = await Promise.all([
    vendorOutstanding(db),
    db.select({ vendorId: vendorItems.vendorId, n: count() }).from(vendorItems).groupBy(vendorItems.vendorId),
    db.select({ vendorId: purchaseInvoices.vendorId, d: max(purchaseInvoices.invoiceDate) }).from(purchaseInvoices).where(eq(purchaseInvoices.status, "posted")).groupBy(purchaseInvoices.vendorId),
  ]);
  const itemsBy = new Map(itemCounts.map((r) => [r.vendorId, Number(r.n)]));
  const lastBy = new Map(lastBuys.map((r) => [r.vendorId, r.d]));
  const totalPayable = ids.reduce((s, id) => s + (outstanding.get(id) ?? 0), 0);
  const withDues = ids.filter((id) => (outstanding.get(id) ?? 0) > 0.5).length;

  return (
    <div>
      <PageHeader title="Vendors" subtitle="Vendor master: who supplies what, at what rate, and what we owe them."
        actions={write && <LinkButton href="/vendors/new"><Plus size={16} aria-hidden /> New vendor</LinkButton>} />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Vendors" value={list.length} />
        <Stat label="Outstanding payable" value={money(totalPayable)} tone={totalPayable > 0 ? "warn" : "default"} />
        <Stat label="Vendors with dues" value={withDues} />
      </div>
      <FilterBar q={sp.q} placeholder="Search name, city, GSTIN…">
        <label className="sm:w-56"><span className="sr-only">System</span>
          <Select name="system" defaultValue={system}>
            <option value="">All systems</option>
            {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </label>
        <label className="sm:w-40"><span className="sr-only">Status</span>
          <Select name="status" defaultValue={sp.status ?? ""}>
            <option value="">Active</option><option value="inactive">Inactive</option><option value="all">All</option>
          </Select>
        </label>
      </FilterBar>
      {list.length === 0 ? (
        <EmptyState title="No vendors found" action={write && <LinkButton href="/vendors/new">Add a vendor</LinkButton>}>
          Vendors are linked to items automatically when their purchase invoices are posted.
        </EmptyState>
      ) : (
        <Table>
          <thead><tr><Th>Vendor</Th><Th>Systems</Th><Th>Contact</Th><Th className="text-right">Items</Th><Th>Last purchase</Th><Th className="text-right">Outstanding</Th></tr></thead>
          <tbody>
            {list.map((v) => {
              const due = outstanding.get(v.id) ?? 0;
              return (
                <tr key={v.id} className="hover:bg-muted/50">
                  <Td><Link href={`/vendors/${v.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{v.name}</Link>
                    <div className="text-xs text-ink-faint">{v.city ?? ""}{!v.active && " · inactive"}</div></Td>
                  <Td className="max-w-80 whitespace-normal"><div className="flex flex-wrap gap-1">
                    {v.systems.length ? v.systems.map((s) => <Badge key={s} tone="blue">{SYSTEMS[s as keyof typeof SYSTEMS] ?? s}</Badge>) : <span className="text-ink-faint">-</span>}
                  </div></Td>
                  <Td className="text-xs">{v.contactPerson ?? "-"}{v.phone && <div><a href={`tel:${v.phone}`} className="text-ink-soft hover:underline">{v.phone}</a></div>}</Td>
                  <Td className="text-right tabular-nums">{itemsBy.get(v.id) ?? 0}</Td>
                  <Td>{fmtDate(lastBy.get(v.id) ?? null)}</Td>
                  <Td className="text-right tabular-nums">{due > 0.5 ? <span className="font-medium text-amber-700 dark:text-amber-300">{money(due)}</span> : <span className="text-ink-faint">-</span>}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
