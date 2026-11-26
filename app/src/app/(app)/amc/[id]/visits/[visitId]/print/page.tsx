import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { amcContracts, amcVisits, customers, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { getCompany } from "@/lib/billing";
import { checklistStats, systemLabel, type ChecklistResult } from "@/lib/amc";
import { Callout, DocNotes, DocSignature, DocTable, DocumentSheet } from "@/components/patterns";

export const metadata = { title: "Visit report" };

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

  const facts: [string, string][] = [
    ["Systems", (c.systems ?? []).map(systemLabel).join(", ") || "-"],
    ["Engineer", `${row.engineerName ?? "-"}${row.engineerPhone ? `, ${row.engineerPhone}` : ""}`],
  ];
  if (stats.total > 0) facts.push(["Result", `${stats.ok} of ${stats.total} checks OK${stats.notOk ? `, ${stats.notOk} need attention` : ""}`]);

  return (
    <>
      {v.status !== "done" && (
        <div className="no-print mx-auto mb-4 max-w-[210mm]">
          <Callout tone="warning" title="This visit has not been recorded yet">The report below is blank. Record the visit first to fill it in.</Callout>
        </div>
      )}
      <DocumentSheet
        company={company}
        title="Visit report"
        numberLabel="Contract no."
        number={c.number}
        date={fmtDate(v.doneDate ?? v.scheduledDate)}
        meta={[["Visit", `${n} of ${siblings.length}`]]}
        party={{ label: "Customer", name: cu.name, address: c.siteAddress || cu.address, gstin: cu.gstin }}
        facts={facts}
        toolbar={{ backHref: `/amc/${c.id}/visits/${v.id}`, backLabel: "Back to visit" }}
      >
        {groups.length > 0 ? groups.map(([section, items]) => (
          <section key={section} className="space-y-1">
            <p className="font-semibold">{section}</p>
            <DocTable>
              <thead>
                <tr><th className="w-8">#</th><th>Check</th><th className="w-20">Result</th><th>Remark</th></tr>
              </thead>
              <tbody>
                {items.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className="whitespace-normal">{r.item}</td>
                    <td className="font-semibold">{r.ok ? "OK" : "Not OK"}</td>
                    <td className="whitespace-normal">{r.remark || ""}</td>
                  </tr>
                ))}
              </tbody>
            </DocTable>
          </section>
        )) : <p className="text-[var(--doc-soft)]">No checklist recorded.</p>}

        <DocNotes title="Findings">
          <p className="whitespace-pre-line text-[var(--doc-ink)]">{v.findings || "-"}</p>
        </DocNotes>
        <DocNotes title="Recommendations">
          <p className="whitespace-pre-line text-[var(--doc-ink)]">{v.recommendations || "-"}</p>
        </DocNotes>

        <DocSignature company={company.name} rightLabel={row.engineerName ?? "Service engineer"}
          left={<>Customer sign-off: {v.customerSignoff || "name and signature"}</>} />
      </DocumentSheet>
    </>
  );
}
