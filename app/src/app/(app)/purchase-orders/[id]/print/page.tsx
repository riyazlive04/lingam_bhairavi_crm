import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { items, projects, purchaseOrderLines, purchaseOrders, salesOrders, users, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, money, pct, qty, round2 } from "@/lib/format";
import { DEFAULT_PO_TERMS } from "@/lib/purchase-orders";
import { amountInWords, getCompany } from "@/lib/billing";
import { gstSummary, isIntraState } from "@/lib/returns";
import { DocNotes, DocSignature, DocTable, DocTotals, DocumentSheet, GstSummaryTable } from "@/components/patterns";

export const metadata = { title: "Purchase order" };

export default async function PrintPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("purchaseOrders");
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await getDb();
  const [row] = await db.select({ po: purchaseOrders, vendor: vendors, soNumber: salesOrders.number, projectName: projects.name, siteAddress: projects.siteAddress, raisedBy: users.name, raisedPhone: users.phone })
    .from(purchaseOrders)
    .leftJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .leftJoin(salesOrders, eq(salesOrders.id, purchaseOrders.salesOrderId))
    .leftJoin(projects, eq(projects.id, purchaseOrders.projectId))
    .leftJoin(users, eq(users.id, purchaseOrders.createdBy))
    .where(eq(purchaseOrders.id, id));
  if (!row) notFound();
  const { po, vendor } = row;
  const [lines, company] = await Promise.all([
    db.select({ l: purchaseOrderLines, code: items.code, name: items.name, size: items.size, make: items.make, uom: items.uom, hsn: items.hsn })
      .from(purchaseOrderLines).innerJoin(items, eq(items.id, purchaseOrderLines.itemId))
      .where(eq(purchaseOrderLines.poId, id)).orderBy(asc(purchaseOrderLines.sortOrder), asc(purchaseOrderLines.id)),
    getCompany(db),
  ]);
  const terms = (po.terms || DEFAULT_PO_TERMS).split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
  const deliverTo = row.siteAddress ? `${row.projectName ?? "Site"}: ${row.siteAddress}` : `${company.name}, ${company.address}`;
  const intra = isIntraState(company, { gstin: vendor?.gstin });
  const summary = gstSummary(lines.map(({ l }) => ({ amount: Number(l.amount), gstRate: Number(l.gstRate) })), intra);
  const taxAmount = Number(po.taxAmount);
  const cgst = round2(summary.reduce((s, x) => s + x.cgst, 0));

  return (
    <DocumentSheet
      company={company}
      title="Purchase order"
      numberLabel="PO no."
      number={po.number}
      date={fmtDate(po.poDate)}
      meta={[["Delivery by", fmtDate(po.expectedDate)], ...(row.soNumber ? [["Our reference", row.soNumber] as [string, string]] : [])]}
      party={{
        label: "To (vendor)", name: vendor?.name ?? "-", address: vendor?.address, city: vendor?.city, gstin: vendor?.gstin,
        extra: [vendor?.contactPerson && `Kind attn: ${vendor.contactPerson}`, vendor?.phone && `Phone ${vendor.phone}`].filter(Boolean),
      }}
      facts={[["Deliver to", <span key="d" className="whitespace-pre-line">{deliverTo}</span>], ["Tax", intra ? "CGST + SGST" : "IGST"]]}
      watermark={po.status === "cancelled" ? "Cancelled" : po.status === "draft" ? "Draft" : undefined}
      toolbar={{ backHref: `/purchase-orders/${id}`, backLabel: `Back to ${po.number}` }}
    >
      <p>Dear Sir or Madam, please supply the following material as per the terms below.</p>

      <DocTable>
        <thead>
          <tr>
            <th>#</th><th>Description</th><th>HSN</th><th className="num">Qty</th><th>UOM</th><th className="num">Rate</th><th className="num">GST</th><th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(({ l, code, name, size, make, uom, hsn }, i) => (
            <tr key={l.id}>
              <td>{i + 1}</td>
              <td className="whitespace-normal">
                <div className="font-medium">{name}</div>
                <div className="text-[0.6875rem] text-[var(--doc-soft)]">{[code, size, make ? `Make: ${make}` : null].filter(Boolean).join(" · ")}</div>
                {l.description && <div className="text-[0.6875rem]">{l.description}</div>}
              </td>
              <td>{hsn ?? ""}</td>
              <td className="num">{qty(l.qty)}</td>
              <td>{uom}</td>
              <td className="num">{money(l.rate)}</td>
              <td className="num">{pct(l.gstRate, 0)}</td>
              <td className="num">{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </DocTable>

      <section className="grid gap-4 sm:grid-cols-2">
        <GstSummaryTable intra={intra} rows={summary} />
        <DocTotals
          taxable={Number(po.subtotal)}
          {...(intra ? { cgst, sgst: round2(taxAmount - cgst) } : { igst: taxAmount })}
          total={Number(po.total)}
          totalLabel="PO total"
          words={amountInWords(Number(po.total))}
        />
      </section>

      {terms.length > 0 && (
        <DocNotes title="Terms and conditions">
          <ol className="list-decimal space-y-0.5 pl-5">
            {terms.map((t, i) => <li key={i}>{t.replace(/^\d+[.)]\s*/, "")}</li>)}
          </ol>
        </DocNotes>
      )}

      {row.raisedBy && <DocNotes><p>Raised by {row.raisedBy}{row.raisedPhone ? ` · ${row.raisedPhone}` : ""}</p></DocNotes>}

      <DocSignature company={company.name} />
    </DocumentSheet>
  );
}
