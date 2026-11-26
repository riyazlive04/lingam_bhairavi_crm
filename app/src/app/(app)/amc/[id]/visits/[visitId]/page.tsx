import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { Printer } from "lucide-react";
import { getDb } from "@/db";
import { amcContracts, amcVisits, customers, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { addDays, fmtDate, todayIST } from "@/lib/format";
import { checklistSectionsFor, checklistStats, effectiveAmcStatus } from "@/lib/amc";
import { Badge, Card, DL, Field, Flash, Input, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { AmcStatusBadge, SystemChips } from "../../../_components/system-chips";
import { VisitForm } from "../../../_components/visit-form";
import { amcAccess } from "../../../_lib/access";
import { assignVisitEngineer, markVisitMissed, rescheduleVisit } from "../../../actions";

export const metadata = { title: "AMC visit" };

export default async function VisitPage({ params, searchParams }: { params: Promise<{ id: string; visitId: string }>; searchParams: Promise<{ ok?: string; err?: string; edit?: string }> }) {
  const user = await requireUser("amc");
  const { id, visitId } = await params;
  const sp = await searchParams;
  const cid = Number(id), vid = Number(visitId);
  if (!Number.isInteger(cid) || cid <= 0 || !Number.isInteger(vid) || vid <= 0) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ v: amcVisits, c: amcContracts, customerName: customers.name, customerPhone: customers.phone, engineerName: users.name })
    .from(amcVisits)
    .innerJoin(amcContracts, eq(amcContracts.id, amcVisits.contractId))
    .innerJoin(customers, eq(customers.id, amcContracts.customerId))
    .leftJoin(users, eq(users.id, amcVisits.engineerId))
    .where(and(eq(amcVisits.id, vid), eq(amcVisits.contractId, cid)))
    .limit(1);
  if (!row) notFound();
  const { v, c } = row;
  const today = todayIST();
  const acc = amcAccess(user.role);
  const [siblings, engineerList] = await Promise.all([
    db.select({ id: amcVisits.id }).from(amcVisits).where(eq(amcVisits.contractId, cid)).orderBy(asc(amcVisits.scheduledDate), asc(amcVisits.id)),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.role, "engineer"), eq(users.active, true))).orderBy(asc(users.name)),
  ]);
  const n = siblings.findIndex((s) => s.id === v.id) + 1;
  const contractStatus = effectiveAmcStatus(c.status, c.endDate, today);
  const contractOpen = contractStatus !== "cancelled";
  const canRecord = acc.write && contractOpen && v.status !== "cancelled";
  const showForm = canRecord && (v.status !== "done" || sp.edit === "1");
  const late = v.status === "scheduled" && v.scheduledDate < today;
  const stats = checklistStats(v.checklist ?? []);
  const sections = checklistSectionsFor(c.systems ?? []);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        eyebrow={`${c.number} · Visit ${n} of ${siblings.length}`}
        title={row.customerName}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2">
          <AmcStatusBadge status={v.status} />
          {v.status === "done" ? `Done ${fmtDate(v.doneDate)}` : `Planned ${fmtDate(v.scheduledDate)}`}
          {late && <Badge tone="red">Overdue</Badge>}
        </span>}
        back={{ href: `/amc/${c.id}`, label: c.number }}
        actions={v.status === "done" ? <>
          <LinkButton variant="secondary" href={`/amc/${c.id}/visits/${v.id}/print`}><Printer className="h-4 w-4" aria-hidden /> Print report</LinkButton>
          {canRecord && sp.edit !== "1" && <LinkButton variant="ghost" href={`/amc/${c.id}/visits/${v.id}?edit=1`}>Edit report</LinkButton>}
        </> : undefined}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <Card title="Site">
        <DL items={[
          ["Site address", <span key="s" className="whitespace-pre-line">{c.siteAddress || "-"}</span>],
          ["Customer phone", row.customerPhone ? <a key="p" href={`tel:${row.customerPhone}`} className="text-brand-700 hover:underline dark:text-brand-300">{row.customerPhone}</a> : "-"],
          ["Systems", <SystemChips key="sy" systems={c.systems} />],
          ["Engineer", row.engineerName ?? "Unassigned"],
        ]} />
      </Card>

      {v.status === "done" && !showForm && (
        <Card title={`Checklist (${stats.ok} OK${stats.notOk ? `, ${stats.notOk} not OK` : ""})`} bodyClassName="p-0">
          {stats.total === 0 ? <p className="p-4 text-sm text-ink-soft sm:p-5">No checklist recorded.</p> : (
            <ul className="divide-y divide-line">
              {(v.checklist ?? []).map((r, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <div className="min-w-0">
                    <div className="text-ink">{r.item}</div>
                    {r.remark && <div className="text-xs text-ink-soft">{r.remark}</div>}
                  </div>
                  <Badge tone={r.ok ? "green" : "red"}>{r.ok ? "OK" : "Not OK"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {v.status !== "scheduled" && !showForm && (v.findings || v.recommendations || v.customerSignoff) && (
        <Card title="Report">
          <DL items={[
            ["Findings", <span key="f" className="whitespace-pre-line">{v.findings || "-"}</span>],
            ["Recommendations", <span key="r" className="whitespace-pre-line">{v.recommendations || "-"}</span>],
            ["Customer sign-off", v.customerSignoff || "-"],
          ]} />
        </Card>
      )}

      {showForm && (
        <VisitForm
          contractId={c.id} visitId={v.id} sections={sections} existing={v.checklist ?? []} today={today} doneDate={v.doneDate}
          engineers={engineerList} engineerId={v.engineerId ?? (user.role === "engineer" ? user.id : null)} canPickEngineer={acc.manage || user.role === "engineer"}
          findings={v.status === "done" ? v.findings : null} recommendations={v.recommendations} customerSignoff={v.customerSignoff}
        />
      )}

      {canRecord && (v.status === "scheduled" || v.status === "missed") && (
        <div className="grid gap-6 sm:grid-cols-2">
          <Card title="Reschedule">
            <form action={rescheduleVisit} className="space-y-3">
              <input type="hidden" name="contractId" value={c.id} />
              <input type="hidden" name="visitId" value={v.id} />
              <Field label="New date" required><Input type="date" name="date" required min={addDays(today, -1)} defaultValue={v.scheduledDate >= today ? v.scheduledDate : addDays(today, 1)} /></Field>
              <SubmitButton variant="secondary">Reschedule</SubmitButton>
            </form>
          </Card>
          {v.status === "scheduled" && (
            <Card title="Mark missed">
              <form action={markVisitMissed} className="space-y-3">
                <input type="hidden" name="contractId" value={c.id} />
                <input type="hidden" name="visitId" value={v.id} />
                <Field label="Reason"><Textarea name="reason" rows={2} maxLength={500} placeholder="e.g. Site closed for shutdown" /></Field>
                <SubmitButton variant="danger" confirm="Mark this visit as missed?">Mark missed</SubmitButton>
              </form>
            </Card>
          )}
          <Card title="Engineer" className="sm:col-span-2">
            <form action={assignVisitEngineer} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <input type="hidden" name="contractId" value={c.id} />
              <input type="hidden" name="visitId" value={v.id} />
              {acc.manage ? (
                <Field label="Engineer for this visit" className="flex-1">
                  <Select name="engineerId" defaultValue={v.engineerId ?? ""}>
                    <option value="">Unassigned</option>
                    {engineerList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </Select>
                </Field>
              ) : (
                <input type="hidden" name="engineerId" value={user.id} />
              )}
              {(acc.manage || v.engineerId !== user.id) && <SubmitButton variant="secondary">{acc.manage ? "Save" : "Take this visit"}</SubmitButton>}
              {!acc.manage && v.engineerId === user.id && <p className="text-sm text-ink-soft">This visit is assigned to you.</p>}
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
