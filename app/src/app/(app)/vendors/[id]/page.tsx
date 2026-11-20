import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { getDb } from "@/db";
import { items, projects, purchaseInvoices, vendorItems, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { SYSTEMS } from "@/lib/constants";
import { fmtDate, money, pct, round2, todayIST } from "@/lib/format";
import { purchaseOutstanding } from "@/lib/purchasing";
import { Badge, Button, Card, DL, EmptyState, Field, Flash, Input, LinkButton, PageHeader, Select, Stat, StatusBadge, Table, Td, Th, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { linkVendorItem, unlinkVendorItem } from "../actions";

export default async function VendorDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={v.name}
        subtitle={<>{v.city ?? ""}{v.gstin && <> · GSTIN <span className="font-mono">{v.gstin}</span></>}{!v.active && <> · <Badge>inactive</Badge></>}</>}
        back={{ href: "/vendors", label: "Vendors" }}
        actions={<>
          {canWrite(user.role, "purchases") && <LinkButton href={`/purchases/new?vendor=${v.id}`} variant="secondary"><Plus size={16} aria-hidden /> Purchase invoice</LinkButton>}
          {write && <LinkButton href={`/vendors/${v.id}/edit`}><Pencil size={16} aria-hidden /> Edit</LinkButton>}
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Outstanding payable" value={money(outstanding)} tone={overdue > 0 ? "bad" : outstanding > 0 ? "warn" : "default"} hint={overdue > 0 ? `${money(overdue)} overdue` : "Posted invoices − payments"} />
        <Stat label="Purchases this FY" value={money(fyPurchases)} hint={`${posted.length} posted invoice${posted.length === 1 ? "" : "s"} in total`} />
        <Stat label="Items supplied" value={supplied.length} hint={`${cheapestCount} where this vendor is cheapest`} />
        <Stat label="Price competitiveness" value={avgDiff == null ? "—" : `${avgDiff > 0 ? "+" : ""}${pct(avgDiff)}`}
          tone={avgDiff == null ? "default" : avgDiff <= 0 ? "good" : avgDiff > 5 ? "bad" : "warn"}
          hint={avgDiff == null ? "No other vendor supplies the same items" : `Avg vs other vendors on ${diffs.length} common item${diffs.length === 1 ? "" : "s"} (negative = cheaper)`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <DL items={[
            ["Contact person", v.contactPerson],
            ["Phone", v.phone ? <a href={`tel:${v.phone}`} className="hover:underline">{v.phone}</a> : null],
            ["Email", v.email ? <a href={`mailto:${v.email}`} className="hover:underline">{v.email}</a> : null],
            ["Payment terms", `${v.paymentTermsDays} days`],
            ["Address", v.address],
            ["Systems", v.systems.length ? <div className="flex flex-wrap gap-1">{v.systems.map((s) => <Badge key={s} tone="blue">{SYSTEMS[s as keyof typeof SYSTEMS] ?? s}</Badge>)}</div> : null],
            ["Notes", v.notes],
          ]} />
        </Card>
        {write && (
          <Card title="Link item / update rate">
            <form action={linkVendorItem.bind(null, v.id)} className="space-y-3">
              <Field label="Item" required>
                <Select name="itemId" required defaultValue="">
                  <option value="" disabled>Choose item…</option>
                  {allItems.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quoted rate (₹)"><Input name="lastRate" type="number" step="0.01" min={0} /></Field>
                <Field label="Lead time (days)"><Input name="leadTimeDays" type="number" min={0} max={365} /></Field>
              </div>
              <p className="text-xs text-ink-soft">Rates from posted purchase invoices update automatically; use this for quoted rates or new suppliers.</p>
              <SubmitButton size="sm">Save</SubmitButton>
            </form>
          </Card>
        )}
      </div>

      <Card title={`Items supplied (${supplied.length})`} bodyClassName="p-0">
        {rows.length === 0 ? <div className="p-4"><EmptyState title="No items linked yet">Items are added automatically when a purchase invoice from this vendor is posted.</EmptyState></div> : (
          <Table className="rounded-none border-0 shadow-none">
            <thead><tr><Th>Item</Th><Th>Size / make</Th><Th className="text-right">Last rate</Th><Th>Last date</Th><Th className="text-right">Lead time</Th><Th className="text-right">vs other vendors</Th>{write && <Th><span className="sr-only">Actions</span></Th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemId} className="hover:bg-muted/50">
                  <Td className="max-w-72 whitespace-normal"><Link href={`/items/${r.itemId}`} className="hover:underline">{r.name}</Link>
                    <div className="font-mono text-xs text-ink-faint">{r.code} · {SYSTEMS[r.system as keyof typeof SYSTEMS] ?? r.system}</div></Td>
                  <Td>{r.size ?? "—"}<div className="text-xs text-ink-faint">{r.make ?? ""}</div></Td>
                  <Td className="text-right tabular-nums">{money(r.lastRate)} <span className="text-xs text-ink-faint">/{r.uom}</span>
                    {r.itemLatestVendor === v.id && <div><Badge tone="green">current latest</Badge></div>}</Td>
                  <Td>{fmtDate(r.lastDate)}</Td>
                  <Td className="text-right">{r.leadTimeDays != null ? `${r.leadTimeDays} d` : "—"}</Td>
                  <Td className={cx("text-right tabular-nums", r.diff != null && (r.diff <= 0 ? "text-emerald-600" : "text-red-600"))}>
                    {r.diff == null ? <span className="text-ink-faint">only vendor</span> : <>{r.diff > 0 ? "+" : ""}{pct(r.diff)}
                      <div className="text-xs text-ink-faint">best {money(r.other!.min)} · {r.other!.minVendor}</div></>}
                  </Td>
                  {write && (
                    <Td>
                      <form action={unlinkVendorItem.bind(null, v.id, r.itemId)}>
                        <Button type="submit" variant="ghost" size="sm" aria-label={`Remove ${r.code} from vendor`} title="Remove from vendor list"><Trash2 size={14} aria-hidden /></Button>
                      </form>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title={`Purchase invoices (${invoices.length})`} bodyClassName="p-0">
        {invoices.length === 0 ? <div className="p-4 text-sm text-ink-soft">No purchase invoices yet.</div> : (
          <Table className="rounded-none border-0 shadow-none">
            <thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Due</Th><Th>Project</Th><Th>Status</Th><Th className="text-right">Total</Th><Th className="text-right">Outstanding</Th></tr></thead>
            <tbody>
              {invoices.map(({ inv, projectName }) => {
                const out = inv.status === "posted" ? purchaseOutstanding(inv) : 0;
                const od = inv.status === "posted" && out > 0.5 && inv.dueDate && inv.dueDate < today;
                return (
                  <tr key={inv.id} className="hover:bg-muted/50">
                    <Td>{canPurchases ? <Link href={`/purchases/${inv.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{inv.invoiceNo}</Link> : inv.invoiceNo}</Td>
                    <Td>{fmtDate(inv.invoiceDate)}</Td>
                    <Td className={cx(od && "font-medium text-red-600")}>{fmtDate(inv.dueDate)}</Td>
                    <Td>{projectName ?? <span className="text-ink-faint">Stock</span>}</Td>
                    <Td><StatusBadge status={inv.status === "posted" && out <= 0.5 ? "paid" : inv.status} /></Td>
                    <Td className="text-right tabular-nums">{money(inv.total)}</Td>
                    <Td className="text-right tabular-nums">{inv.status === "posted" ? money(out) : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
