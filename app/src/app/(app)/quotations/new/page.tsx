import { redirect } from "next/navigation";
import { ChevronRight, FileSpreadsheet, UserPlus } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { boqTemplates, customers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canSeeCost, canWrite } from "@/lib/rbac";
import { SYSTEMS, type SystemKey } from "@/lib/constants";
import { addDays, todayIST } from "@/lib/format";
import { getPricingSettings } from "@/lib/pricing";
import { getCompanySettings } from "@/lib/quotations";
import { Field, Flash, Input, LinkButton, Select } from "@/components/ui";
import { Callout, FormFooter, FormPage, FormSection } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { startQuotation, saveQuotation } from "../actions";
import { QuoteEditor } from "../_components/quote-editor";
import { loadCatalog } from "../_lib/data";
import { refillGridLines, templateGridLines } from "../_lib/grid";

export const metadata = { title: "New quotation" };

type SP = {
  step?: string; customerId?: string; templateId?: string; markup?: string; validity?: string;
  projectName?: string; site?: string; err?: string; ok?: string; source?: string; assetIds?: string;
};

const posInt = (v: string | undefined) => {
  const x = Number(v);
  return Number.isInteger(x) && x > 0 ? x : null;
};
const numIn = (v: string | undefined, fallback: number, min: number, max: number) => {
  const x = Number(v);
  return v != null && v !== "" && Number.isFinite(x) && x >= min && x <= max ? x : fallback;
};

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("quotations");
  if (!canWrite(user.role, "quotations")) redirect("/forbidden");
  const db = await getDb();
  const sp = await searchParams;
  const pricing = await getPricingSettings(db);
  const customerId = posInt(sp.customerId);
  const templateId = posInt(sp.templateId);
  const markup = numIn(sp.markup, pricing.defaultMarkupPct, 0, 500);
  const validity = Math.round(numIn(sp.validity, pricing.quoteValidityDays, 1, 365));

  // Coming from the Refill Tracker (?source=refill&assetIds=1,2,3) → skip step 1 and pre-fill refill lines.
  const refillAssetIds = sp.source === "refill"
    ? (sp.assetIds ?? "").split(",").map((s) => posInt(s.trim())).filter((x): x is number => x != null)
    : [];

  // ------------------------------------------------------------ step 2: BOQ grid
  if ((sp.step === "2" || refillAssetIds.length > 0) && customerId) {
    const [cust] = await db.select({ id: customers.id, name: customers.name, city: customers.city }).from(customers).where(eq(customers.id, customerId));
    if (!cust) redirect(`/quotations/new?err=${encodeURIComponent("Customer not found")}`);
    const [tmpl] = templateId ? await db.select().from(boqTemplates).where(eq(boqTemplates.id, templateId)) : [];
    const showCost = canSeeCost(user.role);
    const [catalog, tmplLines, refillLines, company] = await Promise.all([
      loadCatalog(db, { withCost: showCost, markupPct: markup }),
      tmpl ? templateGridLines(db, tmpl.id, markup, showCost) : Promise.resolve([]),
      refillGridLines(db, cust.id, refillAssetIds, markup, showCost),
      getCompanySettings(db),
    ]);
    const lines = [...refillLines, ...tmplLines];
    const today = todayIST();
    const back = `/quotations/new?${new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "err" && k !== "ok" && typeof v === "string") as [string, string][]).toString()}`;
    const step1 = `/quotations/new?${new URLSearchParams({ customerId: String(cust.id), ...(templateId ? { templateId: String(templateId) } : {}) }).toString()}`;
    return (
      <FormPage
        width="wide"
        eyebrow="Step 2 of 2"
        title="Enter quantities"
        subtitle={<>{cust.name}{tmpl ? <> · {tmpl.name}</> : " · blank quotation"}. Only lines with a quantity are saved.</>}
        back={{ href: step1, label: "Back to step 1" }}
        notices={<Flash err={sp.err} />}
      >
        <QuoteEditor
          action={saveQuotation}
          back={back}
          header={{
            customerId: cust.id, customerName: cust.name + (cust.city ? `, ${cust.city}` : ""),
            templateId: tmpl?.id ?? null, templateName: tmpl?.name ?? null,
            projectName: sp.projectName ?? "", siteLocation: sp.site ?? cust.city ?? "",
            system: tmpl?.system ?? "", quoteDate: today, validUntil: addDays(today, validity),
            markupPct: markup, discountPct: 0, gstPct: pricing.gstPct, terms: company.quoteTerms, notes: "",
          }}
          initialLines={lines}
          catalog={catalog}
          showCost={showCost}
          minMarginPct={pricing.minMarginPct}
          canChangeMarkup={showCost}
          today={today}
          approvalMode={pricing.approvalMode}
          cancelHref={step1}
        />
      </FormPage>
    );
  }

  // ------------------------------------------------------------ step 1: customer / project / template
  const [custs, templates] = await Promise.all([
    db.select({ id: customers.id, name: customers.name, city: customers.city }).from(customers).where(eq(customers.active, true)).orderBy(asc(customers.name)),
    db.select({ id: boqTemplates.id, name: boqTemplates.name, system: boqTemplates.system }).from(boqTemplates).where(eq(boqTemplates.active, true)).orderBy(asc(boqTemplates.system), asc(boqTemplates.name)),
  ]);
  const bySystem = new Map<string, typeof templates>();
  for (const t of templates) bySystem.set(t.system, [...(bySystem.get(t.system) ?? []), t]);

  return (
    <FormPage
      eyebrow="Step 1 of 2"
      title="New quotation"
      subtitle="Choose the customer, the project and a standard BOQ. You enter quantities in the next step."
      back={{ href: "/quotations", label: "Quotations" }}
      notices={
        <>
          <Flash err={sp.err} ok={sp.ok} />
          <Callout tone="info" icon={FileSpreadsheet} title="Have the consultant's Excel?"
            action={<LinkButton href="/boq-import" variant="secondary" size="sm">Import BOQ instead</LinkButton>}>
            Upload it and each row is matched to your items with the latest price.
          </Callout>
        </>
      }
    >
      <form action={startQuotation} className="space-y-4">
        <FormSection title="Customer" description="Pick an existing customer, or add a new one here.">
          <Field label="Existing customer" className="sm:col-span-2" hint="Or leave this empty and add a new customer below">
            <Select name="customerId" defaultValue={customerId ?? ""}>
              <option value="">Select a customer</option>
              {custs.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? `, ${c.city}` : ""}</option>)}
            </Select>
          </Field>
          <details className="group rounded-xl border border-line sm:col-span-2">
            <summary className="flex cursor-pointer select-none items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-muted dark:text-brand-300">
              <UserPlus className="icon-sm" aria-hidden /> Add a new customer instead
            </summary>
            <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
              <Field label="Customer name" hint="If filled, a new customer is created and used for this quotation">
                <Input name="newName" maxLength={200} autoComplete="organization" />
              </Field>
              <Field label="Phone">
                <Input name="newPhone" type="tel" maxLength={30} inputMode="tel" placeholder="98XXXXXXXX" />
              </Field>
              <Field label="Email">
                <Input name="newEmail" type="email" maxLength={160} />
              </Field>
              <Field label="City">
                <Input name="newCity" maxLength={80} defaultValue="Hosur" />
              </Field>
            </div>
          </details>
        </FormSection>

        <FormSection title="Project and BOQ" description="Every line of the template appears in the next step. Lines left at zero are not saved.">
          <Field label="Project name">
            <Input name="projectName" maxLength={200} defaultValue={sp.projectName} placeholder="For example: hydrant and sprinkler for new warehouse" />
          </Field>
          <Field label="Site location">
            <Input name="siteLocation" maxLength={200} defaultValue={sp.site} placeholder="For example: SIPCOT Phase II, Hosur" />
          </Field>
          <Field label="Standard BOQ template" className="sm:col-span-2">
            <Select name="templateId" defaultValue={templateId ?? ""}>
              <option value="">Blank quotation (add items yourself)</option>
              {[...bySystem.entries()].map(([sys, list]) => (
                <optgroup key={sys} label={SYSTEMS[sys as SystemKey] ?? sys}>
                  {list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="Markup % over latest cost" hint={`Default ${pricing.defaultMarkupPct}% from pricing settings`} required>
            <Input name="markupPct" type="number" inputMode="decimal" min={0} max={500} step="0.5" defaultValue={markup} required className="text-right" />
          </Field>
          <Field label="Validity (days)" required>
            <Input name="validityDays" type="number" inputMode="numeric" min={1} max={365} step={1} defaultValue={validity} required className="text-right" />
          </Field>
        </FormSection>

        <FormFooter cancelHref="/quotations">
          <SubmitButton pendingText="Loading BOQ…">Next: enter quantities <ChevronRight className="icon-sm" aria-hidden /></SubmitButton>
        </FormFooter>
      </form>
    </FormPage>
  );
}
