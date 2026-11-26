import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { amcContracts, amcVisits, customers, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { getCompany } from "@/lib/billing";
import { checklistStats, systemLabel, type ChecklistResult } from "@/lib/amc";
import { LinkButton } from "@/components/ui";
import { PrintButton } from "../../../../../orders/_components/print-button";
import { Letterhead, printCell as td } from "../../../../_components/letterhead";

export const metadata = { title: "AMC visit report" };

/** Group "Section: item" results by section for the printed table. */
function groupResults(list: ChecklistResult[]) {
  const out = new Map<string, { item: string; ok: boolean; remark?: string }[]>();
  for (const r of list) {
    const at = r.item.indexOf(": ");
    const section = at > 0 ? r.item.slice(0, at) : "Checks";
    const item = at > 0 ? r.item.slice(at + 2) : r.item;
    out.set(section, [...(out.get(section) ?? []), { item, ok: r.ok, remark: r.remark }]);
  }
  return [...out.entries()];
}

export default async function VisitReportPrintPage({ params }: { params: Promise<{ id: string; visitId: string }> }) {
  await requireUser("amc");
  const { id, visitId } = await params;
  const cid = Number(id), vid = Number(visitId);
  if (!Number.isInteger(cid) || cid <= 0 || !Number.isInteger(vid) || vid <= 0) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ v: amcVisits, c: amcContracts, cu: customers, engineerName: users.name, engineerPhone: users.phone })
    .from(amcVisits)
    .innerJoin(amcContracts, eq(amcContracts.id, amcVisits.contractId))
    .innerJoin(customers, eq(customers.id, amcContracts.customerId))
    .leftJoin(users, eq(users.id, amcVisits.engineerId))
    .where(and(eq(amcVisits.id, vid), eq(amcVisits.contractId, cid)))
    .limit(1);
  if (!row) notFound();
  const { v, c, cu } = row;
  const [siblings, company] = await Promise.all([
    db.select({ id: amcVisits.id }).from(amcVisits).where(eq(amcVisits.contractId, cid)).orderBy(asc(amcVisits.scheduledDate), asc(amcVisits.id)),
    getCompany(db),
  ]);
  const n = siblings.findIndex((s) => s.id === v.id) + 1;
  const stats = checklistStats(v.checklist ?? []);
  const groups = groupResults(v.checklist ?? []);

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <LinkButton href={`/amc/${c.id}/visits/${v.id}`} variant="ghost">Back to visit</LinkButton>
        <PrintButton label="Print / Save PDF" />
      </div>
      {v.status !== "done" && <p className="no-print mb-2 text-center text-sm font-semibold text-amber-700">This visit has not been recorded yet. The report below is blank.</p>}
      <article className="print-area mx-auto max-w-4xl rounded-xl border border-line bg-surface p-4 text-sm text-ink shadow-sm sm:p-8 print:max-w-none print:p-0">
        <Letterhead company={company} title="Maintenance Visit Report">
          <p>Contract: <strong>{c.number}</strong></p>
          <p>Visit {n} of {siblings.length}</p>
          <p>Date: {fmtDate(v.doneDate ?? v.scheduledDate)}</p>
        </Letterhead>

        <section className="grid gap-4 border-b border-line py-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Customer</p>
            <p className="font-semibold">{cu.name}</p>
            <p className="whitespace-pre-line">{c.siteAddress || cu.address || ""}</p>
          </div>
          <div className="space-y-0.5">
            <p><strong>Systems:</strong> {(c.systems ?? []).map(systemLabel).join(", ") || "-"}</p>
            <p><strong>Engineer:</strong> {row.engineerName ?? "-"}{row.engineerPhone ? `, ${row.engineerPhone}` : ""}</p>
            {stats.total > 0 && <p><strong>Result:</strong> {stats.ok} of {stats.total} checks OK{stats.notOk ? `, ${stats.notOk} need attention` : ""}</p>}
          </div>
        </section>

        {groups.length > 0 ? groups.map(([section, items]) => (
          <section key={section} className="py-3">
            <p className="mb-1 font-semibold">{section}</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr className="bg-muted print:bg-transparent">
                  <th className={`${td} w-8 text-left`}>#</th><th className={`${td} text-left`}>Check</th><th className={`${td} w-20 text-left`}>Result</th><th className={`${td} text-left`}>Remark</th>
                </tr></thead>
                <tbody>
                  {items.map((r, i) => (
                    <tr key={i}>
                      <td className={td}>{i + 1}</td>
                      <td className={`${td} whitespace-normal`}>{r.item}</td>
                      <td className={`${td} font-semibold ${r.ok ? "text-emerald-700" : "text-red-600"} print:text-black`}>{r.ok ? "OK" : "Not OK"}</td>
                      <td className={`${td} whitespace-normal`}>{r.remark || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )) : <p className="py-4 text-ink-soft">No checklist recorded.</p>}

        <section className="space-y-3 border-t border-line py-4">
          <div><p className="font-semibold">Findings</p><p className="whitespace-pre-line">{v.findings || "-"}</p></div>
          <div><p className="font-semibold">Recommendations</p><p className="whitespace-pre-line">{v.recommendations || "-"}</p></div>
        </section>

        <footer className="mt-8 grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs">Customer sign-off</p>
            <div className="h-12" />
            <p className="border-t border-line pt-1">{v.customerSignoff || "Name and signature"}</p>
          </div>
          <div className="text-right">
            <p className="text-xs">For {company.name}</p>
            <div className="h-12" />
            <p className="border-t border-line pt-1">{row.engineerName ?? "Service engineer"}</p>
          </div>
        </footer>
      </article>
    </>
  );
}
