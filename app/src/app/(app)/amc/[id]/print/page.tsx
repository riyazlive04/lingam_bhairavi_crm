import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { amcContracts, amcVisits, customers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, money } from "@/lib/format";
import { getCompany } from "@/lib/billing";
import { BILLING_FREQUENCIES, COVERAGE, billingSchedule, systemLabel } from "@/lib/amc";
import { LinkButton } from "@/components/ui";
import { PrintButton } from "../../../orders/_components/print-button";
import { Letterhead, printCell as td } from "../../_components/letterhead";
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

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <LinkButton href={`/amc/${c.id}`} variant="ghost">Back to {c.number}</LinkButton>
        <PrintButton label="Print / Save PDF" />
      </div>
      {c.status === "cancelled" && <p className="mb-2 text-center text-lg font-bold uppercase text-red-600">Cancelled</p>}
      <article className="print-area mx-auto max-w-4xl rounded-xl border border-line bg-surface p-4 text-sm text-ink shadow-sm sm:p-8 print:max-w-none print:p-0">
        <Letterhead company={company} title="Annual Maintenance Contract">
          <p>Contract no: <strong>{c.number}</strong></p>
          <p>Date: {fmtDate(created)}</p>
          {c.renewalOf && <p className="text-ink-soft">Renewal contract</p>}
        </Letterhead>

        <section className="grid gap-4 border-b border-line py-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Customer</p>
            <p className="font-semibold">{cu.name}</p>
            <p className="whitespace-pre-line">{cu.address || ""}{cu.city ? `\n${cu.city}` : ""}{cu.state ? `, ${cu.state}` : ""}</p>
            {cu.gstin && <p>GSTIN: {cu.gstin}</p>}
            {cu.contactPerson && <p>Contact: {cu.contactPerson}{cu.phone ? `, ${cu.phone}` : ""}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Site</p>
            <p className="whitespace-pre-line">{c.siteAddress || "As per customer address"}</p>
          </div>
        </section>

        <section className="space-y-1 border-b border-line py-4">
          <p><strong>Contract period:</strong> {fmtDate(c.startDate)} to {fmtDate(c.endDate)}</p>
          <p><strong>Systems covered:</strong> {(c.systems ?? []).map(systemLabel).join(", ") || "-"}</p>
          <p><strong>Coverage:</strong> {COVERAGE[c.coverage as keyof typeof COVERAGE] ?? c.coverage}</p>
          <p><strong>Preventive maintenance visits:</strong> {c.visitsPerYear} per year ({planned.length} in this contract)</p>
          <p><strong>Breakdown response:</strong> an engineer will attend within {c.responseHours} hours of the call being logged.</p>
        </section>

        {c.scope && (
          <section className="border-b border-line py-4">
            <p className="mb-1 font-semibold">Scope of work</p>
            <p className="whitespace-pre-line">{c.scope}</p>
          </section>
        )}

        {planned.length > 0 && (
          <section className="border-b border-line py-4">
            <p className="mb-2 font-semibold">Visit schedule</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr className="bg-muted print:bg-transparent"><th className={`${td} text-left`}>Visit</th><th className={`${td} text-left`}>Planned month</th></tr></thead>
                <tbody>
                  {planned.map((v, i) => (
                    <tr key={v.id}><td className={td}>{i + 1}</td><td className={td}>{new Date(v.scheduledDate + "T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-xs text-ink-soft">Exact dates are confirmed with the site a few days before each visit.</p>
          </section>
        )}

        {showMoney && (
          <section className="border-b border-line py-4">
            <p className="mb-1 font-semibold">Commercials</p>
            <p>Contract value: <strong>{money(c.value)}</strong> plus GST as applicable.</p>
            <p>Billing: {BILLING_FREQUENCIES[c.billingFrequency as keyof typeof BILLING_FREQUENCIES] ?? c.billingFrequency}
              {periods.length > 1 ? `, ${periods.length} instalments of ${money(periods[0].amount)}` : ""}, in advance at the start of each period.</p>
          </section>
        )}

        <section className="py-4 text-xs text-ink-soft">
          <p className="mb-1 font-semibold text-ink">Terms</p>
          <ol className="list-decimal space-y-0.5 pl-5">
            <li>The customer will give our engineers safe access to the site and equipment during visits.</li>
            <li>{c.coverage === "comprehensive"
              ? "Spares needed for repairs are covered, except damage from misuse, accidents, fire, flood or alterations by others."
              : "Spares, consumables and refilling are not included and will be quoted separately for approval."}</li>
            <li>Breakdown calls are attended within the response time stated above. Calls outside the scope are charged at standard rates.</li>
            <li>A visit report is shared after every visit. Recommendations need the customer&apos;s approval before work starts.</li>
            <li>Either party may end this contract with 30 days&apos; written notice. Subject to Hosur jurisdiction.</li>
          </ol>
        </section>

        <footer className="mt-8 grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs">For {cu.name}</p>
            <div className="h-12" />
            <p className="border-t border-line pt-1">Authorised signatory</p>
          </div>
          <div className="text-right">
            <p className="text-xs">For {company.name}</p>
            <div className="h-12" />
            <p className="border-t border-line pt-1">Authorised signatory</p>
          </div>
        </footer>
      </article>
    </>
  );
}
