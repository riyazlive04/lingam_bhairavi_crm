import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { FileSpreadsheet } from "lucide-react";
import { getDb } from "@/db";
import { customers, quotationLines, quotations, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { SYSTEMS, type SystemKey } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { computeQuoteTotals } from "@/lib/pricing";
import { getCompanySettings } from "@/lib/quotations";
import { buttonClass } from "@/components/ui";
import { DocNotes, DocSignature, DocumentSheet } from "@/components/patterns";
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

  const meta: [ReactNode, ReactNode][] = [["Valid until", fmtDate(q.validUntil)]];
  if (q.projectName) meta.push(["Project", q.projectName]);
  if (q.siteLocation) meta.push(["Site", q.siteLocation]);
  if (q.system) meta.push(["System", SYSTEMS[q.system as SystemKey] ?? q.system]);
  const extra: ReactNode[] = [];
  if (cust?.contactPerson) extra.push(`Kind attention: ${cust.contactPerson}`);
  if (cust?.phone) extra.push(`Phone ${cust.phone}`);

  return (
    <DocumentSheet
      company={{
        name: company.name,
        // The quotation letterhead carries the tagline and website as well.
        tagline: company.tagline,
        address: company.address,
        gstin: company.gstin,
        phone: company.phone,
        email: company.email,
        website: company.website,
      }}
      title="Quotation"
      numberLabel="Quotation no."
      number={q.number}
      date={fmtDate(q.quoteDate)}
      meta={meta}
      party={{ label: "To", name: cust?.name ?? "-", address: cust?.address, city: cust?.city, state: cust?.state, gstin: cust?.gstin, extra }}
      toolbar={{
        backHref: `/quotations/${id}`,
        backLabel: `Back to ${q.number}`,
        actions: (
          <a href={`/quotations/${id}/export`} className={buttonClass("secondary")} download>
            <FileSpreadsheet className="icon-sm" aria-hidden /> Download Excel
          </a>
        ),
      }}
    >
      <p>Dear Sir or Madam,<br />With reference to your enquiry, we are pleased to submit our offer for the following scope of work.</p>

      <QuoteLinesTable lines={lines} totals={totals} discountPct={q.discountPct} gstPct={q.gstPct} print />

      {terms.length > 0 && (
        <DocNotes title="Terms and conditions">
          <ol className="list-decimal space-y-0.5 pl-5">
            {terms.map((t, i) => <li key={i}>{t.replace(/^\d+[.)]\s*/, "")}</li>)}
          </ol>
        </DocNotes>
      )}
      {company.bankDetails && (
        <DocNotes title="Bank details">
          <p className="whitespace-pre-line">{company.bankDetails}</p>
        </DocNotes>
      )}
      {preparer && (
        <DocNotes>
          <p>Prepared by {preparer.name}{preparer.phone ? ` · ${preparer.phone}` : ""}{preparer.email ? ` · ${preparer.email}` : ""}</p>
        </DocNotes>
      )}

      <DocSignature company={company.name} />
    </DocumentSheet>
  );
}
