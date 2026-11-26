import { redirect } from "next/navigation";
import { asc, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { amcContracts, customers, items, projects, salesOrderLines, salesOrders, serviceCalls } from "@/db/schema";
import { currentBillingPeriod } from "@/lib/amc";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { addDays, fmtDate, qty, round2, todayIST } from "@/lib/format";
import { Field, Flash, Input, Select, Textarea } from "@/components/ui";
import { Callout, FormFooter, FormPage, FormSection, KeyValueGrid } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { createInvoice } from "../../actions";
import { creditedQtyByOrderLine } from "@/lib/returns";
import { InvoiceLineEditor, type InvEditorLine, type InvPickItem } from "../../_components/invoice-line-editor";

export const metadata = { title: "New tax invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ orderId?: string; customerId?: string; amcId?: string; serviceCallId?: string; err?: string }> }) {
  const user = await requireUser("billing");
  if (!canWrite(user.role, "billing")) redirect("/billing/invoices?err=" + encodeURIComponent("You do not have permission to create invoices"));
  const sp = await searchParams;
  const db = await getDb();
  const today = todayIST();

  const itemRows = await db.select({ id: items.id, code: items.code, name: items.name, uom: items.uom, gstRate: items.gstRate, lastSaleRate: items.lastSaleRate, listPrice: items.listPrice })
    .from(items).where(eq(items.active, true)).orderBy(asc(items.code));
  const pick: InvPickItem[] = itemRows.map((i) => ({ id: i.id, code: i.code, name: i.name, uom: i.uom, gstRate: Number(i.gstRate), rate: Number(i.lastSaleRate ?? i.listPrice ?? 0) }));
  const gstOf = new Map(itemRows.map((i) => [i.id, Number(i.gstRate)]));

  const orderId = Number(sp.orderId) || undefined;
  let order: { o: typeof salesOrders.$inferSelect; c: typeof customers.$inferSelect; projectName: string | null } | undefined;
  let initial: InvEditorLine[] = [];
  if (orderId) {
    [order] = await db.select({ o: salesOrders, c: customers, projectName: projects.name }).from(salesOrders)
      .innerJoin(customers, eq(customers.id, salesOrders.customerId)).leftJoin(projects, eq(projects.id, salesOrders.projectId))
      .where(eq(salesOrders.id, orderId));
    if (order) {
      const ol = await db.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId)).orderBy(asc(salesOrderLines.sortOrder));
      // credit notes give back invoiceable qty (replacements); returned goods no longer count as delivered
      const credited = await creditedQtyByOrderLine(db, ol.map((l) => l.id));
      const roomOf = (l: (typeof ol)[number]) => round2(Number(l.qty) + (credited.get(l.id) ?? 0) - Number(l.invoicedQty));
      initial = ol
        .filter((l) => l.deliveryStatus !== "cancelled" && roomOf(l) > 1e-6)
        .map((l) => {
          const room = roomOf(l);
          const cr = credited.get(l.id) ?? 0;
          const netInvoiced = Number(l.invoicedQty) - cr;
          const def = Math.max(0, Math.min(room, round2(Number(l.deliveredQty) - Number(l.returnedQty) - netInvoiced)));
          return {
            orderLineId: l.id, itemId: l.itemId, description: l.description, uom: l.uom, qty: def, rate: Number(l.rate),
            gstRate: l.itemId ? gstOf.get(l.itemId) ?? 18 : 18, maxQty: room,
            info: `Ordered ${qty(l.qty)} · delivered ${qty(l.deliveredQty)}${Number(l.returnedQty) ? ` · returned ${qty(l.returnedQty)}` : ""} · invoiced ${qty(l.invoicedQty)}${cr ? ` · credited ${qty(cr)}` : ""} ${l.uom}`,
          };
        });
    }
  }

  // AMC billing and chargeable service calls link here with ?customerId=&amcId= or ?customerId=&serviceCallId=
  const presetCustomer = !order ? Number(sp.customerId) || undefined : undefined;
  let serviceCallId: number | undefined;
  let amcId: number | undefined;
  const linkNotes: string[] = [];
  if (presetCustomer && sp.amcId) {
    const [k] = await db.select().from(amcContracts).where(eq(amcContracts.id, Number(sp.amcId) || 0));
    if (!k || k.customerId !== presetCustomer) linkNotes.push("That AMC contract does not belong to this customer, so no AMC line was added.");
    else {
      const per = currentBillingPeriod(k.startDate, k.endDate, Number(k.value), k.billingFrequency, today);
      if (!per) linkNotes.push(`AMC ${k.number} has no billing period running today, so no AMC line was added.`);
      else {
        amcId = k.id;
        initial.push({ orderLineId: null, itemId: null, description: `AMC charges: ${k.number}, ${fmtDate(per.from)} to ${fmtDate(per.to)}`, uom: "Nos", qty: 1, rate: round2(per.amount), gstRate: 18 });
      }
    }
  }
  if (presetCustomer && sp.serviceCallId) {
    const [sc] = await db.select().from(serviceCalls).where(eq(serviceCalls.id, Number(sp.serviceCallId) || 0));
    if (!sc || sc.customerId !== presetCustomer) linkNotes.push("That service call does not belong to this customer, so no line was added.");
    else if (sc.salesInvoiceId) linkNotes.push(`Service call ${sc.number} is already invoiced.`);
    else {
      serviceCallId = sc.id;
      const short = sc.description.replace(/\s+/g, " ").trim();
      initial.push({ orderLineId: null, itemId: null, description: `Service call ${sc.number}: ${short.length > 120 ? short.slice(0, 117) + "..." : short}`, uom: "Nos", qty: 1, rate: round2(Number(sc.chargeAmount)), gstRate: 18 });
    }
  }

  const [custList, projList] = order ? [[], []] : await Promise.all([
    db.select({ id: customers.id, name: customers.name, terms: customers.paymentTermsDays }).from(customers).where(eq(customers.active, true)).orderBy(asc(customers.name)),
    db.select({ id: projects.id, code: projects.code, name: projects.name }).from(projects).where(ne(projects.status, "closed")).orderBy(desc(projects.id)).limit(300),
  ]);

  return (
    <FormPage
      title="New tax invoice"
      subtitle={order ? `Against order ${order.o.number}` : "Manual invoice, not linked to an order"}
      back={order ? { href: `/orders/${order.o.id}`, label: order.o.number } : { href: "/billing/invoices", label: "Invoices" }}
      width="wide"
      notices={
        <>
          <Flash err={sp.err} />
          {orderId && !order && <Callout tone="warning">We could not find that order, so you are creating a manual invoice instead.</Callout>}
          {linkNotes.length > 0 && <Callout tone="warning">{linkNotes.join(" ")}</Callout>}
        </>
      }
    >
      <form action={createInvoice} className="space-y-4">
        {serviceCallId && <input type="hidden" name="serviceCallId" value={serviceCallId} />}
        {amcId && <input type="hidden" name="amcId" value={amcId} />}
        <FormSection title="Customer and dates" description={order ? "Billed to the customer on the order." : "Who you are billing and when payment is due."}>
          {order ? (
            <div className="sm:col-span-2">
              <input type="hidden" name="orderId" value={order.o.id} />
              <input type="hidden" name="customerId" value={order.c.id} />
              {order.o.projectId && <input type="hidden" name="projectId" value={order.o.projectId} />}
              <KeyValueGrid items={[
                ["Customer", order.c.name],
                ["GSTIN", order.c.gstin || "-"],
                ["Customer PO", order.o.customerPoNumber ? `${order.o.customerPoNumber} (${fmtDate(order.o.customerPoDate)})` : "-"],
                ["Project", order.projectName || "-"],
              ]} />
            </div>
          ) : (
            <>
              <Field label="Customer" required>
                <Select name="customerId" required defaultValue={presetCustomer ? String(presetCustomer) : ""}>
                  <option value="" disabled>Select customer</option>
                  {custList.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.terms} days credit)</option>)}
                </Select>
              </Field>
              <Field label="Project">
                <Select name="projectId" defaultValue="">
                  <option value="">None</option>
                  {projList.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </Select>
              </Field>
            </>
          )}
          <Field label="Invoice date" required><Input type="date" name="invoiceDate" required defaultValue={today} /></Field>
          <Field label="Due date" hint={order ? `Leave blank for ${order.c.paymentTermsDays} days credit (${fmtDate(addDays(today, order.c.paymentTermsDays))})` : "Leave blank to use the customer's credit days"}>
            <Input type="date" name="dueDate" />
          </Field>
          <Field label="Notes and terms" className="sm:col-span-2">
            <Textarea name="notes" maxLength={4000} defaultValue={order?.o.customerPoNumber ? `Against your PO ${order.o.customerPoNumber}${order.o.customerPoDate ? ` dated ${fmtDate(order.o.customerPoDate)}` : ""}` : ""} />
          </Field>
        </FormSection>
        <FormSection title="Lines" columns={1}
          description={order && initial.length > 0 ? "Quantities default to delivered (less returns) minus already invoiced (less credit notes). Change them if you bill in advance, up to the ordered quantity." : undefined}>
          {order && initial.length === 0 && <Callout tone="info">All order lines are fully invoiced. You can still add extra lines, such as transport.</Callout>}
          <InvoiceLineEditor items={pick} initial={initial} />
        </FormSection>
        <FormFooter cancelHref={order ? `/orders/${order.o.id}` : "/billing/invoices"} note="Issuing updates price history and the order's invoiced quantities.">
          <SubmitButton pendingText="Issuing…" confirm="Issue this invoice? It will update price history and order invoiced quantities.">Issue invoice</SubmitButton>
        </FormFooter>
      </form>
    </FormPage>
  );
}
