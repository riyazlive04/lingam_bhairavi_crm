import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { CalendarClock, ClipboardList, MapPin, Pencil, Printer, UserCog, XCircle } from "lucide-react";
import { getDb } from "@/db";
import { amcContracts, amcVisits, customers, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { addDays, fmtDate, todayIST } from "@/lib/format";
import { checklistSectionsFor, checklistStats, effectiveAmcStatus } from "@/lib/amc";
import { Field, Flash, Input, LinkButton, Select, Textarea } from "@/components/ui";
import { Callout, ConfirmButton, DetailPage, KeyValueGrid, MetaChip, SectionCard, StatusPill } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { SystemChips } from "../../../_components/system-chips";
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
  const base = `/amc/${c.id}/visits/${v.id}`;
  const canPlan = canRecord && (v.status === "scheduled" || v.status === "missed");

  // While the checklist form is open its own sticky save bar is the main action, so the header stays quiet
  // (two bars fixed to the bottom of a phone would overlap).
  const primary = !showForm && v.status === "done"
    ? <LinkButton href={`${base}/print`}><Printer className="icon-sm" aria-hidden /> Print report</LinkButton>
    : null;
  const secondary = !showForm && v.status === "done" && canRecord
    ? <LinkButton variant="secondary" href={`${base}?edit=1`}><Pencil className="icon-sm" aria-hidden /> Edit report</LinkButton>
    : undefined;

  const site = (
    <SectionCard title="Site" icon={MapPin}>
      <KeyValueGrid columns={1} items={[
        { label: "Site address", value: c.siteAddress ? <span className="whitespace-pre-line">{c.siteAddress}</span> : null },
        { label: "Customer phone", value: row.customerPhone ? <a href={`tel:${row.customerPhone}`} className="inline-flex min-h-9 items-center text-brand-700 hover:underline dark:text-brand-300">{row.customerPhone}</a> : null },
        { label: "Systems", value: <SystemChips systems={c.systems} /> },
        { label: "Engineer", value: row.engineerName ?? "Unassigned" },
      ]} />
    </SectionCard>
  );

  const planning = canPlan && (
    <>
      <SectionCard title="Reschedule" icon={CalendarClock}>
        <form action={rescheduleVisit} className="space-y-3">
          <input type="hidden" name="contractId" value={c.id} />
          <input type="hidden" name="visitId" value={v.id} />
          <Field label="New date" required><Input type="date" name="date" required min={addDays(today, -1)} defaultValue={v.scheduledDate >= today ? v.scheduledDate : addDays(today, 1)} className="h-11" /></Field>
          <SubmitButton variant="secondary" pendingText="Rescheduling…" className="w-full">Reschedule visit</SubmitButton>
        </form>
      </SectionCard>
      <SectionCard title="Engineer" icon={UserCog}>
        <form action={assignVisitEngineer} className="space-y-3">
          <input type="hidden" name="contractId" value={c.id} />
          <input type="hidden" name="visitId" value={v.id} />
          {acc.manage ? (
            <Field label="Engineer for this visit">
              <Select name="engineerId" defaultValue={v.engineerId ?? ""} className="h-11">
                <option value="">Unassigned</option>
                {engineerList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="engineerId" value={user.id} />
          )}
          {(acc.manage || v.engineerId !== user.id) && <SubmitButton variant="secondary" className="w-full">{acc.manage ? "Save engineer" : "Take this visit"}</SubmitButton>}
          {!acc.manage && v.engineerId === user.id && <p className="text-sm text-ink-soft">This visit is assigned to you.</p>}
        </form>
      </SectionCard>
      {v.status === "scheduled" && (
        <SectionCard title="Could not visit?" icon={XCircle} description="Mark the visit missed if the site could not be attended.">
          <form action={markVisitMissed} className="space-y-3">
            <input type="hidden" name="contractId" value={c.id} />
            <input type="hidden" name="visitId" value={v.id} />
            <Field label="Reason"><Textarea name="reason" rows={2} maxLength={500} placeholder="e.g. Site closed for shutdown" /></Field>
            <ConfirmButton variant="secondary" className="w-full text-danger" confirmVariant="danger" stacked pendingText="Saving…"
              confirm="Mark this visit as missed?" confirmLabel="Yes, mark missed">
              Mark missed
            </ConfirmButton>
          </form>
        </SectionCard>
      )}
    </>
  );

  return (
    <DetailPage
      back={{ href: `/amc/${c.id}`, label: c.number }}
      eyebrow={`${c.number} · Visit ${n} of ${siblings.length}`}
      title={row.customerName}
      status={<><StatusPill status={v.status} />{late && <StatusPill status="overdue" />}</>}
      meta={
        <>
          <MetaChip label={v.status === "done" ? "Done" : "Planned"}>{fmtDate(v.status === "done" ? v.doneDate : v.scheduledDate)}</MetaChip>
          <MetaChip label="Engineer">{row.engineerName ?? "Unassigned"}</MetaChip>
          {v.status === "done" && stats.total > 0 && <MetaChip label="Checklist">{stats.ok} OK{stats.notOk ? `, ${stats.notOk} not OK` : ""}</MetaChip>}
        </>
      }
      primaryAction={primary}
      secondaryActions={secondary}
      notices={
        <>
          <Flash ok={sp.ok} err={sp.err} />
          {late && <Callout tone="danger" title="This visit is overdue">It was planned for {fmtDate(v.scheduledDate)}. Record it now or reschedule it with the site.</Callout>}
          {!contractOpen && <Callout tone="warning" title="Contract cancelled">Visits on a cancelled contract cannot be recorded.</Callout>}
        </>
      }
      aside={<>{site}{planning}</>}
    >
      {showForm && (
        <VisitForm
          contractId={c.id} visitId={v.id} sections={sections} existing={v.checklist ?? []} today={today} doneDate={v.doneDate}
          engineers={engineerList} engineerId={v.engineerId ?? (user.role === "engineer" ? user.id : null)} canPickEngineer={acc.manage || user.role === "engineer"}
          findings={v.status === "done" ? v.findings : null} recommendations={v.recommendations} customerSignoff={v.customerSignoff}
          cancelHref={v.status === "done" ? base : `/amc/${c.id}`}
        />
      )}

      {!showForm && (
        <SectionCard title="Checklist" icon={ClipboardList} flush={stats.total > 0}
          description={stats.total > 0 ? `${stats.ok} OK${stats.notOk ? `, ${stats.notOk} not OK` : ""}` : undefined}
          empty={stats.total === 0 && (v.status === "done" ? "No checklist was recorded on this visit." : "The checklist is filled in when the visit is recorded.")}>
          <ul className="divide-y divide-line">
            {(v.checklist ?? []).map((r, i) => (
              <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                <div className="min-w-0">
                  <div className="text-ink">{r.item}</div>
                  {r.remark && <div className="text-caption text-ink-soft">{r.remark}</div>}
                </div>
                <StatusPill semantic={r.ok ? "success" : "danger"} label={r.ok ? "OK" : "Not OK"} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      {v.status !== "scheduled" && !showForm && (
        <SectionCard title="Report"
          empty={!(v.findings || v.recommendations || v.customerSignoff) && "No findings or recommendations were written for this visit."}>
          <KeyValueGrid columns={1} items={[
            { label: "Findings", value: v.findings ? <span className="whitespace-pre-line font-normal">{v.findings}</span> : null },
            { label: "Recommendations", value: v.recommendations ? <span className="whitespace-pre-line font-normal">{v.recommendations}</span> : null },
            { label: "Customer sign-off", value: v.customerSignoff },
          ]} />
        </SectionCard>
      )}
    </DetailPage>
  );
}
