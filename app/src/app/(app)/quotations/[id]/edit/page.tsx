import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { boqTemplates, customers, quotations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canSeeCost, canWrite } from "@/lib/rbac";
import { todayIST } from "@/lib/format";
import { getPricingSettings } from "@/lib/pricing";
import { isEditableStatus } from "@/lib/quotations";
import { Flash, PageHeader, StatusBadge } from "@/components/ui";
import { saveQuotation } from "../../actions";
import { QuoteEditor } from "../../_components/quote-editor";
import { loadCatalog } from "../../_lib/data";
import { quotationGridLines } from "../../_lib/grid";

export const metadata = { title: "Edit quotation" };

export default async function EditQuotationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("quotations");
  if (!canWrite(user.role, "quotations")) redirect("/forbidden");
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await getDb();
  const sp = await searchParams;
  const [q] = await db.select().from(quotations).where(eq(quotations.id, id));
  if (!q) notFound();
  if (!isEditableStatus(q.status)) redirect(`/quotations/${id}?err=${encodeURIComponent(`A ${q.status} quotation can't be edited. Use Revise instead`)}`);
  const showCost = canSeeCost(user.role);
  const [[cust], tmplRows, pricing, catalog, lines] = await Promise.all([
    db.select({ name: customers.name, city: customers.city }).from(customers).where(eq(customers.id, q.customerId)),
    q.templateId ? db.select({ name: boqTemplates.name }).from(boqTemplates).where(eq(boqTemplates.id, q.templateId)) : Promise.resolve([]),
    getPricingSettings(db),
    loadCatalog(db, { withCost: showCost, markupPct: q.markupPct }),
    quotationGridLines(db, q, showCost),
  ]);

  return (
    <div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">Edit {q.number} <StatusBadge status={q.status} /></span>}
        subtitle={q.status !== "draft"
          ? "This quotation was already sent. Consider “Revise” to keep the sent version on record."
          : q.approvalStatus === "approved" ? "Only lines with a quantity are saved. Changing prices or quantities sends an approved quotation back for approval." : "Only lines with a quantity are saved."}
        back={{ href: `/quotations/${id}`, label: "Quotation" }}
      />
      <Flash ok={sp.ok} err={sp.err} />
      <QuoteEditor
        action={saveQuotation}
        back={`/quotations/${id}/edit`}
        header={{
          id: q.id, number: q.number, customerId: q.customerId, customerName: cust ? cust.name + (cust.city ? `, ${cust.city}` : "") : `Customer #${q.customerId}`,
          templateId: q.templateId, templateName: tmplRows[0]?.name ?? null,
          projectName: q.projectName ?? "", siteLocation: q.siteLocation ?? "", system: q.system ?? "",
          quoteDate: q.quoteDate, validUntil: q.validUntil ?? "", markupPct: q.markupPct, discountPct: q.discountPct, gstPct: q.gstPct,
          terms: q.terms ?? "", notes: q.notes ?? "",
        }}
        initialLines={lines}
        catalog={catalog}
        showCost={showCost}
        minMarginPct={pricing.minMarginPct}
        canChangeMarkup={showCost}
        today={todayIST()}
        approvalMode={pricing.approvalMode}
      />
    </div>
  );
}
