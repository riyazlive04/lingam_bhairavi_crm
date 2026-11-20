import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, lte, or, isNull, ne } from "drizzle-orm";
import { Pencil } from "lucide-react";
import { getDb } from "@/db";
import { items, payments, priceHistory, projects, purchaseInvoiceLines, purchaseInvoices, users, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { PAYMENT_MODES } from "@/lib/constants";
import { fmtDate, fmtDateTime, money, pct, qty, todayIST } from "@/lib/format";
import { PRICE_JUMP_PCT, purchaseOutstanding } from "@/lib/purchasing";
import { Card, DL, Field, Flash, Input, LinkButton, PageHeader, Select, Stat, StatusBadge, Table, Td, Th, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { cancelPurchase, postPurchase, recordPayment } from "../actions";

export default async function PurchaseDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("purchases");
  const { id } = await params;
  const sp = await searchParams;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId)) notFound();
  const db = await getDb();
  const [row] = await db.select({ inv: purchaseInvoices, vendor: vendors, projectCode: projects.code, projectName: projects.name, createdByName: users.name })
    .from(purchaseInvoices)
    .leftJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId))
    .leftJoin(projects, eq(projects.id, purchaseInvoices.projectId))
    .leftJoin(users, eq(users.id, purchaseInvoices.createdBy))
    .where(eq(purchaseInvoices.id, invoiceId));
  if (!row) notFound();
  const { inv, vendor } = row;
  const write = canWrite(user.role, "purchases");
  const today = todayIST();

  const [lines, pays] = await Promise.all([
    db.select({ l: purchaseInvoiceLines, code: items.code, name: items.name, uom: items.uom, size: items.size, latest: items.lastPurchaseRate, listPrice: items.listPrice })
      .from(purchaseInvoiceLines).innerJoin(items, eq(items.id, purchaseInvoiceLines.itemId))
      .where(eq(purchaseInvoiceLines.invoiceId, invoiceId)).orderBy(asc(purchaseInvoiceLines.id)),
    db.select({ p: payments, by: users.name }).from(payments).leftJoin(users, eq(users.id, payments.createdBy))
      .where(eq(payments.purchaseInvoiceId, invoiceId)).orderBy(desc(payments.date), desc(payments.id)),
  ]);

  // Previous purchase rate of each item before this invoice (from any vendor)
  const itemIds = [...new Set(lines.map((x) => x.l.itemId))];
  const prevRows = itemIds.length ? await db.select({ itemId: priceHistory.itemId, rate: priceHistory.rate, date: priceHistory.date, vendorName: vendors.name })
    .from(priceHistory).leftJoin(vendors, eq(vendors.id, priceHistory.vendorId))
    .where(and(inArray(priceHistory.itemId, itemIds), eq(priceHistory.kind, "purchase"), lte(priceHistory.date, inv.invoiceDate),
      or(isNull(priceHistory.refId), ne(priceHistory.refType, "purchase_invoice"), ne(priceHistory.refId, invoiceId))))
    .orderBy(desc(priceHistory.date), desc(priceHistory.id)) : [];
  const prev = new Map<number, { rate: number; date: string; vendorName: string | null }>();
  for (const p of prevRows) if (!prev.has(p.itemId)) prev.set(p.itemId, { rate: Number(p.rate), date: p.date, vendorName: p.vendorName });

  const out = inv.status === "posted" ? purchaseOutstanding(inv) : 0;
  const overdue = out > 0.5 && inv.dueDate != null && inv.dueDate < today;
  const status = inv.status === "posted" ? (out <= 0.5 ? "paid" : inv.paidAmount > 0 ? "partially_paid" : "posted") : inv.status;
  const jumps = lines.filter((x) => { const p = prev.get(x.l.itemId); return p && Math.abs((x.l.rate - p.rate) / p.rate) * 100 >= PRICE_JUMP_PCT; }).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">Invoice {inv.invoiceNo} <StatusBadge status={status} /></span>}
        subtitle={<>{vendor ? (canRead(user.role, "vendors") ? <Link href={`/vendors/${vendor.id}`} className="hover:underline">{vendor.name}</Link> : vendor.name) : "Unknown vendor"} · {fmtDate(inv.invoiceDate)}</>}
        back={{ href: "/purchases", label: "Purchase invoices" }}
        actions={write && inv.status === "draft" && <>
          <LinkButton href={`/purchases/${inv.id}/edit`} variant="secondary"><Pencil size={16} aria-hidden /> Edit</LinkButton>
          <form action={cancelPurchase.bind(null, inv.id)}><SubmitButton variant="ghost" pendingText="Cancelling…" confirm="Cancel this draft invoice?">Cancel draft</SubmitButton></form>
          <form action={postPurchase.bind(null, inv.id)}><SubmitButton pendingText="Posting…" confirm="Post this invoice? It will update latest prices, vendor rates and stock. This cannot be undone.">Post invoice</SubmitButton></form>
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      {inv.status === "draft" && (
        <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          This invoice is a <strong>draft</strong>. Item prices, vendor rates and stock are updated only when it is posted.
          {jumps > 0 && <> {jumps} line{jumps === 1 ? "" : "s"} differ ≥{PRICE_JUMP_PCT}% from the previous purchase price.</>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Invoice total" value={money(inv.total)} hint={`${money(inv.subtotal)} + GST ${money(inv.taxAmount)}`} />
        <Stat label="Paid" value={money(inv.paidAmount)} hint={`${pays.length} payment${pays.length === 1 ? "" : "s"}`} />
        <Stat label="Outstanding" value={inv.status === "posted" ? money(out) : "-"} tone={overdue ? "bad" : out > 0.5 ? "warn" : "good"}
          hint={inv.dueDate ? `${overdue ? "Overdue since" : "Due"} ${fmtDate(inv.dueDate)}` : undefined} />
        <Stat label="Cost center" value={row.projectCode ?? "Stock"} hint={row.projectName ?? "Received into store"}
          href={inv.projectId && canRead(user.role, "projects") ? `/projects/${inv.projectId}` : undefined} />
      </div>

      <Card title={`Lines (${lines.length})`} bodyClassName="p-0">
        <Table className="rounded-none border-0 shadow-none">
          <thead><tr><Th>Item</Th><Th className="text-right">Qty</Th><Th className="text-right">Rate</Th><Th className="text-right">Previous rate</Th><Th className="text-right">Change</Th><Th className="text-right">GST</Th><Th className="text-right">Amount</Th></tr></thead>
          <tbody>
            {lines.map(({ l, code, name, uom }) => {
              const p = prev.get(l.itemId);
              const ch = p && p.rate ? ((l.rate - p.rate) / p.rate) * 100 : null;
              return (
                <tr key={l.id}>
                  <Td className="max-w-80 whitespace-normal"><Link href={`/items/${l.itemId}`} className="hover:underline">{name}</Link>
                    <div className="font-mono text-xs text-ink-faint">{code}</div>{l.description && <div className="text-xs text-ink-soft">{l.description}</div>}</Td>
                  <Td className="text-right tabular-nums">{qty(l.qty)} <span className="text-xs text-ink-faint">{uom}</span></Td>
                  <Td className="text-right tabular-nums">{money(l.rate)}</Td>
                  <Td className="text-right tabular-nums text-ink-soft">{p ? <>{money(p.rate)}<div className="text-xs text-ink-faint">{fmtDate(p.date)}{p.vendorName ? ` · ${p.vendorName}` : ""}</div></> : <span className="text-xs">first purchase</span>}</Td>
                  <Td className={cx("text-right tabular-nums", ch != null && Math.abs(ch) >= PRICE_JUMP_PCT && (ch > 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-600"))}>
                    {ch == null ? "-" : `${ch > 0 ? "+" : ""}${pct(ch)}`}</Td>
                  <Td className="text-right">{pct(l.gstRate, 0)}</Td>
                  <Td className="text-right tabular-nums">{money(l.amount)}</Td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><Td colSpan={6} className="text-right text-ink-soft">Subtotal</Td><Td className="text-right tabular-nums">{money(inv.subtotal)}</Td></tr>
            <tr><Td colSpan={6} className="text-right text-ink-soft">GST</Td><Td className="text-right tabular-nums">{money(inv.taxAmount)}</Td></tr>
            <tr><Td colSpan={6} className="text-right font-semibold">Total</Td><Td className="text-right font-semibold tabular-nums">{money(inv.total)}</Td></tr>
          </tfoot>
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-1">
          <DL items={[
            ["Vendor GSTIN", vendor?.gstin ? <span className="font-mono">{vendor.gstin}</span> : null],
            ["Payment terms", vendor ? `${vendor.paymentTermsDays} days` : null],
            ["Due date", fmtDate(inv.dueDate)],
            ["Entered by", row.createdByName],
            ["Entered at", fmtDateTime(inv.createdAt)],
            ["Notes", inv.notes],
          ]} />
        </Card>
        <Card title={`Payments (${pays.length})`} className="lg:col-span-2" bodyClassName="space-y-4">
          {pays.length > 0 ? (
            <Table>
              <thead><tr><Th>Date</Th><Th>Mode</Th><Th>Reference</Th><Th>By</Th><Th className="text-right">Amount</Th></tr></thead>
              <tbody>{pays.map(({ p, by }) => (
                <tr key={p.id}><Td>{fmtDate(p.date)}</Td><Td className="uppercase">{p.mode}</Td><Td>{p.reference ?? "-"}{p.notes && <div className="text-xs text-ink-faint">{p.notes}</div>}</Td><Td>{by ?? "-"}</Td><Td className="text-right tabular-nums">{money(p.amount)}</Td></tr>
              ))}</tbody>
            </Table>
          ) : <p className="text-sm text-ink-soft">No payments recorded.</p>}
          {write && inv.status === "posted" && out > 0.5 && (
            <form action={recordPayment.bind(null, inv.id)} className="rounded-lg border border-line p-3">
              <h3 className="mb-3 text-sm font-semibold text-ink">Record payment to vendor</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Amount (₹)" required><Input name="amount" type="number" step="0.01" min={0.01} max={out + 0.5} required defaultValue={out} /></Field>
                <Field label="Date" required><Input name="date" type="date" required defaultValue={today} max={today} /></Field>
                <Field label="Mode" required>
                  <Select name="mode" defaultValue="bank">{PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</Select>
                </Field>
                <Field label="Reference"><Input name="reference" maxLength={80} placeholder="UTR / cheque no." /></Field>
                <Field label="Notes" className="sm:col-span-2 lg:col-span-4"><Input name="notes" maxLength={500} /></Field>
              </div>
              <div className="mt-3"><SubmitButton size="sm" pendingText="Recording…">Record payment</SubmitButton></div>
            </form>
          )}
          {inv.status === "draft" && <p className="text-xs text-ink-faint">Payments can be recorded after the invoice is posted.</p>}
        </Card>
      </div>
    </div>
  );
}
