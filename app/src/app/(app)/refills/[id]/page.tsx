import { notFound } from "next/navigation";
import { asc, desc, eq, or } from "drizzle-orm";
import { Archive, CalendarClock, History, Phone, RefreshCw, RotateCcw } from "lucide-react";
import { getDb } from "@/db";
import { customers, extinguisherAssets, refillServices, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { daysBetween, fmtDate, fmtDateTime, money, todayIST } from "@/lib/format";
import { BUCKET_LABELS, REFILL_KINDS, refillBucket } from "@/lib/refills";
import { Field, Flash, Input, LinkButton, Select, Textarea } from "@/components/ui";
import {
  Callout, ConfirmButton, DetailPage, KeyValueGrid, MetaChip, SectionCard, StatusPill, StatusTimeline, Tabs, activeTab, type StatusSemantic,
} from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { AssetForm } from "../_components/asset-form";
import { recordRefill, setAssetStatus } from "../actions";

export const metadata = { title: "Extinguisher" };

const BUCKET_SEMANTIC: Record<string, StatusSemantic> = { overdue: "danger", due10: "warning", due30: "info", later: "neutral" };
const KIND_SEMANTIC: Record<string, StatusSemantic> = { refill: "success", replacement: "success", hpt: "info", service: "neutral" };

export default async function AssetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; tab?: string }> }) {
  const user = await requireUser("refills");
  const { id } = await params;
  const sp = await searchParams;
  const aid = Number(id);
  if (!Number.isInteger(aid) || aid <= 0) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ a: extinguisherAssets, customerName: customers.name, customerPhone: customers.phone })
    .from(extinguisherAssets)
    .innerJoin(customers, eq(customers.id, extinguisherAssets.customerId))
    .where(eq(extinguisherAssets.id, aid))
    .limit(1);
  if (!row) notFound();
  const a = row.a;
  const today = todayIST();
  const writable = canWrite(user.role, "refills");
  const [history, customerList] = await Promise.all([
    db
      .select({ id: refillServices.id, date: refillServices.date, kind: refillServices.kind, amount: refillServices.amount, notes: refillServices.notes, userName: users.name, createdAt: refillServices.createdAt })
      .from(refillServices)
      .leftJoin(users, eq(users.id, refillServices.userId))
      .where(eq(refillServices.assetId, a.id))
      .orderBy(desc(refillServices.date), desc(refillServices.id)),
    writable
      ? db.select({ id: customers.id, name: customers.name }).from(customers).where(or(eq(customers.active, true), eq(customers.id, a.customerId))).orderBy(asc(customers.name))
      : Promise.resolve([]),
  ]);
  const days = daysBetween(today, a.nextDueDate);
  const bucket = refillBucket(a.nextDueDate, today);
  const active = a.status === "active";
  const dueText = days < 0 ? `${-days} days overdue` : `${BUCKET_LABELS[bucket]} (${days} d)`;
  const base = `/refills/${a.id}`;
  const tab = activeTab(sp.tab, writable ? (["history", "edit"] as const) : (["history"] as const));

  const more = writable && (
    <form action={setAssetStatus}>
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="status" value={active ? "retired" : "active"} />
      {active ? (
        <ConfirmButton variant="ghost" className="text-danger" confirmVariant="danger" stacked pendingText="Retiring…" confirmLabel="Yes, retire asset"
          confirm="Retire this asset? It will be removed from due lists and reminders.">
          <Archive className="icon-sm" aria-hidden /> Retire asset
        </ConfirmButton>
      ) : (
        <SubmitButton variant="ghost" pendingText="Reactivating…"><RotateCcw className="icon-sm" aria-hidden /> Reactivate asset</SubmitButton>
      )}
    </form>
  );

  return (
    <DetailPage
      back={{ href: "/refills", label: "Refill tracker" }}
      eyebrow="Extinguisher"
      title={`${a.qty} × ${a.extType}`}
      status={<><StatusPill status={a.status} />{active && <StatusPill semantic={BUCKET_SEMANTIC[bucket]} label={dueText} />}</>}
      meta={
        <>
          <MetaChip label="Customer" href={`/refills?customerId=${a.customerId}`}>{row.customerName}</MetaChip>
          {a.location && <MetaChip label="Location">{a.location}</MetaChip>}
          <MetaChip label="Next due">{fmtDate(a.nextDueDate)}</MetaChip>
          {a.serialNo && <MetaChip label="Serial">#{a.serialNo}</MetaChip>}
        </>
      }
      primaryAction={writable && active && <LinkButton href={`${base}#record`}><RefreshCw className="icon-sm" aria-hidden /> Record refill</LinkButton>}
      secondaryActions={row.customerPhone ? <LinkButton variant="secondary" href={`tel:${row.customerPhone}`}><Phone className="icon-sm" aria-hidden /> Call customer</LinkButton> : undefined}
      moreActions={more || undefined}
      notices={
        <>
          <Flash ok={sp.ok} err={sp.err} />
          {!active && <Callout tone="info" title="This asset is retired">It no longer appears in due lists or reminders.{writable ? " Reactivate it from More if it is back in service." : ""}</Callout>}
        </>
      }
      tabs={writable ? <Tabs label="Asset sections" basePath={base} params={{ tab: sp.tab }} active={tab} items={[
        { id: "history", label: "Service history", count: history.length },
        { id: "edit", label: "Edit asset" },
      ]} /> : undefined}
      aside={
        <SectionCard title="Refill schedule" icon={CalendarClock}>
          <KeyValueGrid columns={1} items={[
            { label: "Next refill due", value: fmtDate(a.nextDueDate) },
            { label: "Interval", value: a.refillIntervalMonths % 12 === 0 ? `${a.refillIntervalMonths / 12} year${a.refillIntervalMonths === 12 ? "" : "s"}` : `${a.refillIntervalMonths} months` },
            { label: "Last refill", value: fmtDate(a.lastRefillDate) },
            { label: "Install date", value: fmtDate(a.installDate) },
            { label: "HPT due", value: fmtDate(a.hptDueDate) },
            { label: "Make / serial", value: `${a.make || "-"}${a.serialNo ? ` · #${a.serialNo}` : ""}` },
            { label: "Customer phone", value: row.customerPhone ? <a href={`tel:${row.customerPhone}`} className="text-brand-700 hover:underline dark:text-brand-300">{row.customerPhone}</a> : null },
            { label: "Notes", value: a.notes },
          ]} />
        </SectionCard>
      }
    >
      {tab === "history" && (
        <>
          {writable && active && (
            <SectionCard id="record" title="Record refill or service" icon={RefreshCw} description="Refill and replacement reset the next due date. HPT sets the next pressure test date.">
              <form action={recordRefill} className="space-y-4">
                <input type="hidden" name="ids" value={a.id} />
                <input type="hidden" name="back" value={`/refills/${a.id}`} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Date" required><Input type="date" name="date" required defaultValue={today} max={today} /></Field>
                  <Field label="Kind" required>
                    <Select name="kind" defaultValue="refill">
                      {Object.entries(REFILL_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </Field>
                  <Field label="Amount (₹)"><Input type="number" name="amount" min={0} step="0.01" inputMode="decimal" className="text-right" /></Field>
                  <Field label="Next HPT due" hint="Optional. Defaults to 5 years after an HPT."><Input type="date" name="hptDueDate" /></Field>
                  <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={2} maxLength={1000} /></Field>
                </div>
                <div className="flex justify-end">
                  <SubmitButton pendingText="Recording…" className="max-sm:w-full">Record service</SubmitButton>
                </div>
              </form>
            </SectionCard>
          )}

          <SectionCard title="Service history" count={history.length} icon={History}
            empty={history.length === 0 && (writable && active ? "No refills recorded yet. Record one above after the next visit." : "No refills recorded yet.")}>
            <StatusTimeline items={history.map((h) => ({
              id: h.id,
              title: <>{REFILL_KINDS[h.kind as keyof typeof REFILL_KINDS] ?? h.kind}{h.amount != null && <span className="font-normal text-ink-soft"> · {money(h.amount)}</span>}</>,
              at: fmtDate(h.date),
              by: h.userName ? `By ${h.userName} · logged ${fmtDateTime(h.createdAt)}` : undefined,
              semantic: KIND_SEMANTIC[h.kind] ?? "neutral",
              body: h.notes ? <span className="whitespace-pre-wrap">{h.notes}</span> : undefined,
            }))} />
          </SectionCard>
        </>
      )}

      {tab === "edit" && writable && (
        <AssetForm customers={customerList} values={a} today={today} cancelHref={base} inline />
      )}
    </DetailPage>
  );
}
