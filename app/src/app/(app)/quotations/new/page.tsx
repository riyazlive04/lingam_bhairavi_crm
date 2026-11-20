import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { boqTemplates, customers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canSeeCost, canWrite } from "@/lib/rbac";
import { SYSTEMS, type SystemKey } from "@/lib/constants";
import { addDays, todayIST } from "@/lib/format";
import { getPricingSettings } from "@/lib/pricing";
import { getCompanySettings } from "@/lib/quotations";
import { Card, Field, Flash, Input, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { startQuotation, saveQuotation } from "../actions";
import { QuoteEditor } from "../_components/quote-editor";
import { loadCatalog } from "../_lib/data";
import { templateGridLines } from "../_lib/grid";

export const metadata = { title: "New quotation" };

type SP = {
  step?: string; customerId?: string; templateId?: string; markup?: string; validity?: string;
  projectName?: string; site?: string; err?: string; ok?: string;
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

  // ------------------------------------------------------------ step 2: BOQ grid
  if (sp.step === "2" && customerId) {
    const [cust] = await db.select({ id: customers.id, name: customers.name, city: customers.city }).from(customers).where(eq(customers.id, customerId));
    if (!cust) redirect(`/quotations/new?err=${encodeURIComponent("Customer not found")}`);
    const [tmpl] = templateId ? await db.select().from(boqTemplates).where(eq(boqTemplates.id, templateId)) : [];
    const showCost = canSeeCost(user.role);
    const [catalog, lines, company] = await Promise.all([
      loadCatalog(db, { withCost: showCost, markupPct: markup }),
      tmpl ? templateGridLines(db, tmpl.id, markup, showCost) : Promise.resolve([]),
      getCompanySettings(db),
    ]);
    const today = todayIST();
    const back = `/quotations/new?${new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "err" && k !== "ok" && typeof v === "string") as [string, string][]).toString()}`;
    return (
      <div>
        <PageHeader
          title="New quotation — enter quantities"
          subtitle={<>Step 2 of 2 · {cust.name}{tmpl ? <> · {tmpl.name}</> : " · blank quotation"}. Only lines with a quantity are saved.</>}
          back={{ href: `/quotations/new?${new URLSearchParams({ customerId: String(cust.id), ...(templateId ? { templateId: String(templateId) } : {}) }).toString()}`, label: "Back to step 1" }}
        />
        <Flash err={sp.err} />
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
        />
      </div>
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
    <div>
      <PageHeader title="New quotation" subtitle="Step 1 of 2 · customer, project and standard BOQ" back={{ href: "/quotations", label: "Quotations" }} />
      <Flash err={sp.err} ok={sp.ok} />
      <form action={startQuotation} className="space-y-6">
        <Card title="Customer">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Existing customer" className="sm:col-span-2" hint="Or leave this empty and quick-create a new customer below">
              <Select name="customerId" defaultValue={customerId ?? ""}>
                <option value="">— Select customer —</option>
                {custs.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ""}</option>)}
              </Select>
            </Field>
          </div>
          <details className="mt-4 rounded-lg border border-line p-4">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">+ Quick-create a new customer</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
        </Card>

        <Card title="Project & BOQ">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project name">
              <Input name="projectName" maxLength={200} defaultValue={sp.projectName} placeholder="e.g. Hydrant & sprinkler for new warehouse" />
            </Field>
            <Field label="Site location">
              <Input name="siteLocation" maxLength={200} defaultValue={sp.site} placeholder="e.g. SIPCOT Phase II, Hosur" />
            </Field>
            <Field label="Standard BOQ template" className="sm:col-span-2" hint="All lines of the template appear in the next step — enter quantities; zero-qty lines are left out.">
              <Select name="templateId" defaultValue={templateId ?? ""}>
                <option value="">Blank quotation (add items manually)</option>
                {[...bySystem.entries()].map(([sys, list]) => (
                  <optgroup key={sys} label={SYSTEMS[sys as SystemKey] ?? sys}>
                    {list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Field label="Markup % over latest cost" hint={`Default ${pricing.defaultMarkupPct}% from pricing settings`}>
              <Input name="markupPct" type="number" min={0} max={500} step="0.5" defaultValue={markup} required />
            </Field>
            <Field label="Validity (days)">
              <Input name="validityDays" type="number" min={1} max={365} step={1} defaultValue={validity} required />
            </Field>
          </div>
        </Card>
        <div className="flex justify-end">
          <SubmitButton pendingText="Loading BOQ…">Next: enter quantities →</SubmitButton>
        </div>
      </form>
    </div>
  );
}
