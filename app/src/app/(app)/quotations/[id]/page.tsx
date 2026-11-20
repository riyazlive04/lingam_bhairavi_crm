import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, like, ne, or } from "drizzle-orm";
import { Copy, FileSpreadsheet, GitBranch, MessageCircle, Pencil, Phone, Printer } from "lucide-react";
import { getDb } from "@/db";
import { boqTemplates, customers, followUps, projects, quotationLines, quotations, salesOrders, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canSeeCost, canWrite } from "@/lib/rbac";
import { SYSTEMS, type SystemKey } from "@/lib/constants";
import { addDays, daysBetween, fmtDate, fmtDateTime, money, pct, todayIST } from "@/lib/format";
import { computeQuoteTotals, getPricingSettings, linePriceWarning } from "@/lib/pricing";
import {
  FOLLOWUP_MODE_LABEL, FOLLOWUP_OUTCOME_LABEL, isEditableStatus, istDate, telLink, whatsappLink,
} from "@/lib/quotations";
import { Badge, Card, DL, EmptyState, Field, Flash, Input, LinkButton, PageHeader, StatusBadge, Textarea, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import {
  deleteDraft, duplicateQuotation, emailQuotation, markNegotiation, markSent, markWon, refreshPrices, reviseQuotation,
} from "../actions";
import { FollowUpForm, LostForm } from "../_components/forms";
import { QuoteLinesTable } from "../_components/lines-table";

export const metadata = { title: "Quotation" };

const OUTCOME_TONE: Record<string, "green" | "gray" | "red" | "amber"> = { positive: "green", neutral: "gray", negative: "red", no_response: "amber" };

export default async function QuotationDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; action?: string }> }) {
  const user = await requireUser("quotations");
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await getDb();
  const sp = await searchParams;
  const [q] = await db.select().from(quotations).where(eq(quotations.id, id));
  if (!q) notFound();

  const base = q.number.replace(/-R\d+$/, "");
  const [[cust], lines, fups, [preparer], tmplRows, orders, projs, family, pricing] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, q.customerId)),
    db.select().from(quotationLines).where(eq(quotationLines.quotationId, id)).orderBy(asc(quotationLines.sortOrder), asc(quotationLines.id)),
    db.select({ f: followUps, userName: users.name }).from(followUps).leftJoin(users, eq(users.id, followUps.userId))
      .where(eq(followUps.quotationId, id)).orderBy(desc(followUps.date), desc(followUps.id)),
    q.preparedBy ? db.select({ name: users.name }).from(users).where(eq(users.id, q.preparedBy)) : Promise.resolve([]),
    q.templateId ? db.select({ id: boqTemplates.id, name: boqTemplates.name }).from(boqTemplates).where(eq(boqTemplates.id, q.templateId)) : Promise.resolve([]),
    db.select({ id: salesOrders.id, number: salesOrders.number, status: salesOrders.status }).from(salesOrders).where(eq(salesOrders.quotationId, id)),
    db.select({ id: projects.id, code: projects.code, name: projects.name }).from(projects).where(eq(projects.quotationId, id)),
    db.select({ id: quotations.id, number: quotations.number, status: quotations.status, revision: quotations.revision }).from(quotations)
      .where(and(ne(quotations.id, id), or(eq(quotations.number, base), like(quotations.number, `${base}-R%`)))).orderBy(asc(quotations.revision)),
    getPricingSettings(db),
  ]);

  const writable = canWrite(user.role, "quotations");
  const fuWritable = canWrite(user.role, "followups");
  const showCost = canSeeCost(user.role);
  const totals = computeQuoteTotals(lines, q.discountPct, q.gstPct);
  const editable = isEditableStatus(q.status);
  const open = q.status === "sent" || q.status === "negotiation";
  const today = todayIST();
  const back = `/quotations/${id}`;
  const below = showCost ? lines.filter((l) => linePriceWarning(l, pricing.minMarginPct) === "below_cost").length : 0;
  const lowMargin = showCost ? lines.filter((l) => linePriceWarning(l, pricing.minMarginPct) === "low_margin").length : 0;
  const tmpl = tmplRows[0];
  const waText = `Dear ${cust?.contactPerson || cust?.name || "Sir/Madam"}, this is regarding our quotation ${q.number}${q.projectName ? ` for ${q.projectName}` : ""} (₹${Math.round(q.grandTotal).toLocaleString("en-IN")}). Please let us know if you need any clarification. — ${user.name}, Linga Bhairavi Enterprise`;
  const wa = whatsappLink(cust?.phone, waText);
  const tel = telLink(cust?.phone);
  const overdue = open && q.nextFollowUpDate && q.nextFollowUpDate < today;
  const expiredValidity = open && q.validUntil && q.validUntil < today;

  return (
    <div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{q.number} <StatusBadge status={q.status} />{q.revision > 0 && <Badge tone="violet">Rev {q.revision}</Badge>}</span>}
        subtitle={<>{cust?.name ?? "Unknown customer"}{q.projectName ? ` · ${q.projectName}` : ""}</>}
        back={{ href: "/quotations", label: "Quotations" }}
        actions={<>
          <LinkButton href={`/quotations/${id}/print`} variant="secondary"><Printer className="h-4 w-4" aria-hidden /> Print</LinkButton>
          <a href={`/quotations/${id}/export`} className={buttonClass("secondary")} download><FileSpreadsheet className="h-4 w-4" aria-hidden /> Excel</a>
          {writable && editable && <LinkButton href={`/quotations/${id}/edit`}><Pencil className="h-4 w-4" aria-hidden /> Edit</LinkButton>}
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      {expiredValidity && (
        <div role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Validity ended on {fmtDate(q.validUntil)} — consider sending a revision with refreshed prices.
        </div>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <DL items={[
            ["Customer", cust ? <span>{cust.name}{cust.contactPerson ? <span className="text-ink-soft"> · {cust.contactPerson}</span> : null}</span> : "—"],
            ["Contact", cust?.phone || cust?.email ? (
              <span className="flex flex-wrap items-center gap-3">
                {tel && <a href={tel} className="inline-flex items-center gap-1 text-brand-700 hover:underline"><Phone className="h-3.5 w-3.5" aria-hidden />{cust?.phone}</a>}
                {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-700 hover:underline dark:text-emerald-400"><MessageCircle className="h-3.5 w-3.5" aria-hidden />WhatsApp</a>}
                {cust?.email && <a href={`mailto:${cust.email}`} className="text-brand-700 hover:underline">{cust.email}</a>}
              </span>
            ) : "—"],
            ["Project", q.projectName || "—"],
            ["Site location", q.siteLocation || "—"],
            ["System", q.system ? SYSTEMS[q.system as SystemKey] ?? q.system : "Mixed"],
            ["BOQ template", tmpl ? <Link href={`/boq-templates/${tmpl.id}`} className="text-brand-700 hover:underline">{tmpl.name}</Link> : "Blank"],
            ["Quotation date", fmtDate(q.quoteDate)],
            ["Valid until", fmtDate(q.validUntil)],
            ["Prepared by", preparer?.name ?? "—"],
            ["Sent", q.sentAt ? `${fmtDateTime(q.sentAt)} (${daysBetween(istDate(q.sentAt), today)} days ago)` : "Not yet"],
            ...(open ? [["Next follow-up", q.nextFollowUpDate ? <span className={overdue ? "font-medium text-red-600" : ""}>{fmtDate(q.nextFollowUpDate)}{overdue ? " (overdue)" : ""}</span> : <span className="text-amber-700 dark:text-amber-400">Not scheduled</span>] as [string, React.ReactNode]] : []),
            ...(q.closedAt ? [["Closed", fmtDateTime(q.closedAt)] as [string, React.ReactNode]] : []),
            ...(q.lostReason ? [["Lost reason", q.lostReason] as [string, React.ReactNode]] : []),
            ...(orders.length ? [["Sales order", <span key="so" className="flex flex-wrap gap-2">{orders.map((o) => <Link key={o.id} href={`/orders/${o.id}`} className="text-brand-700 hover:underline">{o.number}</Link>)}</span>] as [string, React.ReactNode]] : []),
            ...(projs.length ? [["Project", <span key="pr" className="flex flex-wrap gap-2">{projs.map((p) => <Link key={p.id} href={`/projects/${p.id}`} className="text-brand-700 hover:underline">{p.code} — {p.name}</Link>)}</span>] as [string, React.ReactNode]] : []),
            ...(family.length ? [["Other revisions", <span key="rv" className="flex flex-wrap gap-2">{family.map((f) => <Link key={f.id} href={`/quotations/${f.id}`} className="text-brand-700 hover:underline">{f.number} <span className="text-ink-soft">({f.status})</span></Link>)}</span>] as [string, React.ReactNode]] : []),
          ]} />
          {q.notes && <p className="mt-4 whitespace-pre-line rounded-lg bg-muted p-3 text-sm text-ink-soft"><span className="font-medium text-ink">Internal notes: </span>{q.notes}</p>}
        </Card>

        {writable ? (
          <Card title="Actions">
            <div className="space-y-3">
              {q.status === "draft" && (
                <form action={markSent}>
                  <input type="hidden" name="id" value={id} />
                  <SubmitButton className="w-full" pendingText="Updating…">Mark as sent</SubmitButton>
                  <p className="mt-1 text-xs text-ink-soft">Schedules the first follow-up for {fmtDate(addDays(today, 2))}.</p>
                </form>
              )}
              {q.status === "sent" && (
                <form action={markNegotiation}>
                  <input type="hidden" name="id" value={id} />
                  <SubmitButton variant="secondary" className="w-full" pendingText="Updating…">Mark negotiation</SubmitButton>
                </form>
              )}
              {editable && (
                <details id="won" className="rounded-lg border border-line p-3" open={sp.action === "won"}>
                  <summary className="cursor-pointer text-sm font-semibold text-emerald-700 dark:text-emerald-400">Mark won → create sales order</summary>
                  <form action={markWon} className="mt-3 space-y-3">
                    <input type="hidden" name="id" value={id} />
                    <Field label="Customer PO number"><Input name="customerPoNumber" maxLength={80} /></Field>
                    <Field label="Customer PO date"><Input type="date" name="customerPoDate" defaultValue={today} max={today} /></Field>
                    <Field label="Expected delivery"><Input type="date" name="expectedDelivery" min={today} /></Field>
                    <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="createProject" defaultChecked /> Also create a project</label>
                    <Field label="Project name"><Input name="projectName" defaultValue={q.projectName ?? ""} maxLength={200} /></Field>
                    {showCost && (
                      <Field label="Project budget (₹)" hint={`Blank = material cost + erection (${money(totals.cost + totals.erection * (1 - q.discountPct / 100))})`}>
                        <Input type="number" name="budget" min={0} step="0.01" />
                      </Field>
                    )}
                    <p className="text-xs text-ink-soft">Contract value (excl. GST): {money(totals.taxable)}</p>
                    <SubmitButton variant="success" className="w-full" pendingText="Creating order…" confirm="Mark as won and create the sales order?">Mark won</SubmitButton>
                  </form>
                </details>
              )}
              {editable && (
                <details className="rounded-lg border border-line p-3" open={sp.action === "lost"}>
                  <summary className="cursor-pointer text-sm font-semibold text-red-700 dark:text-red-400">Mark lost</summary>
                  <div className="mt-3"><LostForm quotationId={id} back={back} idPrefix="lost" /></div>
                </details>
              )}
              <details className="rounded-lg border border-line p-3">
                <summary className="cursor-pointer text-sm font-semibold text-ink">Email to customer</summary>
                <form action={emailQuotation} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={id} />
                  <Field label="To" required><Input type="email" name="to" defaultValue={cust?.email ?? ""} required maxLength={200} /></Field>
                  <Field label="CC"><Input type="email" name="cc" maxLength={200} /></Field>
                  <Field label="Message" hint="Optional — a standard covering note is used if empty"><Textarea name="message" rows={3} maxLength={2000} /></Field>
                  <SubmitButton variant="secondary" className="w-full" pendingText="Queuing…">Send email{q.status === "draft" ? " & mark sent" : ""}</SubmitButton>
                </form>
              </details>
              <div className="grid grid-cols-2 gap-2">
                <form action={duplicateQuotation}>
                  <input type="hidden" name="id" value={id} />
                  <SubmitButton variant="secondary" size="sm" className="w-full" pendingText="Copying…"><Copy className="h-4 w-4" aria-hidden /> Duplicate</SubmitButton>
                </form>
                {q.status !== "draft" && q.status !== "won" ? (
                  <form action={reviseQuotation}>
                    <input type="hidden" name="id" value={id} />
                    <SubmitButton variant="secondary" size="sm" className="w-full" pendingText="Revising…"
                      confirm={open ? "Create a new revision? This version will be marked superseded (expired)." : undefined}>
                      <GitBranch className="h-4 w-4" aria-hidden /> Revise
                    </SubmitButton>
                  </form>
                ) : <span />}
              </div>
              {q.status === "draft" && (
                <div className="grid grid-cols-2 gap-2">
                  <form action={refreshPrices}>
                    <input type="hidden" name="id" value={id} />
                    <SubmitButton variant="secondary" size="sm" className="w-full" pendingText="Refreshing…" confirm="Re-price all item lines from the latest purchase costs at this quotation's markup?">Refresh prices</SubmitButton>
                  </form>
                  <form action={deleteDraft}>
                    <input type="hidden" name="id" value={id} />
                    <SubmitButton variant="danger" size="sm" className="w-full" pendingText="Deleting…" confirm="Delete this draft quotation permanently?">Delete draft</SubmitButton>
                  </form>
                </div>
              )}
            </div>
          </Card>
        ) : (
          <Card title="Summary">
            <p className="text-sm text-ink-soft">You have read-only access to quotations.</p>
          </Card>
        )}
      </div>

      <section aria-labelledby="boq-h" className="mb-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="boq-h" className="text-lg font-semibold text-ink">Bill of quantities</h2>
          <span className="text-sm text-ink-soft">{totals.lineCount} line{totals.lineCount === 1 ? "" : "s"}</span>
        </div>
        {lines.length === 0 ? (
          <EmptyState title="No lines on this quotation" action={writable && editable && <LinkButton href={`/quotations/${id}/edit`}>Add lines</LinkButton>} />
        ) : (
          <QuoteLinesTable lines={lines} totals={totals} discountPct={q.discountPct} gstPct={q.gstPct} />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {showCost && (
          <Card title="Cost & margin (internal)">
            <dl className="space-y-2 text-sm">
              <Row label="Material cost (snapshot)" value={money(totals.cost)} />
              <Row label="Supply value (net of discount)" value={money(totals.supply * (1 - q.discountPct / 100))} />
              <Row label="Material margin" value={<span className={totals.marginPct < pricing.minMarginPct ? "font-semibold text-red-600" : "font-semibold text-emerald-600"}>{pct(totals.marginPct)}</span>} />
              <Row label="Erection (labour) value" value={money(totals.erection * (1 - q.discountPct / 100))} />
              <Row label="Markup used" value={pct(q.markupPct)} />
              <Row label="Minimum margin policy" value={pct(pricing.minMarginPct)} />
            </dl>
            {(below > 0 || lowMargin > 0) && (
              <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {below > 0 && `${below} line${below === 1 ? "" : "s"} below cost. `}{lowMargin > 0 && `${lowMargin} line${lowMargin === 1 ? "" : "s"} under ${pricing.minMarginPct}% margin.`}
              </p>
            )}
          </Card>
        )}

        <Card title={`Follow-ups (${fups.length})`} className={showCost ? "lg:col-span-2" : "lg:col-span-3"}>
          {fuWritable && q.status !== "draft" && (
            <details className="mb-4 rounded-lg border border-line p-3" open={open && fups.length === 0}>
              <summary className="cursor-pointer text-sm font-semibold text-brand-700">Log a follow-up</summary>
              <div className="mt-3"><FollowUpForm quotationId={id} back={back} idPrefix="fu" /></div>
            </details>
          )}
          {q.status === "draft" && <p className="mb-3 text-sm text-ink-soft">Follow-ups start once the quotation is marked as sent.</p>}
          {fups.length === 0 ? (
            <p className="text-sm text-ink-soft">No follow-ups logged yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-line pl-5">
              {fups.map(({ f, userName }) => (
                <li key={f.id} className="relative">
                  <span className="absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full border-2 border-surface bg-brand-500" aria-hidden />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-ink">{fmtDate(f.date)}</span>
                    <Badge tone="blue">{FOLLOWUP_MODE_LABEL[f.mode] ?? f.mode}</Badge>
                    {f.outcome && <Badge tone={OUTCOME_TONE[f.outcome] ?? "gray"}>{FOLLOWUP_OUTCOME_LABEL[f.outcome] ?? f.outcome}</Badge>}
                    <span className="text-xs text-ink-soft">by {userName ?? "—"}</span>
                  </div>
                  {f.notes && <p className="mt-1 whitespace-pre-line text-sm text-ink">{f.notes}</p>}
                  {f.nextDate && <p className="mt-0.5 text-xs text-ink-soft">Next follow-up: {fmtDate(f.nextDate)}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
}
