import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, lte, or, isNull, ne } from "drizzle-orm";
import { Ban, CheckCircle2, Pencil, Undo2, Wallet } from "lucide-react";
import { getDb } from "@/db";
import { items, payments, priceHistory, projects, purchaseInvoiceLines, purchaseInvoices, purchaseOrders, users, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { PAYMENT_MODES } from "@/lib/constants";
import { fmtDate, fmtDateTime, money, pct, qty, todayIST } from "@/lib/format";
import { PRICE_JUMP_PCT, purchaseOutstanding } from "@/lib/purchasing";
import { Field, Flash, Input, LinkButton, Select, Td, cx } from "@/components/ui";
import {
  Callout, ConfirmButton, DetailPage, KeyValueGrid, MetaChip, ResponsiveTable, SectionCard, StatusPill, SummaryRows, type Column,
} from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { cancelPurchase, postPurchase, recordPayment } from "../actions";

export const metadata = { title: "Purchase invoice" };

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

  const [lines, pays, poRows] = await Promise.all([
    db.select({ l: purchaseInvoiceLines, code: items.code, name: items.name, uom: items.uom, size: items.size, latest: items.lastPurchaseRate, listPrice: items.listPrice })
      .from(purchaseInvoiceLines).innerJoin(items, eq(items.id, purchaseInvoiceLines.itemId))
      .where(eq(purchaseInvoiceLines.invoiceId, invoiceId)).orderBy(asc(purchaseInvoiceLines.id)),
    db.select({ p: payments, by: users.name }).from(payments).leftJoin(users, eq(users.id, payments.createdBy))
      .where(eq(payments.purchaseInvoiceId, invoiceId)).orderBy(desc(payments.date), desc(payments.id)),
    inv.purchaseOrderId
      ? db.select({ id: purchaseOrders.id, number: purchaseOrders.number }).from(purchaseOrders).where(eq(purchaseOrders.id, inv.purchaseOrderId))
      : Promise.resolve([]),
  ]);
  const po = poRows[0];
  const canSeePo = canRead(user.role, "purchaseOrders");

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
  const canPay = write && inv.status === "posted" && out > 0.5;
  const canReturn = inv.status === "posted" && canWrite(user.role, "returns");
  const isDraft = write && inv.status === "draft";

  type L = (typeof lines)[number];
  const lineCols: Column<L>[] = [
    {
      key: "item", header: "Item", card: "title", className: "max-w-80 whitespace-normal",
      cell: ({ l, code, name }) => (
        <>
          <Link href={`/items/${l.itemId}`} className="hover:underline">{name}</Link>
          <div className="font-mono text-caption font-normal text-ink-faint">{code}</div>
          {l.description && <div className="text-caption font-normal text-ink-soft">{l.description}</div>}
          {po && l.poLineId != null && <div className="text-caption font-normal text-info">Against {po.number}</div>}
        </>
      ),
    },
    { key: "qty", header: "Qty", align: "right", nowrap: true, cell: ({ l, uom }) => <>{qty(l.qty)} <span className="text-caption text-ink-faint">{uom}</span></> },
    { key: "rate", header: "Rate", align: "right", nowrap: true, cell: ({ l }) => money(l.rate) },
    {
      key: "prev", header: "Previous rate", align: "right", priority: 3, className: "text-ink-soft",
      cell: ({ l }) => {
        const p = prev.get(l.itemId);
        return p
          ? <>{money(p.rate)}<div className="text-caption text-ink-faint">{fmtDate(p.date)}{p.vendorName ? ` · ${p.vendorName}` : ""}</div></>
          : <span className="text-caption">First purchase</span>;
      },
    },
    {
      key: "change", header: "Change", align: "right",
      cell: ({ l }) => {
        const p = prev.get(l.itemId);
        const ch = p && p.rate ? ((l.rate - p.rate) / p.rate) * 100 : null;
        return (
          <span className={cx(ch != null && Math.abs(ch) >= PRICE_JUMP_PCT && (ch > 0 ? "font-semibold text-danger" : "font-semibold text-success"))}>
            {ch == null ? "-" : `${ch > 0 ? "+" : ""}${pct(ch)}`}
          </span>
        );
      },
    },
    { key: "gst", header: "GST", align: "right", priority: 3, cell: ({ l }) => pct(l.gstRate, 0) },
    { key: "amount", header: "Amount", align: "right", card: "amount", nowrap: true, cell: ({ l }) => money(l.amount) },
  ];
  type P = (typeof pays)[number];
  const payCols: Column<P>[] = [
    { key: "date", header: "Date", card: "title", nowrap: true, cell: ({ p }) => fmtDate(p.date) },
    { key: "mode", header: "Mode", card: "subtitle", className: "uppercase", cell: ({ p }) => p.mode },
    { key: "ref", header: "Reference", cell: ({ p }) => <>{p.reference ?? "-"}{p.notes && <div className="text-caption text-ink-faint">{p.notes}</div>}</> },
    { key: "by", header: "By", priority: 3, cell: ({ by }) => by ?? "-" },
    { key: "amount", header: "Amount", align: "right", card: "amount", nowrap: true, cell: ({ p }) => money(p.amount) },
  ];

  const primary = isDraft ? (
    <form action={postPurchase.bind(null, inv.id)}>
      <SubmitButton pendingText="Posting…" confirm="Post this invoice? It will update latest prices, vendor rates and stock. This cannot be undone.">
        <CheckCircle2 className="icon-sm" aria-hidden /> Post invoice
      </SubmitButton>
    </form>
  ) : canPay ? (
    <LinkButton href="#record-payment"><Wallet className="icon-sm" aria-hidden /> Record payment</LinkButton>
  ) : null;
  const secondary = (isDraft || canReturn) ? (
    <>
      {isDraft && <LinkButton href={`/purchases/${inv.id}/edit`} variant="secondary"><Pencil className="icon-sm" aria-hidden /> Edit</LinkButton>}
      {canReturn && <LinkButton href={`/returns/vendor/new?invoiceId=${inv.id}`} variant="secondary"><Undo2 className="icon-sm" aria-hidden /> Return to vendor</LinkButton>}
    </>
  ) : undefined;
  const more = isDraft ? (
    <form action={cancelPurchase.bind(null, inv.id)}>
      <ConfirmButton variant="ghost" className="text-danger" confirmVariant="danger" stacked pendingText="Cancelling…" confirmLabel="Yes, cancel draft"
        confirm="Cancel this draft invoice?">
        <Ban className="icon-sm" aria-hidden /> Cancel draft
      </ConfirmButton>
    </form>
  ) : undefined;

  return (
    <DetailPage
      back={{ href: "/purchases", label: "Purchase invoices" }}
      eyebrow="Purchase invoice"
      title={inv.invoiceNo}
      status={<StatusPill status={status} />}
      meta={
        <>
          <MetaChip label="Vendor" href={vendor && canRead(user.role, "vendors") ? `/vendors/${vendor.id}` : undefined}>{vendor ? vendor.name : "Unknown vendor"}</MetaChip>
          <MetaChip label="Date">{fmtDate(inv.invoiceDate)}</MetaChip>
          <MetaChip label="Cost centre" href={inv.projectId && canRead(user.role, "projects") ? `/projects/${inv.projectId}` : undefined}>{row.projectCode ?? "Stock"}</MetaChip>
          {po && <MetaChip label="PO" href={canSeePo ? `/purchase-orders/${po.id}` : undefined}>{po.number}</MetaChip>}
          <MetaChip label="Total">{money(inv.total)}</MetaChip>
        </>
      }
      primaryAction={primary}
      secondaryActions={secondary}
      moreActions={more}
      notices={
        <>
          <Flash ok={sp.ok} err={sp.err} />
          {inv.status === "draft" && (
            <Callout tone="warning" title="This invoice is a draft">
              Item prices, vendor rates{po ? ", the PO's received quantity" : ""} and stock are updated only when it is posted.
              {jumps > 0 && <> {jumps} line{jumps === 1 ? " differs" : "s differ"} by {PRICE_JUMP_PCT}% or more from the previous purchase price.</>}
            </Callout>
          )}
          {overdue && (
            <Callout tone="danger" title="Payment is overdue">
              {money(out)} was due on {fmtDate(inv.dueDate)}.
            </Callout>
          )}
        </>
      }
      aside={
        <>
          <SectionCard title="Summary">
            <SummaryRows rows={[
              ["Subtotal", money(inv.subtotal)],
              ["GST", money(inv.taxAmount)],
              ["Invoice total", <strong key="t">{money(inv.total)}</strong>],
              ["Paid", `${money(inv.paidAmount)} · ${pays.length} payment${pays.length === 1 ? "" : "s"}`],
              ["Outstanding", <span key="o" className={cx(overdue ? "text-danger" : out > 0.5 ? "text-warning" : inv.status === "posted" && "text-success")}>{inv.status === "posted" ? money(out) : "-"}</span>],
              ["Due date", fmtDate(inv.dueDate)],
            ]} />
          </SectionCard>
          <SectionCard title="Details">
            <KeyValueGrid columns={1} items={[
              { label: "Vendor GSTIN", value: vendor?.gstin ? <span className="font-mono">{vendor.gstin}</span> : null },
              { label: "Payment terms", value: vendor ? `${vendor.paymentTermsDays} days` : null },
              { label: "Cost centre", value: row.projectCode ? `${row.projectCode} · ${row.projectName ?? ""}` : "Received into store" },
              { label: "Purchase order", value: po ? (canSeePo ? <Link href={`/purchase-orders/${po.id}`} className="text-brand-700 hover:underline dark:text-brand-300">{po.number}</Link> : po.number) : null },
              { label: "Entered by", value: row.createdByName },
              { label: "Entered at", value: fmtDateTime(inv.createdAt) },
              { label: "Notes", value: inv.notes },
            ]} />
          </SectionCard>
        </>
      }
    >
      <SectionCard title="Lines" count={lines.length} flush empty={lines.length === 0 && "No lines on this invoice."}>
        <ResponsiveTable flush rows={lines} columns={lineCols} rowKey={(x) => x.l.id} caption="Invoice lines"
          footer={
            <>
              <tr><Td colSpan={6} className="text-right text-ink-soft">Subtotal</Td><Td className="text-right tabular-nums">{money(inv.subtotal)}</Td></tr>
              <tr><Td colSpan={6} className="text-right text-ink-soft">GST</Td><Td className="text-right tabular-nums">{money(inv.taxAmount)}</Td></tr>
              <tr><Td colSpan={6} className="text-right font-semibold">Total</Td><Td className="text-right font-semibold tabular-nums">{money(inv.total)}</Td></tr>
            </>
          } />
      </SectionCard>

      <SectionCard title="Payments" count={pays.length} icon={Wallet} flush
        empty={pays.length === 0 && (inv.status === "draft" ? "No payments yet. Payments can be recorded after the invoice is posted." : "No payments yet.")}>
        <ResponsiveTable flush rows={pays} columns={payCols} rowKey={(x) => x.p.id} caption="Payments" />
      </SectionCard>

      {canPay && (
        <SectionCard id="record-payment" title="Record payment to vendor" icon={Wallet} description={`Defaults to the full outstanding amount of ${money(out)}.`}>
          <form action={recordPayment.bind(null, inv.id)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Amount (₹)" required><Input name="amount" type="number" inputMode="decimal" step="0.01" min={0.01} max={out + 0.5} required defaultValue={out} className="text-right" /></Field>
              <Field label="Date" required><Input name="date" type="date" required defaultValue={today} max={today} /></Field>
              <Field label="Mode" required>
                <Select name="mode" defaultValue="bank">{PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</Select>
              </Field>
              <Field label="Reference"><Input name="reference" maxLength={80} placeholder="UTR or cheque no." /></Field>
              <Field label="Notes" className="sm:col-span-2 lg:col-span-4"><Input name="notes" maxLength={500} /></Field>
            </div>
            <div className="flex justify-end">
              <SubmitButton pendingText="Recording…" className="max-sm:w-full">Record payment</SubmitButton>
            </div>
          </form>
        </SectionCard>
      )}
    </DetailPage>
  );
}
