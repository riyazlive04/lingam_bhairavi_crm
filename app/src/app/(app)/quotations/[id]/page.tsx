import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import {
  CheckCircle2, Copy, FileSpreadsheet, GitBranch, Handshake, IndianRupee, Mail, MessageCircle, Pencil, Phone, Printer, RefreshCw, Send, Trash2, XCircle,
} from "lucide-react";
import { getDb } from "@/db";
import { auditLog, boqTemplates, customers, followUps, items, projects, quotationLines, quotations, salesOrders, users, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canSeeCost, canWrite } from "@/lib/rbac";
import { SYSTEMS, type SystemKey } from "@/lib/constants";
import { addDays, daysBetween, fmtDate, fmtDateTime, money, money0, pct, todayIST } from "@/lib/format";
import { approvalBlocks, approvalReasons, computeQuoteTotals, getPricingSettings, linePriceWarning, parseCostSource } from "@/lib/pricing";
import {
  FOLLOWUP_MODE_LABEL, FOLLOWUP_OUTCOME_LABEL, isEditableStatus, istDate, telLink, whatsappLink,
} from "@/lib/quotations";
import { Badge, EmptyState, Field, Flash, Input, LinkButton, Textarea, buttonClass } from "@/components/ui";
import {
  Callout, ConfirmButton, DetailPage, KeyValueGrid, MenuLink, MenuSeparator, MetaChip, SectionCard, StatusPill, StatusTimeline, SummaryRows, Tabs,
  activeTab, tabHref, type StatusSemantic, type TabItem,
} from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import {
  deleteDraft, duplicateQuotation, emailQuotation, markNegotiation, markSent, markWon, refreshPrices, reviseQuotation,
} from "../actions";
import { ApprovalPanel, type ApprovalHistoryEntry } from "../_components/approval-panel";
import { CostMeta } from "../_components/cost-meta";
import { FollowUpForm, LostForm } from "../_components/forms";
import { QuoteLinesTable } from "../_components/lines-table";

export const metadata = { title: "Quotation" };

const OUTCOME_SEMANTIC: Record<string, StatusSemantic> = { positive: "success", neutral: "neutral", negative: "danger", no_response: "warning" };
const link = "font-medium text-brand-700 hover:underline dark:text-brand-300";

type SP = { ok?: string; err?: string; action?: string; tab?: string };

export default async function QuotationDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
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
  const userIds = [q.approvalRequestedBy, q.approvedBy].filter((x): x is number => x != null);
  const vendorIds = [...new Set(lines.map((l) => l.costVendorId).filter((x): x is number => x != null))];
  const itemIds = [...new Set(lines.map((l) => l.itemId).filter((x): x is number => x != null))];
  const [approvers, vendorRows, itemRows, historyRows] = await Promise.all([
    userIds.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
    vendorIds.length ? db.select({ id: vendors.id, name: vendors.name }).from(vendors).where(inArray(vendors.id, vendorIds)) : Promise.resolve([]),
    itemIds.length ? db.select({ id: items.id, volatile: items.volatilePrice }).from(items).where(inArray(items.id, itemIds)) : Promise.resolve([]),
    db.select({ id: auditLog.id, at: auditLog.at, details: auditLog.details, userName: users.name }).from(auditLog).leftJoin(users, eq(users.id, auditLog.userId))
      .where(and(eq(auditLog.entityType, "quotation"), eq(auditLog.entityId, id), sql`${auditLog.details}->>'approval' is not null`))
      .orderBy(desc(auditLog.at), desc(auditLog.id)).limit(20),
  ]);
  const userName = new Map(approvers.map((u) => [u.id, u.name]));
  const vendorName = new Map(vendorRows.map((v) => [v.id, v.name]));
  const volatileItem = new Map(itemRows.map((i) => [i.id, i.volatile]));
  const history: ApprovalHistoryEntry[] = historyRows.map((h) => {
    const d = (h.details && typeof h.details === "object" ? h.details : {}) as Record<string, unknown>;
    return {
      id: h.id, at: h.at, userName: h.userName, status: String(d.approval ?? ""),
      note: typeof d.note === "string" && d.note ? d.note : null, reason: typeof d.reason === "string" ? d.reason : null,
    };
  });

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
  const reasons = isEditableStatus(q.status)
    ? approvalReasons(lines, { mode: pricing.approvalMode, minMarginPct: pricing.minMarginPct, discountPct: q.discountPct, gstPct: q.gstPct })
    : [];
  const sendBlocked = approvalBlocks(reasons.length > 0, q.approvalStatus);
  const waText = `Dear ${cust?.contactPerson || cust?.name || "Sir/Madam"}, this is regarding our quotation ${q.number}${q.projectName ? ` for ${q.projectName}` : ""} (₹${Math.round(q.grandTotal).toLocaleString("en-IN")}). Please let us know if you need any clarification. Regards, ${user.name}, Linga Bhairavi Enterprise`;
  const wa = whatsappLink(cust?.phone, waText);
  const tel = telLink(cust?.phone);
  const overdue = open && q.nextFollowUpDate && q.nextFollowUpDate < today;
  const expiredValidity = open && q.validUntil && q.validUntil < today;
  const showApproval = isEditableStatus(q.status) && (reasons.length > 0 || q.approvalStatus !== "not_required");

  // ------------------------------------------------------------------ tabs and the inline action forms (?action=)
  const tab = activeTab(sp.tab, ["lines", "follow-ups", "details"] as const);
  const tabParams = { tab: sp.tab };
  const relatedCount = orders.length + projs.length + family.length;
  const tabItems: TabItem[] = [
    { id: "lines", label: "Bill of quantities", count: totals.lineCount },
    { id: "follow-ups", label: "Follow-ups", count: fups.length, alert: !!overdue },
    { id: "details", label: "Details", count: relatedCount || undefined },
  ];
  const canWin = writable && editable && !sendBlocked;
  const canLose = writable && editable;
  const canEmail = writable && !sendBlocked;
  const action = sp.action === "won" && canWin ? "won" : sp.action === "lost" && canLose ? "lost" : sp.action === "email" && canEmail ? "email" : null;
  const actionHref = (a: "won" | "lost" | "email") => `${back}?action=${a}#${a}`;

  // ------------------------------------------------------------------ actions
  const editBtn = (variant: "primary" | "secondary") => (
    <LinkButton href={`/quotations/${id}/edit`} variant={variant}><Pencil className="icon-sm" aria-hidden /> Edit quotation</LinkButton>
  );
  const primary = !writable ? null
    : q.status === "draft" && !sendBlocked ? (
      <form action={markSent} title={`Schedules the first follow-up for ${fmtDate(addDays(today, 2))}`}>
        <input type="hidden" name="id" value={id} />
        <SubmitButton pendingText="Updating…"><Send className="icon-sm" aria-hidden /> Mark as sent</SubmitButton>
      </form>
    )
      : open && canWin ? <LinkButton href={actionHref("won")}><CheckCircle2 className="icon-sm" aria-hidden /> Mark won</LinkButton>
        : editable ? editBtn("primary")
          : null;
  const primaryIsEdit = writable && !(q.status === "draft" && !sendBlocked) && !(open && canWin) && editable;
  const secondary = (
    <>
      {writable && editable && !primaryIsEdit && editBtn("secondary")}
      {canEmail && <LinkButton href={actionHref("email")} variant="secondary"><Mail className="icon-sm" aria-hidden /> Email</LinkButton>}
      <LinkButton href={`/quotations/${id}/print`} variant="secondary"><Printer className="icon-sm" aria-hidden /> Print</LinkButton>
      <a href={`/quotations/${id}/export`} className={buttonClass("secondary")} download><FileSpreadsheet className="icon-sm" aria-hidden /> Download Excel</a>
    </>
  );
  const more = writable && (
    <>
      {q.status === "sent" && (
        <form action={markNegotiation}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton variant="ghost" pendingText="Updating…"><Handshake className="icon-sm" aria-hidden /> Mark negotiation</SubmitButton>
        </form>
      )}
      <form action={duplicateQuotation}>
        <input type="hidden" name="id" value={id} />
        <SubmitButton variant="ghost" pendingText="Copying…"><Copy className="icon-sm" aria-hidden /> Duplicate</SubmitButton>
      </form>
      {q.status !== "draft" && q.status !== "won" && (
        <form action={reviseQuotation}>
          <input type="hidden" name="id" value={id} />
          {open ? (
            <ConfirmButton variant="ghost" stacked pendingText="Revising…" confirmLabel="Yes, create revision"
              confirm="Create a new revision? This version will be marked superseded (expired).">
              <GitBranch className="icon-sm" aria-hidden /> Revise
            </ConfirmButton>
          ) : (
            <SubmitButton variant="ghost" pendingText="Revising…"><GitBranch className="icon-sm" aria-hidden /> Revise</SubmitButton>
          )}
        </form>
      )}
      {q.status === "draft" && (
        <form action={refreshPrices}>
          <input type="hidden" name="id" value={id} />
          <ConfirmButton variant="ghost" stacked pendingText="Refreshing…" confirmLabel="Yes, refresh prices"
            confirm="Re-price all item lines from the latest purchase costs (with their dates and suppliers) at this quotation's markup?">
            <RefreshCw className="icon-sm" aria-hidden /> Refresh prices
          </ConfirmButton>
        </form>
      )}
      {(canLose || q.status === "draft") && <MenuSeparator />}
      {canLose && <MenuLink href={actionHref("lost")} icon={XCircle} danger>Mark lost</MenuLink>}
      {q.status === "draft" && (
        <form action={deleteDraft}>
          <input type="hidden" name="id" value={id} />
          <ConfirmButton variant="ghost" className="text-danger" confirmVariant="danger" stacked pendingText="Deleting…" confirmLabel="Yes, delete draft"
            confirm="Delete this draft quotation permanently?">
            <Trash2 className="icon-sm" aria-hidden /> Delete draft
          </ConfirmButton>
        </form>
      )}
    </>
  );

  // ------------------------------------------------------------------ inline action forms
  const cancelAction = <LinkButton href={back} variant="ghost" size="sm">Cancel</LinkButton>;
  const actionCard = action === "won" ? (
    <SectionCard id="won" title="Mark won and create the sales order" icon={CheckCircle2} actions={cancelAction}
      description={`Contract value excluding GST: ${money(totals.taxable)}`}>
      <form action={markWon} className="space-y-4">
        <input type="hidden" name="id" value={id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer PO number"><Input name="customerPoNumber" maxLength={80} /></Field>
          <Field label="Customer PO date"><Input type="date" name="customerPoDate" defaultValue={today} max={today} /></Field>
          <Field label="Expected delivery"><Input type="date" name="expectedDelivery" min={today} /></Field>
          <Field label="Project name"><Input name="projectName" defaultValue={q.projectName ?? ""} maxLength={200} /></Field>
          {showCost && (
            <Field label="Project budget (₹)" hint={`Leave blank to use material cost plus erection (${money(totals.cost + totals.erection * (1 - q.discountPct / 100))})`}>
              <Input type="number" name="budget" min={0} step="0.01" inputMode="decimal" className="text-right" />
            </Field>
          )}
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink"><input type="checkbox" name="createProject" defaultChecked /> Also create a project</label>
        </div>
        <div className="flex justify-end">
          <SubmitButton pendingText="Creating order…" className="max-sm:w-full" confirm="Mark as won and create the sales order?">Mark won and create order</SubmitButton>
        </div>
      </form>
    </SectionCard>
  ) : action === "lost" ? (
    <SectionCard id="lost" title="Mark lost" icon={XCircle} actions={cancelAction} description="The reason helps when you review lost business later.">
      <LostForm quotationId={id} back={back} idPrefix="lost" />
    </SectionCard>
  ) : action === "email" ? (
    <SectionCard id="email" title="Email to customer" icon={Mail} actions={cancelAction}
      description={q.status === "draft" ? "The quotation is attached as a PDF and marked as sent." : "The quotation is attached as a PDF."}>
      <form action={emailQuotation} className="space-y-4">
        <input type="hidden" name="id" value={id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="To" required><Input type="email" name="to" defaultValue={cust?.email ?? ""} required maxLength={200} /></Field>
          <Field label="CC"><Input type="email" name="cc" maxLength={200} /></Field>
          <Field label="Message" className="sm:col-span-2" hint="Optional. A standard covering note is used if you leave this empty.">
            <Textarea name="message" rows={3} maxLength={2000} />
          </Field>
        </div>
        <div className="flex justify-end">
          <SubmitButton pendingText="Queuing…" className="max-sm:w-full"><Send className="icon-sm" aria-hidden /> Send email{q.status === "draft" ? " and mark sent" : ""}</SubmitButton>
        </div>
      </form>
    </SectionCard>
  ) : null;

  // ------------------------------------------------------------------ details
  const contact: ReactNode = cust?.phone || cust?.email ? (
    <span className="flex flex-wrap items-center gap-3">
      {tel && <a href={tel} className={`inline-flex items-center gap-1 ${link}`}><Phone className="icon-xs" aria-hidden />{cust?.phone}</a>}
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-success hover:underline"><MessageCircle className="icon-xs" aria-hidden />WhatsApp</a>}
      {cust?.email && <a href={`mailto:${cust.email}`} className={link}>{cust.email}</a>}
    </span>
  ) : null;
  const customerHref = canRead(user.role, "customers") ? `/customers/${q.customerId}` : undefined;

  return (
    <DetailPage
      back={{ href: "/quotations", label: "Quotations" }}
      eyebrow="Quotation"
      title={q.number}
      status={
        <>
          <StatusPill status={q.status} />
          {q.revision > 0 && <Badge tone="violet">Rev {q.revision}</Badge>}
          {editable && q.approvalStatus === "pending" && <StatusPill semantic="warning" label="Awaiting approval" noDot />}
          {editable && q.approvalStatus === "rejected" && <StatusPill semantic="danger" label="Not approved" noDot />}
        </>
      }
      meta={
        <>
          <MetaChip label="Customer" href={customerHref}>{cust?.name ?? "Unknown customer"}</MetaChip>
          {q.projectName && <MetaChip label="Project">{q.projectName}</MetaChip>}
          <MetaChip label="Value" icon={IndianRupee}>{money0(totals.grand)}</MetaChip>
          <MetaChip label="Valid until">{fmtDate(q.validUntil)}</MetaChip>
          {preparer?.name && <MetaChip label="By">{preparer.name}</MetaChip>}
        </>
      }
      primaryAction={primary}
      secondaryActions={secondary}
      moreActions={more || undefined}
      notices={
        <>
          <Flash ok={sp.ok} err={sp.err} />
          {writable && sendBlocked && (
            <Callout tone="warning" title={q.approvalStatus === "pending" ? "Waiting for approval" : "Needs approval before sending"}
              action={<LinkButton href="#approval" variant="secondary" size="sm">Review approval</LinkButton>}>
              Mark as sent, email and mark won unlock once an admin approves this quotation.
            </Callout>
          )}
          {expiredValidity && (
            <Callout tone="warning" title={`Validity ended on ${fmtDate(q.validUntil)}`}>
              Consider sending a revision with refreshed prices.
            </Callout>
          )}
          {overdue && (
            <Callout tone="danger" title={`Follow-up was due on ${fmtDate(q.nextFollowUpDate)}`}
              action={tab !== "follow-ups" && <LinkButton href={tabHref(back, tabParams, "follow-ups", "lines")} variant="secondary" size="sm">Log a call</LinkButton>}>
              Call or message the customer, then log what they said.
            </Callout>
          )}
        </>
      }
      tabs={<Tabs label="Quotation sections" basePath={back} params={tabParams} active={tab} items={tabItems} />}
      aside={
        <>
          {showApproval && (
            <ApprovalPanel
              quotationId={id} approvalStatus={q.approvalStatus} approvalNote={q.approvalNote}
              requestedAt={q.approvalRequestedAt} requestedByName={q.approvalRequestedBy ? userName.get(q.approvalRequestedBy) ?? null : null}
              decidedAt={q.approvedAt} decidedByName={q.approvedBy ? userName.get(q.approvedBy) ?? null : null}
              reasons={reasons} mode={pricing.approvalMode} editable={editable} canRequest={writable} isAdmin={user.role === "admin"} history={history}
            />
          )}
          <SectionCard title="Summary" icon={IndianRupee}>
            <SummaryRows rows={[
              ["Grand total", <span key="g" className="font-display text-heading font-bold">{money(totals.grand)}</span>],
              ["Taxable value", money(totals.taxable)],
              ["Lines", totals.lineCount],
              ["Sent", q.sentAt ? `${fmtDate(istDate(q.sentAt))} (${daysBetween(istDate(q.sentAt), today)} days ago)` : "Not yet"],
              ...(open ? [["Next follow-up", q.nextFollowUpDate
                ? <span key="n" className={overdue ? "text-danger" : undefined}>{fmtDate(q.nextFollowUpDate)}{overdue ? " (overdue)" : ""}</span>
                : <span key="n" className="text-warning">Not scheduled</span>] as [ReactNode, ReactNode]] : []),
            ]} />
            {writable && q.status === "draft" && !sendBlocked && (
              <p className="mt-3 text-caption text-ink-soft">Marking as sent schedules the first follow-up for {fmtDate(addDays(today, 2))}.</p>
            )}
          </SectionCard>
          {showCost && (
            <SectionCard title="Cost and margin" description="Internal only. Never printed or exported.">
              <SummaryRows rows={[
                ["Material cost (snapshot)", money(totals.cost)],
                ["Supply value (net of discount)", money(totals.supply * (1 - q.discountPct / 100))],
                ["Material margin", <span key="m" className={totals.marginPct < pricing.minMarginPct ? "text-danger" : "text-success"}>{pct(totals.marginPct)}</span>],
                ["Erection (labour) value", money(totals.erection * (1 - q.discountPct / 100))],
                ["Markup used", pct(q.markupPct)],
                ["Minimum margin policy", pct(pricing.minMarginPct)],
              ]} />
              {(below > 0 || lowMargin > 0) && (
                <Callout tone="warning" className="mt-3">
                  {below > 0 && `${below} line${below === 1 ? "" : "s"} below cost. `}{lowMargin > 0 && `${lowMargin} line${lowMargin === 1 ? "" : "s"} under ${pricing.minMarginPct}% margin.`}
                </Callout>
              )}
            </SectionCard>
          )}
        </>
      }
    >
      {actionCard}

      {tab === "lines" && (
        lines.length === 0 ? (
          <EmptyState title="No lines on this quotation" action={writable && editable && <LinkButton href={`/quotations/${id}/edit`}>Add lines</LinkButton>}>
            Open the quotation in the editor to add items from the master or free-text lines.
          </EmptyState>
        ) : (
          <>
            <QuoteLinesTable lines={lines} totals={totals} discountPct={q.discountPct} gstPct={q.gstPct}
              renderMeta={(l) => (l.itemId != null || l.costSource ? (
                <CostMeta cost={showCost ? l.costRate : null} costDate={l.costDate} vendorName={l.costVendorId ? vendorName.get(l.costVendorId) ?? null : null}
                  source={parseCostSource(l.costSource) ?? (l.itemId == null ? "manual" : null)} volatile={l.itemId != null ? volatileItem.get(l.itemId) ?? false : false} today={today} />
              ) : null)} />
            <p className="text-caption text-ink-faint">Cost dates and suppliers are for internal use only. They are not printed or exported to the customer.</p>
          </>
        )
      )}

      {tab === "follow-ups" && (
        <>
          {fuWritable && q.status !== "draft" && (
            <SectionCard title="Log a follow-up" icon={Phone}
              actions={(tel || wa) && (
                <>
                  {tel && <a href={tel} className={buttonClass("secondary", "sm")}><Phone className="icon-sm" aria-hidden /> Call</a>}
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}><MessageCircle className="icon-sm text-success" aria-hidden /> WhatsApp</a>}
                </>
              )}>
              <FollowUpForm quotationId={id} back={`${back}?tab=follow-ups`} idPrefix="fu" />
            </SectionCard>
          )}
          <SectionCard title="Follow-up history" count={fups.length}
            empty={fups.length === 0 && (q.status === "draft"
              ? "No follow-ups yet. They start once the quotation is marked as sent."
              : "No follow-ups logged yet. After you speak to the customer, log what they said.")}>
            <StatusTimeline items={fups.map(({ f, userName: by }) => ({
              id: f.id,
              title: <>{FOLLOWUP_MODE_LABEL[f.mode] ?? f.mode}{f.outcome && <span className="font-normal text-ink-soft"> · {FOLLOWUP_OUTCOME_LABEL[f.outcome] ?? f.outcome}</span>}</>,
              at: fmtDate(f.date),
              by: by ?? undefined,
              semantic: f.outcome ? OUTCOME_SEMANTIC[f.outcome] ?? "neutral" : "info",
              body: (f.notes || f.nextDate) ? (
                <>
                  {f.notes && <p className="whitespace-pre-line text-ink">{f.notes}</p>}
                  {f.nextDate && <p className="mt-0.5 text-caption">Next follow-up {fmtDate(f.nextDate)}</p>}
                </>
              ) : undefined,
            }))} />
          </SectionCard>
        </>
      )}

      {tab === "details" && (
        <>
          <SectionCard title="Quotation details">
            <KeyValueGrid items={[
              { label: "Customer", value: cust ? <>{customerHref ? <Link href={customerHref} className={link}>{cust.name}</Link> : cust.name}{cust.contactPerson ? <span className="font-normal text-ink-soft"> · {cust.contactPerson}</span> : null}</> : null },
              { label: "Contact", value: contact },
              { label: "Project", value: q.projectName },
              { label: "Site location", value: q.siteLocation },
              { label: "System", value: q.system ? SYSTEMS[q.system as SystemKey] ?? q.system : "Mixed" },
              { label: "BOQ template", value: tmpl ? (canRead(user.role, "boq") ? <Link href={`/boq-templates/${tmpl.id}`} className={link}>{tmpl.name}</Link> : tmpl.name) : "Blank" },
              { label: "Quotation date", value: fmtDate(q.quoteDate) },
              { label: "Valid until", value: fmtDate(q.validUntil) },
              { label: "Prepared by", value: preparer?.name },
              { label: "Sent", value: q.sentAt ? `${fmtDateTime(q.sentAt)} (${daysBetween(istDate(q.sentAt), today)} days ago)` : "Not yet" },
              ...(q.closedAt ? [{ label: "Closed", value: fmtDateTime(q.closedAt) }] : []),
              ...(q.lostReason ? [{ label: "Lost reason", value: q.lostReason, wide: true }] : []),
              ...(q.notes ? [{ label: "Internal notes", value: <span className="whitespace-pre-line font-normal">{q.notes}</span>, wide: true }] : []),
            ]} />
          </SectionCard>
          <SectionCard title="Related records" count={relatedCount}
            empty={relatedCount === 0 && "No sales order, project or other revision yet. Marking the quotation won creates the order."}>
            <KeyValueGrid columns={1} items={[
              ...(orders.length ? [{ label: "Sales order", value: <span className="flex flex-wrap gap-3">{orders.map((o) => <Link key={o.id} href={`/orders/${o.id}`} className={link}>{o.number}</Link>)}</span> }] : []),
              ...(projs.length ? [{ label: "Project", value: <span className="flex flex-wrap gap-3">{projs.map((p) => canRead(user.role, "projects") ? <Link key={p.id} href={`/projects/${p.id}`} className={link}>{p.code} · {p.name}</Link> : <span key={p.id}>{p.code} · {p.name}</span>)}</span> }] : []),
              ...(family.length ? [{ label: "Other revisions", value: (
                <span className="flex flex-wrap gap-x-4 gap-y-2">
                  {family.map((f) => <span key={f.id} className="inline-flex items-center gap-1.5"><Link href={`/quotations/${f.id}`} className={link}>{f.number}</Link><StatusPill status={f.status} /></span>)}
                </span>
              ) }] : []),
            ]} />
          </SectionCard>
        </>
      )}
    </DetailPage>
  );
}
