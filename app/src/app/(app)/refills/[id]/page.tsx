import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, extinguisherAssets, refillServices, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { daysBetween, fmtDate, fmtDateTime, money, todayIST } from "@/lib/format";
import { BUCKET_LABELS, REFILL_KINDS, refillBucket } from "@/lib/refills";
import { Badge, Card, DL, Field, Flash, Input, PageHeader, Select, StatusBadge, Table, Td, Th, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { AssetForm } from "../_components/asset-form";
import { recordRefill, setAssetStatus } from "../actions";

const TONE = { overdue: "red", due10: "amber", due30: "blue", later: "gray" } as const;

export default async function AssetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
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

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={`${a.qty} × ${a.extType}`}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><Link href={`/refills?customerId=${a.customerId}`} className="hover:text-brand-700">{row.customerName}</Link>{a.location && <span>· {a.location}</span>}<StatusBadge status={a.status} /></span>}
        back={{ href: "/refills", label: "Refill tracker" }}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <Card title="Refill schedule">
        <DL
          items={[
            ["Next refill due", <span key="n" className="inline-flex items-center gap-2">{fmtDate(a.nextDueDate)} {a.status === "active" && <Badge tone={TONE[bucket]}>{days < 0 ? `${-days} days overdue` : `${BUCKET_LABELS[bucket]} (${days} d)`}</Badge>}</span>],
            ["Interval", a.refillIntervalMonths % 12 === 0 ? `${a.refillIntervalMonths / 12} year${a.refillIntervalMonths === 12 ? "" : "s"}` : `${a.refillIntervalMonths} months`],
            ["Last refill", fmtDate(a.lastRefillDate)],
            ["Install date", fmtDate(a.installDate)],
            ["HPT due", fmtDate(a.hptDueDate)],
            ["Make / serial", `${a.make || "—"}${a.serialNo ? ` · #${a.serialNo}` : ""}`],
            ["Customer phone", row.customerPhone ? <a key="p" href={`tel:${row.customerPhone}`} className="hover:text-brand-700">{row.customerPhone}</a> : "—"],
            ["Notes", a.notes || "—"],
          ]}
        />
      </Card>

      {writable && a.status === "active" && (
        <Card title="Record refill / service">
          <form action={recordRefill} className="space-y-4">
            <input type="hidden" name="ids" value={a.id} />
            <input type="hidden" name="back" value={`/refills/${a.id}`} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date" required><Input type="date" name="date" required defaultValue={today} max={today} /></Field>
              <Field label="Kind" required hint="Refill & replacement reset the next due date; HPT sets the next pressure test date.">
                <Select name="kind" defaultValue="refill">
                  {Object.entries(REFILL_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Amount (₹)"><Input type="number" name="amount" min={0} step="0.01" inputMode="decimal" /></Field>
              <Field label="Next HPT due" hint="Optional — defaults to 5 years after an HPT"><Input type="date" name="hptDueDate" /></Field>
              <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={2} maxLength={1000} /></Field>
            </div>
            <SubmitButton>Record</SubmitButton>
          </form>
        </Card>
      )}

      <Card title={`Service history (${history.length})`} bodyClassName={history.length ? "p-0" : undefined}>
        {history.length ? (
          <Table className="rounded-none border-0 shadow-none">
            <thead><tr><Th>Date</Th><Th>Kind</Th><Th className="text-right">Amount</Th><Th>By</Th><Th>Notes</Th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <Td className="whitespace-nowrap">{fmtDate(h.date)}</Td>
                  <Td>{REFILL_KINDS[h.kind as keyof typeof REFILL_KINDS] ?? h.kind}</Td>
                  <Td className="text-right tabular-nums">{h.amount != null ? money(h.amount) : "—"}</Td>
                  <Td title={fmtDateTime(h.createdAt)}>{h.userName ?? "—"}</Td>
                  <Td className="max-w-72 whitespace-pre-wrap">{h.notes || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <p className="text-sm text-ink-soft">No refills recorded yet.</p>}
      </Card>

      {writable && (
        <>
          <Card title="Edit asset">
            <AssetForm customers={customerList} values={a} today={today} />
          </Card>
          <form action={setAssetStatus} className="flex items-center gap-3">
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="status" value={a.status === "active" ? "retired" : "active"} />
            {a.status === "active" ? (
              <SubmitButton variant="danger" confirm="Retire this asset? It will be removed from due lists and reminders.">Retire asset</SubmitButton>
            ) : (
              <SubmitButton variant="secondary">Re-activate asset</SubmitButton>
            )}
            <span className="text-xs text-ink-soft">Retire extinguishers that were scrapped or moved to another service provider.</span>
          </form>
        </>
      )}
    </div>
  );
}
