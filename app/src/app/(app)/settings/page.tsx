import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { Card, Field, Flash, Input, Select, Textarea } from "@/components/ui";
import { APPROVAL_MODES, APPROVAL_MODE_LABEL } from "@/lib/pricing";
import { SubmitButton } from "@/components/submit-button";
import { savePricing, saveCompany } from "./actions";
import { readSetting, toCompanyForm, toPricingForm } from "./_lib/settings";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireUser("settings");
  const sp = await searchParams;
  const db = await getDb();
  const [companyRaw, pricingRaw] = await Promise.all([readSetting(db, "company"), readSetting(db, "pricing")]);
  const c = toCompanyForm(companyRaw);
  const p = toPricingForm(pricingRaw);

  return (
    <div className="space-y-6">
      <Flash ok={sp.ok} err={sp.err} />

      <form action={saveCompany}>
        <Card title="Company profile" actions={<span className="text-xs text-ink-soft">Used on quotations, invoices & emails</span>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" required><Input name="name" required maxLength={200} defaultValue={c.name} /></Field>
            <Field label="Tagline"><Input name="tagline" maxLength={200} defaultValue={c.tagline} /></Field>
            <Field label="Address" className="sm:col-span-2"><Textarea name="address" rows={2} maxLength={1000} defaultValue={c.address} /></Field>
            <Field label="GSTIN"><Input name="gstin" maxLength={15} defaultValue={c.gstin} className="uppercase" autoCapitalize="characters" /></Field>
            <Field label="Phone"><Input name="phone" type="tel" maxLength={60} defaultValue={c.phone} /></Field>
            <Field label="Email"><Input name="email" type="email" maxLength={160} defaultValue={c.email} /></Field>
            <Field label="Website"><Input name="website" maxLength={200} defaultValue={c.website} placeholder="https://" /></Field>
          </div>
          <h3 className="mt-6 mb-3 text-sm font-semibold text-ink">Bank details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account name"><Input name="bankAccountName" maxLength={120} defaultValue={c.bank.accountName} /></Field>
            <Field label="Bank name"><Input name="bankName" maxLength={120} defaultValue={c.bank.bankName} /></Field>
            <Field label="Account number"><Input name="bankAccountNo" maxLength={40} defaultValue={c.bank.accountNo} inputMode="numeric" /></Field>
            <Field label="IFSC"><Input name="bankIfsc" maxLength={11} defaultValue={c.bank.ifsc} className="uppercase" autoCapitalize="characters" /></Field>
            <Field label="Branch"><Input name="bankBranch" maxLength={120} defaultValue={c.bank.branch} /></Field>
          </div>
          <Field label="Default quotation terms" className="mt-6" hint="One term per line. Copied into each new quotation (can be edited per quotation).">
            <Textarea name="quoteTerms" rows={8} maxLength={10000} defaultValue={c.quoteTerms} />
          </Field>
          <div className="mt-4"><SubmitButton>Save company profile</SubmitButton></div>
        </Card>
      </form>

      <form action={savePricing} id="pricing">
        <Card title="Pricing defaults">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default markup over latest cost (%)" hint="Suggested supply rate = cost × (1 + markup)">
              <Input type="number" name="defaultMarkupPct" min={0} max={500} step="0.1" required defaultValue={p.defaultMarkupPct} />
            </Field>
            <Field label="Minimum margin (%)" hint="Quotes below this margin are flagged">
              <Input type="number" name="minMarginPct" min={0} max={100} step="0.1" required defaultValue={p.minMarginPct} />
            </Field>
            <Field label="GST (%)">
              <Input type="number" name="gstPct" min={0} max={100} step="0.01" required defaultValue={p.gstPct} />
            </Field>
            <Field label="Quotation validity (days)">
              <Input type="number" name="quoteValidityDays" min={1} max={365} step={1} required defaultValue={p.quoteValidityDays} />
            </Field>
            <Field label="Approval before sending" className="sm:col-span-2"
              hint="When a quotation needs approval, it can't be marked sent, emailed or marked won until an admin approves it. “Only below minimum margin” covers lines below cost or under the minimum margin.">
              <Select name="approvalMode" defaultValue={p.approvalMode}>
                {APPROVAL_MODES.map((m) => <option key={m} value={m}>{APPROVAL_MODE_LABEL[m]}{m === "below_margin" ? " (recommended)" : ""}</option>)}
              </Select>
            </Field>
          </div>
          <div className="mt-4"><SubmitButton>Save pricing</SubmitButton></div>
        </Card>
      </form>
    </div>
  );
}
