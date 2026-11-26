import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { items, projects, purchaseOrderLines, purchaseOrders, salesOrders, users, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, money, pct, qty } from "@/lib/format";
import { DEFAULT_PO_TERMS } from "@/lib/purchase-orders";
import { getCompanySettings, numberToIndianWords } from "@/lib/quotations";
import { LinkButton } from "@/components/ui";
import { PrintButton } from "../../../quotations/_components/print-button";

export const metadata = { title: "Print purchase order" };

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
    getCompanySettings(db),
  ]);
  const terms = (po.terms || DEFAULT_PO_TERMS).split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
  const cell = "border border-[#999] px-1.5 py-1 align-top";
  const head = "border border-[#999] bg-[#f0f0f0] px-1.5 py-1 text-[10px] font-semibold uppercase";
  const deliverTo = row.siteAddress ? `${row.projectName ?? "Site"}: ${row.siteAddress}` : `${company.name}, ${company.address}`;

  return (
    <div>
      <style>{`@media print { @page { size: A4; margin: 12mm; } body aside, body header.no-print { display: none !important; } main { max-width: none !important; padding: 0 !important; } .lg\\:pl-60 { padding-left: 0 !important; } }`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <LinkButton href={`/purchase-orders/${id}`} variant="secondary">← Back to PO</LinkButton>
        <PrintButton />
      </div>

      {/* A4 sheet: always light (paper) regardless of app theme */}
      <article className="print-area mx-auto max-w-[210mm] rounded-xl border border-line bg-[#fff] p-6 text-[12px] leading-snug text-[#111] shadow-sm sm:p-8 print:max-w-none print:p-0">
        <div className="flex flex-col gap-3 border-b-2 border-[#b91c1c] pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xl font-bold tracking-tight text-[#b91c1c]">{company.name}</div>
            <div className="text-[11px] text-[#444]">{company.tagline}</div>
            <div className="mt-1 whitespace-pre-line text-[11px] text-[#333]">{company.address}</div>
          </div>
          <div className="text-[11px] text-[#333] sm:text-right">
            {company.phone && <div>Ph: {company.phone}</div>}
            {company.email && <div>{company.email}</div>}
            {company.website && <div>{company.website}</div>}
            {company.gstin && <div>GSTIN: {company.gstin}</div>}
          </div>
        </div>

        <h1 className="my-3 text-center text-base font-bold uppercase tracking-wide">Purchase Order{po.status === "draft" ? " (draft)" : po.status === "cancelled" ? " (cancelled)" : ""}</h1>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded border border-[#ccc] p-2">
            <div className="text-[10px] font-semibold uppercase text-[#666]">To (vendor)</div>
            <div className="font-semibold">{vendor?.name ?? "-"}</div>
            {vendor?.contactPerson && <div>Kind attn: {vendor.contactPerson}</div>}
            {vendor?.address && <div className="whitespace-pre-line">{vendor.address}</div>}
            {vendor?.city && <div>{vendor.city}</div>}
            {vendor?.phone && <div>Ph: {vendor.phone}</div>}
            {vendor?.gstin && <div>GSTIN: {vendor.gstin}</div>}
          </div>
          <table className="w-full self-start text-[11px]">
            <tbody>
              {([
                ["PO No.", po.number],
                ["PO date", fmtDate(po.poDate)],
                ["Delivery by", fmtDate(po.expectedDate)],
                ["Our reference", row.soNumber ?? "-"],
                ["Deliver to", deliverTo],
              ] as const).map(([k, v]) => (
                <tr key={k}>
                  <td className="w-28 border border-[#ccc] bg-[#f5f5f5] px-2 py-0.5 font-semibold">{k}</td>
                  <td className="whitespace-pre-line border border-[#ccc] px-2 py-0.5">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mb-3">Dear Sir/Madam,<br />Please supply the following material as per the terms below:</p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className={`${head} w-8 text-left`}>#</th>
                <th className={`${head} text-left`}>Description</th>
                <th className={`${head} w-16 text-left`}>HSN</th>
                <th className={`${head} w-14 text-right`}>Qty</th>
                <th className={`${head} w-12 text-left`}>UOM</th>
                <th className={`${head} w-20 text-right`}>Rate</th>
                <th className={`${head} w-12 text-right`}>GST</th>
                <th className={`${head} w-24 text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ l, code, name, size, make, uom, hsn }, i) => (
                <tr key={l.id} className="break-inside-avoid">
                  <td className={cell}>{i + 1}</td>
                  <td className={cell}>
                    <div className="font-medium">{name}</div>
                    <div className="text-[10px] text-[#555]">{[code, size, make ? `Make: ${make}` : null].filter(Boolean).join(" · ")}</div>
                    {l.description && <div className="text-[10px]">{l.description}</div>}
                  </td>
                  <td className={cell}>{hsn ?? ""}</td>
                  <td className={`${cell} text-right tabular-nums`}>{qty(l.qty)}</td>
                  <td className={cell}>{uom}</td>
                  <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>{money(l.rate)}</td>
                  <td className={`${cell} text-right`}>{pct(l.gstRate, 0)}</td>
                  <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>{money(l.amount)}</td>
                </tr>
              ))}
              <tr><td colSpan={7} className={`${cell} text-right`}>Subtotal</td><td className={`${cell} text-right tabular-nums`}>{money(po.subtotal)}</td></tr>
              <tr><td colSpan={7} className={`${cell} text-right`}>GST</td><td className={`${cell} text-right tabular-nums`}>{money(po.taxAmount)}</td></tr>
              <tr className="font-semibold"><td colSpan={7} className={`${cell} text-right`}>Total</td><td className={`${cell} whitespace-nowrap text-right tabular-nums`}>{money(po.total)}</td></tr>
              <tr><td colSpan={8} className={`${cell} italic`}>Amount in words: {numberToIndianWords(po.total)}</td></tr>
            </tbody>
          </table>
        </div>

        {terms.length > 0 && (
          <section className="mt-4 break-inside-avoid">
            <h2 className="mb-1 text-[12px] font-bold uppercase">Terms &amp; Conditions</h2>
            <ol className="list-decimal space-y-0.5 pl-5">
              {terms.map((t, i) => <li key={i}>{t.replace(/^\d+[.)]\s*/, "")}</li>)}
            </ol>
          </section>
        )}

        <footer className="mt-8 flex items-end justify-between break-inside-avoid">
          <div className="text-[11px] text-[#444]">
            {row.raisedBy && <>Raised by: {row.raisedBy}{row.raisedPhone ? ` · ${row.raisedPhone}` : ""}</>}
          </div>
          <div className="text-right">
            <div>For <span className="font-semibold">{company.name}</span></div>
            <div className="mt-10 border-t border-[#999] pt-1 text-[11px]">Authorised Signatory</div>
          </div>
        </footer>
      </article>
    </div>
  );
}
