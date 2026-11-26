import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, deliveries, deliveryLines, items, projects, salesOrderLines, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, qty } from "@/lib/format";
import { getCompany } from "@/lib/billing";
import { DocNotes, DocSignature, DocTable, DocumentSheet } from "@/components/patterns";

export const metadata = { title: "Delivery challan" };

export default async function ChallanPage({ params }: { params: Promise<{ id: string; deliveryId: string }> }) {
  await requireUser("orders");
  const { id, deliveryId } = await params;
  const orderId = Number(id), delId = Number(deliveryId);
  if (!Number.isInteger(orderId) || !Number.isInteger(delId)) notFound();
  const db = await getDb();

  const [d] = await db.select().from(deliveries).where(and(eq(deliveries.id, delId), eq(deliveries.orderId, orderId)));
  if (!d) notFound();
  const [row] = await db.select({ o: salesOrders, c: customers, projectName: projects.name, siteAddress: projects.siteAddress })
    .from(salesOrders)
    .innerJoin(customers, eq(customers.id, salesOrders.customerId))
    .leftJoin(projects, eq(projects.id, salesOrders.projectId))
    .where(eq(salesOrders.id, orderId));
  if (!row) notFound();
  const lines = await db
    .select({ id: deliveryLines.id, qty: deliveryLines.qty, description: salesOrderLines.description, uom: salesOrderLines.uom, ordered: salesOrderLines.qty, code: items.code, hsn: items.hsn })
    .from(deliveryLines)
    .innerJoin(salesOrderLines, eq(salesOrderLines.id, deliveryLines.orderLineId))
    .leftJoin(items, eq(items.id, salesOrderLines.itemId))
    .where(eq(deliveryLines.deliveryId, delId))
    .orderBy(asc(salesOrderLines.sortOrder));
  const company = await getCompany(db);
  const { o, c } = row;

  const facts: [ReactNode, ReactNode][] = [
    ["Customer PO", <span key="po"><strong>{o.customerPoNumber || "-"}</strong>{o.customerPoDate ? ` dated ${fmtDate(o.customerPoDate)}` : ""}</span>],
    ["Our order", o.number],
  ];
  if (row.projectName) facts.push(["Project", row.projectName]);
  facts.push(["Vehicle no.", d.vehicleNo || "-"]);

  return (
    <DocumentSheet
      company={company}
      title="Delivery challan"
      numberLabel="Challan no."
      number={d.number}
      date={fmtDate(d.date)}
      party={{
        label: "Deliver to", name: c.name, address: row.siteAddress || c.address, city: c.city, gstin: c.gstin,
        extra: c.contactPerson ? [`Attn: ${c.contactPerson}${c.phone ? ` (${c.phone})` : ""}`] : undefined,
      }}
      facts={facts}
      toolbar={{ backHref: `/orders/${orderId}`, backLabel: `Back to ${o.number}`, printLabel: "Print challan" }}
    >
      <DocTable>
        <thead>
          <tr><th>#</th><th>Description</th><th>HSN</th><th className="num">Qty</th><th>UOM</th></tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id}>
              <td>{i + 1}</td>
              <td className="whitespace-normal">{l.description}{l.code && <span className="block text-[0.6875rem] text-[var(--doc-soft)]">{l.code}</span>}</td>
              <td>{l.hsn || "-"}</td>
              <td className="num font-medium">{qty(l.qty)}</td>
              <td>{l.uom}</td>
            </tr>
          ))}
        </tbody>
      </DocTable>

      <DocNotes>
        {d.notes && <p><strong>Notes:</strong> {d.notes}</p>}
        <p>Material sent for supply against the above purchase order. Not for sale. Please check the quantities and sign the duplicate copy.</p>
      </DocNotes>

      <DocSignature company={company.name} left={<>Received in good condition{d.receivedBy ? `: ${d.receivedBy}` : ""}<span className="block text-[0.6875rem] text-[var(--doc-soft)]">Name, signature and seal</span></>} />
    </DocumentSheet>
  );
}
