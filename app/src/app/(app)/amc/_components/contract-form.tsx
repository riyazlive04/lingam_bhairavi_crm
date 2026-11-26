"use client";
import { useMemo, useState } from "react";
import { Field, Input, Select, Textarea, cx } from "@/components/ui";
import { FormFooter, FormSection } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { money } from "@/lib/format";
import { createContract } from "../actions";

type Opt = { id: number; name: string };
export type ProjectOpt = { id: number; name: string; code: string; customerId: number; siteAddress: string | null; systems: string[] };
export type ScopePartsProp = { systems: Record<string, string>; coverage: Record<string, string>; footer: string };

/** Same composition as composeScope in @/lib/amc (kept here so the client bundle does not pull in the DB layer). */
function compose(parts: ScopePartsProp, systems: string[], coverage: string) {
  if (!systems.length) return "";
  const cov = parts.coverage[coverage] ?? parts.coverage.non_comprehensive;
  return [...systems.map((s) => parts.systems[s]).filter(Boolean), cov, parts.footer].map((l) => `- ${l}`).join("\n");
}

export function ContractForm(p: {
  customers: (Opt & { address: string | null })[];
  projects: ProjectOpt[];
  engineers: Opt[];
  systems: Record<string, string>;
  frequencies: Record<string, string>;
  coverage: Record<string, string>;
  scopeParts: ScopePartsProp;
  today: string;
  defaultEnd: string;
  initialCustomerId?: number;
  initialProjectId?: number;
}) {
  const initialProject = p.projects.find((x) => x.id === p.initialProjectId);
  const [customerId, setCustomerId] = useState<number>(initialProject?.customerId ?? p.initialCustomerId ?? 0);
  const [projectId, setProjectId] = useState<number>(initialProject?.id ?? 0);
  const [systems, setSystems] = useState<string[]>(initialProject?.systems ?? []);
  const [coverage, setCoverage] = useState("non_comprehensive");
  const [scope, setScope] = useState(() => compose(p.scopeParts, initialProject?.systems ?? [], "non_comprehensive"));
  const [scopeEdited, setScopeEdited] = useState(false);
  const [site, setSite] = useState(initialProject?.siteAddress ?? p.customers.find((c) => c.id === p.initialCustomerId)?.address ?? "");
  const [start, setStart] = useState(p.today);
  const [end, setEnd] = useState(p.defaultEnd);
  const [endEdited, setEndEdited] = useState(false);
  const [value, setValue] = useState("");
  const [freq, setFreq] = useState("quarterly");
  const [visits, setVisits] = useState("4");

  const customerProjects = useMemo(() => p.projects.filter((x) => x.customerId === customerId), [p.projects, customerId]);
  const refreshScope = (sys: string[], cov: string) => { if (!scopeEdited) setScope(compose(p.scopeParts, sys, cov)); };

  const onCustomer = (id: number) => {
    setCustomerId(id);
    setProjectId(0);
    setSite(p.customers.find((c) => c.id === id)?.address ?? "");
  };
  const onProject = (id: number) => {
    setProjectId(id);
    const pr = p.projects.find((x) => x.id === id);
    if (!pr) return;
    if (pr.siteAddress) setSite(pr.siteAddress);
    if (pr.systems.length) {
      const next = [...new Set([...systems, ...pr.systems])];
      setSystems(next);
      refreshScope(next, coverage);
    }
  };
  const toggle = (k: string) => {
    const next = systems.includes(k) ? systems.filter((s) => s !== k) : [...systems, k];
    const ordered = Object.keys(p.systems).filter((s) => next.includes(s));
    setSystems(ordered);
    refreshScope(ordered, coverage);
  };
  const onStart = (v: string) => {
    setStart(v);
    if (!endEdited && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const d = new Date(v + "T00:00:00Z");
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      d.setUTCDate(d.getUTCDate() - 1);
      setEnd(d.toISOString().slice(0, 10));
    }
  };
  const periods: Record<string, number> = { monthly: 12, quarterly: 4, half_yearly: 2, yearly: 1, one_time: 1 };
  const perPeriod = Number(value) > 0 ? Number(value) / (periods[freq] ?? 1) : 0;

  return (
    <form action={createContract} className="space-y-4">
      <FormSection title="Customer and site" description="Who the contract is with and where the systems are.">
          <Field label="Customer" required>
            <Select name="customerId" required value={customerId || ""} onChange={(e) => onCustomer(Number(e.target.value))}>
              <option value="" disabled>Select customer</option>
              {p.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Project" hint={customerId && !customerProjects.length ? "This customer has no projects. That is fine for AMCs on systems installed by others." : "Optional. Fills in the site and systems."}>
            <Select name="projectId" value={projectId || ""} onChange={(e) => onProject(Number(e.target.value))} disabled={!customerProjects.length}>
              <option value="">No project</option>
              {customerProjects.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
            </Select>
          </Field>
          <Field label="Site address" className="sm:col-span-2">
            <Textarea name="siteAddress" rows={2} maxLength={1000} value={site} onChange={(e) => setSite(e.target.value)} />
          </Field>
      </FormSection>

      <FormSection title="Systems covered" description="Tick every system we maintain. The scope fills in from your choice." columns={1}>
        <fieldset>
          <legend className="sr-only">Systems covered</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(p.systems).map(([k, label]) => {
              const on = systems.includes(k);
              return (
                <label key={k} className={cx("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm text-ink transition",
                  on ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40" : "border-line hover:border-line-strong")}>
                  <input type="checkbox" name="systems" value={k} checked={on} onChange={() => toggle(k)} className="icon-sm accent-brand-600" />
                  {label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <Field label="Scope of work" hint={scopeEdited ? "Edited by you. Changing systems will not overwrite it." : "Filled in from the systems and coverage. Edit freely."}>
          <Textarea name="scope" rows={7} maxLength={5000} value={scope} onChange={(e) => { setScope(e.target.value); setScopeEdited(true); }} />
        </Field>
      </FormSection>

      <FormSection title="Term and commercials" description="Dates, value, billing and how fast we respond to breakdowns.">
          <Field label="Start date" required><Input type="date" name="startDate" required value={start} onChange={(e) => onStart(e.target.value)} /></Field>
          <Field label="End date" required hint="Defaults to one year.">
            <Input type="date" name="endDate" required value={end} min={start} onChange={(e) => { setEnd(e.target.value); setEndEdited(true); }} />
          </Field>
          <Field label="Contract value (₹, excl. GST)" hint={perPeriod ? `${money(perPeriod)} per billing period` : undefined}>
            <Input type="number" name="value" min={0} step="0.01" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label="Billing frequency" required>
            <Select name="billingFrequency" value={freq} onChange={(e) => setFreq(e.target.value)}>
              {Object.entries(p.frequencies).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Preventive visits per year" required hint="Quarterly (4) is usual. Visits are spread evenly over the term.">
            <Input type="number" name="visitsPerYear" required min={0} max={52} step={1} inputMode="numeric" value={visits} onChange={(e) => setVisits(e.target.value)} />
          </Field>
          <Field label="Coverage" required>
            <Select name="coverage" value={coverage} onChange={(e) => { setCoverage(e.target.value); refreshScope(systems, e.target.value); }}>
              {Object.entries(p.coverage).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Breakdown response time (hours)" required hint="Service calls on this contract are due within this time.">
            <Input type="number" name="responseHours" required min={1} max={720} step={1} inputMode="numeric" defaultValue={24} />
          </Field>
          <Field label="Engineer">
            <Select name="engineerId" defaultValue="">
              <option value="">Unassigned</option>
              {p.engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={2} maxLength={5000} /></Field>
      </FormSection>

      <FormFooter cancelHref="/amc" note="Visits are planned for you as soon as the contract is saved.">
        <SubmitButton pendingText="Creating…">Create contract</SubmitButton>
      </FormFooter>
    </form>
  );
}
