import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { amcContracts, amcVisits, customers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, money } from "@/lib/format";
import { getCompany } from "@/lib/billing";
import { BILLING_FREQUENCIES, COVERAGE, billingSchedule, systemLabel } from "@/lib/amc";
import { DocNotes, DocSignature, DocTable, DocumentSheet } from "@/components/patterns";
import { amcAccess } from "../../_lib/access";

export const metadata = { title: "AMC contract" };

export default async function ContractPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("amc");
  const { id } = await params;
  const cid = Number(id);
  if (!Number.isInteger(cid) || cid <= 0) notFound();
  const db = await getDb();
  const [row] = await db.select({ c: amcContracts, cu: customers }).from(amcContracts)
    .innerJoin(customers, eq(customers.id, amcContracts.customerId)).where(eq(amcContracts.id, cid)).limit(1);
  if (!row) notFound();
  const { c, cu } = row;
  const [visits, company] = await Promise.all([
    db.select({ id: amcVisits.id, scheduledDate: amcVisits.scheduledDate, status: amcVisits.status }).from(amcVisits)
      .where(eq(amcVisits.contractId, cid)).orderBy(asc(amcVisits.scheduledDate), asc(amcVisits.id)),
    getCompany(db),
  ]);
  const showMoney = amcAccess(user.role).money;
  const periods = billingSchedule(c.startDate, c.endDate, Number(c.value), c.billingFrequency);
  const planned = visits.filter((v) => v.status !== "cancelled");
  const created = c.createdAt instanceof Date ? c.createdAt.toISOString().slice(0, 10) : String(c.createdAt).slice(0, 10);

  const meta: [ReactNode, ReactNode][] = [["Period", `${fmtDate(c.startDate)} to ${fmtDate(c.endDate)}`]];
  if (c.renewalOf) meta.push(["Type", "Renewal contract"]);

  return (
    <DocumentSheet
      company={company}
      title="AMC contract"
      numberLabel="Contract no."
      number={c.number}
      date={fmtDate(created)}
      meta={meta}
      party={{
        label: "Customer", name: cu.name, address: cu.address, city: cu.city, state: cu.state, gstin: cu.gstin,
        extra: cu.contactPerson ? [`Contact ${cu.contactPerson}${cu.phone ? `, ${cu.phone}` : ""}`] : undefined,
      }}
      facts={[["Site", <span key="s" className="whitespace-pre-line">{c.siteAddress || "As per customer address"}</span>]]}
      watermark={c.status === "cancelled" ? "Cancelled" : undefined}
      toolbar={{ backHref: `/amc/${c.id}`, backLabel: `Back to ${c.number}` }}
    >
      <DocTable>
        <tbody>
          <tr><th className="w-56">Systems covered</th><td className="whitespace-normal">{(c.systems ?? []).map(systemLabel).join(", ") || "-"}</td></tr>
          <tr><th>Coverage</th><td className="whitespace-normal">{COVERAGE[c.coverage as keyof typeof COVERAGE] ?? c.coverage}</td></tr>
          <tr><th>Preventive maintenance visits</th><td className="whitespace-normal">{c.visitsPerYear} per year ({planned.length} in this contract)</td></tr>
          <tr><th>Breakdown response</th><td className="whitespace-normal">An engineer will attend within {c.responseHours} hours of the call being logged.</td></tr>
          {showMoney && (
            <tr>
              <th>Commercials</th>
              <td className="whitespace-normal">
                Contract value <strong>{money(c.value)}</strong> plus GST as applicable.{" "}
                Billing {(BILLING_FREQUENCIES[c.billingFrequency as keyof typeof BILLING_FREQUENCIES] ?? c.billingFrequency).toLowerCase()}
                {periods.length > 1 ? `, ${periods.length} instalments of ${money(periods[0].amount)}` : ""}, in advance at the start of each period.
              </td>
            </tr>
          )}
        </tbody>
      </DocTable>

      {c.scope && (
        <DocNotes title="Scope of work">
          <p className="whitespace-pre-line text-[var(--doc-ink)]">{c.scope}</p>
        </DocNotes>
      )}

      {planned.length > 0 && (
        <section className="space-y-1">
          <p className="font-semibold">Visit schedule</p>
          <DocTable>
            <thead><tr><th className="w-16">Visit</th><th>Planned month</th></tr></thead>
            <tbody>
              {planned.map((v, i) => (
                <tr key={v.id}><td>{i + 1}</td><td>{new Date(v.scheduledDate + "T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</td></tr>
              ))}
            </tbody>
          </DocTable>
          <p className="text-[0.75rem] text-[var(--doc-soft)]">Exact dates are confirmed with the site a few days before each visit.</p>
        </section>
      )}

      <DocNotes title="Terms">
        <ol className="list-decimal space-y-0.5 pl-5">
          <li>The customer will give our engineers safe access to the site and equipment during visits.</li>
          <li>{c.coverage === "comprehensive"
            ? "Spares needed for repairs are covered, except damage from misuse, accidents, fire, flood or alterations by others."
            : "Spares, consumables and refilling are not included and will be quoted separately for approval."}</li>
          <li>Breakdown calls are attended within the response time stated above. Calls outside the scope are charged at standard rates.</li>
          <li>A visit report is shared after every visit. Recommendations need the customer&apos;s approval before work starts.</li>
          <li>Either party may end this contract with 30 days&apos; written notice. Subject to Hosur jurisdiction.</li>
        </ol>
      </DocNotes>

      <DocSignature company={company.name} left={<>For <strong>{cu.name}</strong> (authorised signatory)</>} />
    </DocumentSheet>
  );
}
