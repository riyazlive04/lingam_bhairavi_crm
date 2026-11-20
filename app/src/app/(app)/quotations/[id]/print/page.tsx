import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, quotationLines, quotations, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { SYSTEMS, type SystemKey } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { computeQuoteTotals } from "@/lib/pricing";
import { getCompanySettings } from "@/lib/quotations";
import { LinkButton } from "@/components/ui";
import { PrintButton } from "../../_components/print-button";
import { QuoteLinesTable } from "../../_components/lines-table";

export const metadata = { title: "Print quotation" };

export default async function PrintQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("quotations");
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await getDb();
  const [q] = await db.select().from(quotations).where(eq(quotations.id, id));
  if (!q) notFound();
  const [[cust], lines, company, [preparer]] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, q.customerId)),
    db.select().from(quotationLines).where(eq(quotationLines.quotationId, id)).orderBy(asc(quotationLines.sortOrder), asc(quotationLines.id)),
    getCompanySettings(db),
    q.preparedBy ? db.select({ name: users.name, phone: users.phone, email: users.email }).from(users).where(eq(users.id, q.preparedBy)) : Promise.resolve([]),
  ]);
  const totals = computeQuoteTotals(lines, q.discountPct, q.gstPct);
  const terms = (q.terms || company.quoteTerms).split(/\r?\n/).map((t) => t.trim()).filter(Boolean);

  return (
    <div>
      <style>{`@media print { @page { size: A4; margin: 12mm; } body aside, body header.no-print { display: none !important; } main { max-width: none !important; padding: 0 !important; } .lg\\:pl-60 { padding-left: 0 !important; } }`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <LinkButton href={`/quotations/${id}`} variant="secondary">← Back to quotation</LinkButton>
        <div className="flex gap-2">
          <a href={`/quotations/${id}/export`} className="text-sm text-brand-700 hover:underline self-center" download>Download Excel</a>
          <PrintButton />
        </div>
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

        <h1 className="my-3 text-center text-base font-bold uppercase tracking-wide">Quotation</h1>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded border border-[#ccc] p-2">
            <div className="text-[10px] font-semibold uppercase text-[#666]">To</div>
            <div className="font-semibold">{cust?.name ?? "—"}</div>
            {cust?.contactPerson && <div>Kind attn: {cust.contactPerson}</div>}
            {cust?.address && <div className="whitespace-pre-line">{cust.address}</div>}
            {(cust?.city || cust?.state) && <div>{[cust?.city, cust?.state].filter(Boolean).join(", ")}</div>}
            {cust?.phone && <div>Ph: {cust.phone}</div>}
            {cust?.gstin && <div>GSTIN: {cust.gstin}</div>}
          </div>
          <table className="w-full self-start text-[11px]">
            <tbody>
              {([
                ["Quotation No.", q.number],
                ["Date", fmtDate(q.quoteDate)],
                ["Valid until", fmtDate(q.validUntil)],
                ["Project", q.projectName || "—"],
                ["Site", q.siteLocation || "—"],
                ["System", q.system ? SYSTEMS[q.system as SystemKey] ?? q.system : "—"],
              ] as const).map(([k, v]) => (
                <tr key={k}>
                  <td className="w-28 border border-[#ccc] bg-[#f5f5f5] px-2 py-0.5 font-semibold">{k}</td>
                  <td className="border border-[#ccc] px-2 py-0.5">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mb-3">Dear Sir/Madam,<br />With reference to your enquiry, we are pleased to submit our offer for the following scope of work:</p>

        <div className="overflow-x-auto">
          <QuoteLinesTable lines={lines} totals={totals} discountPct={q.discountPct} gstPct={q.gstPct} print />
        </div>

        {terms.length > 0 && (
          <section className="mt-4 break-inside-avoid">
            <h2 className="mb-1 text-[12px] font-bold uppercase">Terms &amp; Conditions</h2>
            <ol className="list-decimal space-y-0.5 pl-5">
              {terms.map((t, i) => <li key={i}>{t.replace(/^\d+[.)]\s*/, "")}</li>)}
            </ol>
          </section>
        )}
        {company.bankDetails && (
          <section className="mt-3 break-inside-avoid">
            <h2 className="mb-1 text-[12px] font-bold uppercase">Bank details</h2>
            <p className="whitespace-pre-line">{company.bankDetails}</p>
          </section>
        )}

        <footer className="mt-8 flex items-end justify-between break-inside-avoid">
          <div className="text-[11px] text-[#444]">
            {preparer && <>Prepared by: {preparer.name}{preparer.phone ? ` · ${preparer.phone}` : ""}</>}
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
