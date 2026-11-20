import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, deliveries, deliveryLines, items, projects, salesOrderLines, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, qty } from "@/lib/format";
import { getCompany } from "@/lib/billing";
import { LinkButton } from "@/components/ui";
import { PrintButton } from "../../../_components/print-button";

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

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <LinkButton href={`/orders/${orderId}`} variant="ghost">← Back to {o.number}</LinkButton>
        <PrintButton label="Print challan" />
      </div>
      <article className="print-area mx-auto max-w-3xl rounded-xl border border-line bg-surface p-4 text-ink shadow-sm sm:p-8 print:max-w-none print:p-0">
        <header className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-brand-700 print:text-black">{company.name}</h1>
            <p className="whitespace-pre-line text-sm text-ink-soft">{company.address}</p>
            <p className="text-sm text-ink-soft">
              {company.gstin && <>GSTIN: {company.gstin} · </>}{company.phone && <>Ph: {company.phone} · </>}{company.email}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-lg font-semibold uppercase tracking-wide">Delivery Challan</p>
            <p className="text-sm">No: <strong>{d.number}</strong></p>
            <p className="text-sm">Date: {fmtDate(d.date)}</p>
          </div>
        </header>

        <section className="grid gap-4 border-b border-line py-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Deliver to</p>
            <p className="font-semibold">{c.name}</p>
            {c.contactPerson && <p>Attn: {c.contactPerson}{c.phone ? ` (${c.phone})` : ""}</p>}
            <p className="whitespace-pre-line">{row.siteAddress || c.address || ""}{c.city ? `\n${c.city}` : ""}</p>
            {c.gstin && <p>GSTIN: {c.gstin}</p>}
          </div>
          <div className="space-y-0.5 sm:text-right">
            <p>Customer PO: <strong>{o.customerPoNumber || "—"}</strong>{o.customerPoDate ? ` dt ${fmtDate(o.customerPoDate)}` : ""}</p>
            <p>Our order: {o.number}</p>
            {row.projectName && <p>Project: {row.projectName}</p>}
            <p>Vehicle no: {d.vehicleNo || "—"}</p>
          </div>
        </section>

        <div className="overflow-x-auto py-4">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="bg-muted print:bg-transparent">
                <th className="border border-line px-2 py-1.5 text-left">S.No</th>
                <th className="border border-line px-2 py-1.5 text-left">Description</th>
                <th className="border border-line px-2 py-1.5 text-left">HSN</th>
                <th className="border border-line px-2 py-1.5 text-right">Qty</th>
                <th className="border border-line px-2 py-1.5 text-left">UOM</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id}>
                  <td className="border border-line px-2 py-1.5">{i + 1}</td>
                  <td className="border border-line px-2 py-1.5 whitespace-normal">{l.description}{l.code && <span className="block text-xs text-ink-soft">{l.code}</span>}</td>
                  <td className="border border-line px-2 py-1.5">{l.hsn || "—"}</td>
                  <td className="border border-line px-2 py-1.5 text-right font-medium tabular-nums">{qty(l.qty)}</td>
                  <td className="border border-line px-2 py-1.5">{l.uom}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.notes && <p className="mt-3 text-sm"><strong>Notes:</strong> {d.notes}</p>}
          <p className="mt-3 text-xs text-ink-soft">Material sent for supply against the above purchase order. Not for sale. Kindly verify quantities and sign the duplicate copy.</p>
        </div>

        <footer className="grid grid-cols-2 gap-6 pt-10 text-sm">
          <div>
            <div className="h-12" />
            <p className="border-t border-line pt-1">Received in good condition{d.receivedBy ? ` — ${d.receivedBy}` : ""}</p>
            <p className="text-xs text-ink-soft">Name, signature & seal</p>
          </div>
          <div className="text-right">
            <p className="text-xs">For {company.name}</p>
            <div className="h-10" />
            <p className="border-t border-line pt-1">Authorised signatory</p>
          </div>
        </footer>
      </article>
    </>
  );
}
