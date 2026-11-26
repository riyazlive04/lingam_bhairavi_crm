import { and, asc, desc, eq, gt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, items, projects, quotationLines, quotations, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { fmtDate, money0, round2, todayIST } from "@/lib/format";
import { Button, Field, Flash, Input, LinkButton, Select, Textarea } from "@/components/ui";
import { Callout, FormFooter, FormPage, FormSection, SectionCard } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { createOrder } from "../actions";
import { OrderLineEditor, type EditorLine, type PickItem } from "../_components/order-line-editor";
import { redirect } from "next/navigation";

export const metadata = { title: "New customer order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ quotationId?: string; err?: string }> }) {
  const user = await requireUser("orders");
  if (!canWrite(user.role, "orders")) redirect("/orders?err=" + encodeURIComponent("You do not have permission to create orders"));
  const sp = await searchParams;
  const db = await getDb();
  const today = todayIST();

  const [won, custList, projList, itemRows] = await Promise.all([
    db.select({ id: quotations.id, number: quotations.number, projectName: quotations.projectName, grandTotal: quotations.grandTotal, customerName: customers.name, quoteDate: quotations.quoteDate })
      .from(quotations).leftJoin(customers, eq(customers.id, quotations.customerId))
      .where(eq(quotations.status, "won")).orderBy(desc(quotations.quoteDate)).limit(200),
    db.select({ id: customers.id, name: customers.name, city: customers.city }).from(customers).where(eq(customers.active, true)).orderBy(asc(customers.name)),
    db.select({ id: projects.id, code: projects.code, name: projects.name, customerId: projects.customerId, quotationId: projects.quotationId })
      .from(projects).where(ne(projects.status, "closed")).orderBy(desc(projects.id)).limit(300),
    db.select({ id: items.id, code: items.code, name: items.name, uom: items.uom, lastSaleRate: items.lastSaleRate, listPrice: items.listPrice })
      .from(items).where(eq(items.active, true)).orderBy(asc(items.code)),
  ]);
  const pickItems: PickItem[] = itemRows.map((i) => ({ id: i.id, code: i.code, name: i.name, uom: i.uom, rate: Number(i.lastSaleRate ?? i.listPrice ?? 0) }));

  // ---- prefill from a won quotation
  const quotationId = Number(sp.quotationId) || undefined;
  let quote: typeof quotations.$inferSelect | undefined;
  let initial: EditorLine[] = [];
  let existingOrder: { id: number; number: string } | undefined;
  if (quotationId) {
    [quote] = await db.select().from(quotations).where(eq(quotations.id, quotationId));
    if (quote) {
      const disc = 1 - Number(quote.discountPct || 0) / 100;
      const ql = await db.select().from(quotationLines)
        .where(and(eq(quotationLines.quotationId, quote.id), gt(quotationLines.qty, 0)))
        .orderBy(asc(quotationLines.sortOrder));
      initial = ql.map((l) => ({
        itemId: l.itemId, description: l.description, qty: Number(l.qty), uom: l.uom,
        rate: round2((Number(l.supplyRate) + Number(l.erectionRate)) * disc), expectedDate: "",
      }));
      [existingOrder] = await db.select({ id: salesOrders.id, number: salesOrders.number }).from(salesOrders)
        .where(and(eq(salesOrders.quotationId, quote.id), ne(salesOrders.status, "cancelled"))).limit(1);
    }
  }
  const quoteProject = quote ? projList.find((p) => p.quotationId === quote!.id) : undefined;

  return (
    <FormPage
      title="New customer order"
      subtitle="Record a customer purchase order (PO) to track line-wise delivery."
      back={{ href: "/orders", label: "Orders" }}
      width="wide"
      notices={
        <>
          <Flash err={sp.err} />
          {quotationId && !quote && <Callout tone="danger" title="Quotation not found">Pick another won quotation, or enter the order by hand.</Callout>}
          {existingOrder && (
            <Callout tone="warning" title={`Order ${existingOrder.number} already exists for this quotation`}
              action={<LinkButton href={`/orders/${existingOrder.id}`} variant="secondary" size="sm">Open {existingOrder.number}</LinkButton>}>
              Create another only if the customer issued a separate PO.
            </Callout>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <SectionCard title="Start from a won quotation" description="Optional. Loads the quotation lines and rates so you only check quantities."
          empty={won.length === 0 && "No quotations are marked as won yet. Enter the order by hand below."}>
          <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Won quotation" className="flex-1">
              <Select name="quotationId" defaultValue={quotationId ? String(quotationId) : ""}>
                <option value="">Manual entry</option>
                {won.map((w) => (
                  <option key={w.id} value={w.id}>{w.number} · {w.customerName ?? "-"}{w.projectName ? ` · ${w.projectName}` : ""} · {money0(w.grandTotal)}</option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="secondary">Load lines</Button>
          </form>
          {quote && (
            <p className="mt-2 text-caption text-ink-soft">
              Loaded {initial.length} line{initial.length === 1 ? "" : "s"} from {quote.number} ({fmtDate(quote.quoteDate)}). Rate is supply plus erection{Number(quote.discountPct) ? `, less ${quote.discountPct}% discount` : ""}, ex-GST.
            </p>
          )}
        </SectionCard>

        <form action={createOrder} className="space-y-4">
          {quote && <input type="hidden" name="quotationId" value={quote.id} />}
          <FormSection title="Customer and PO" description="As printed on the customer's purchase order.">
            <Field label="Customer" required>
              <Select name="customerId" required defaultValue={quote ? String(quote.customerId) : ""}>
                <option value="" disabled>Select customer</option>
                {custList.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` (${c.city})` : ""}</option>)}
              </Select>
            </Field>
            <Field label="Project" hint="Link to the project cost centre, if any">
              <Select name="projectId" defaultValue={quoteProject ? String(quoteProject.id) : ""}>
                <option value="">None</option>
                {projList.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </Field>
            <Field label="Customer PO number">
              <Input name="customerPoNumber" maxLength={80} placeholder="e.g. PO/4500012345" />
            </Field>
            <Field label="Customer PO date">
              <Input name="customerPoDate" type="date" max={today} />
            </Field>
            <Field label="Order date" required>
              <Input name="orderDate" type="date" required defaultValue={today} />
            </Field>
            <Field label="Expected delivery" hint="Used for lines without their own expected date">
              <Input name="expectedDelivery" type="date" />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea name="notes" maxLength={4000} defaultValue={quote?.projectName ? `Project: ${quote.projectName}${quote.siteLocation ? `, ${quote.siteLocation}` : ""}` : ""} />
            </Field>
          </FormSection>
          <FormSection title="Lines" description="Pick from the item master or type a free-text line." columns={1}>
            <div className="min-w-0">
              <OrderLineEditor key={quote?.id ?? "manual"} items={pickItems} initial={initial} defaultExpected="" />
            </div>
          </FormSection>
          <FormFooter cancelHref="/orders">
            <SubmitButton pendingText="Creating…">Create order</SubmitButton>
          </FormFooter>
        </form>
      </div>
    </FormPage>
  );
}
