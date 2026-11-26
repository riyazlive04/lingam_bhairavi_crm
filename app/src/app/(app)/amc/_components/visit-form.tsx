"use client";
import { useMemo, useState } from "react";
import { Check, CheckCheck, X } from "lucide-react";
import { Field, Input, Select, Textarea, cx } from "@/components/ui";
import { Callout, FormFooter, FormSection, SectionCard } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { recordVisit } from "../actions";

type Section = { key: string; title: string; items: string[] };
type Result = { item: string; ok: boolean; remark?: string };
type Answer = { ok: boolean | null; remark: string; open?: boolean };

/**
 * Mobile-first visit report: OK / Not OK + remark per checklist item, findings and sign-off.
 * Built for a phone on site: one column, 44px tap targets, progress pinned at the top, save pinned at the bottom.
 */
export function VisitForm(p: {
  contractId: number;
  visitId: number;
  sections: Section[];
  existing: Result[];
  today: string;
  doneDate?: string | null;
  engineers: { id: number; name: string }[];
  engineerId?: number | null;
  canPickEngineer: boolean;
  findings?: string | null;
  recommendations?: string | null;
  customerSignoff?: string | null;
  cancelHref: string;
}) {
  // stored item = "Section: item"; existing results whose item is no longer on the list are kept under "Other"
  const sections = useMemo(() => {
    const known = new Set(p.sections.flatMap((s) => s.items.map((i) => `${s.title}: ${i}`)));
    const extra = p.existing.filter((r) => !known.has(r.item)).map((r) => r.item);
    return extra.length ? [...p.sections, { key: "other", title: "Other", items: extra, raw: true }] : p.sections;
  }, [p.sections, p.existing]);
  const keyOf = (s: Section & { raw?: boolean }, item: string) => (s.raw ? item : `${s.title}: ${item}`);

  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    const init: Record<string, Answer> = {};
    for (const r of p.existing) init[r.item] = { ok: r.ok, remark: r.remark ?? "" };
    return init;
  });
  const set = (k: string, patch: Partial<Answer>) => setAnswers((a) => ({ ...a, [k]: { ok: a[k]?.ok ?? null, remark: a[k]?.remark ?? "", ...patch } }));
  const allKeys = sections.flatMap((s) => s.items.map((i) => keyOf(s, i)));
  const answered = allKeys.filter((k) => answers[k]?.ok != null);
  const notOk = answered.filter((k) => answers[k]?.ok === false).length;
  const payload: Result[] = answered.map((k) => ({ item: k, ok: !!answers[k].ok, ...(answers[k].remark.trim() ? { remark: answers[k].remark.trim() } : {}) }));
  const pctDone = allKeys.length ? Math.round((answered.length / allKeys.length) * 100) : 0;

  return (
    <form action={recordVisit} className="space-y-4">
      <input type="hidden" name="contractId" value={p.contractId} />
      <input type="hidden" name="visitId" value={p.visitId} />
      <input type="hidden" name="checklist" value={JSON.stringify(payload)} />

      {allKeys.length > 0 && (
        <div className="sticky top-16 z-10 rounded-xl border border-line bg-surface/95 px-4 py-2.5 shadow-sm backdrop-blur-md" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span><span className="font-semibold text-ink tabular-nums">{answered.length} of {allKeys.length}</span> <span className="text-ink-soft">items checked</span></span>
            {notOk > 0 && <span className="font-medium text-danger tabular-nums">{notOk} not OK</span>}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${pctDone}%` }} />
          </div>
        </div>
      )}

      {sections.length === 0 && (
        <Callout tone="info" title="No standard checklist">This contract has no systems with a standard checklist. Write what was checked in the findings below.</Callout>
      )}

      {sections.map((s) => (
        <SectionCard key={s.key} title={s.title} flush
          actions={
            <button type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-brand-700 hover:bg-muted dark:text-brand-300"
              onClick={() => setAnswers((a) => { const n = { ...a }; for (const i of s.items) { const k = keyOf(s, i); if (n[k]?.ok == null) n[k] = { ok: true, remark: n[k]?.remark ?? "" }; } return n; })}>
              <CheckCheck className="icon-sm" aria-hidden /> Mark rest OK
            </button>
          }>
          <ul className="divide-y divide-line">
            {s.items.map((i) => {
              const k = keyOf(s, i);
              const a = answers[k];
              return (
                <li key={k} className={cx("px-4 py-3 sm:px-5", a?.ok === false && "bg-danger-soft")}>
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-ink">{i}</span>
                    <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex" role="group" aria-label={`${i}: result`}>
                      <button type="button" aria-pressed={a?.ok === true} onClick={() => set(k, { ok: a?.ok === true ? null : true })}
                        className={cx("inline-flex h-11 min-w-24 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition",
                          a?.ok === true ? "border-success bg-success-soft text-success ring-1 ring-inset ring-success" : "border-line bg-surface text-ink-soft hover:border-line-strong")}>
                        <Check className="icon-sm" aria-hidden /> OK
                      </button>
                      <button type="button" aria-pressed={a?.ok === false} onClick={() => set(k, { ok: a?.ok === false ? null : false })}
                        className={cx("inline-flex h-11 min-w-24 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition",
                          a?.ok === false ? "border-danger bg-danger-soft text-danger ring-1 ring-inset ring-danger" : "border-line bg-surface text-ink-soft hover:border-line-strong")}>
                        <X className="icon-sm" aria-hidden /> Not OK
                      </button>
                    </div>
                  </div>
                  {(a?.ok === false || a?.remark || a?.open) && (
                    <Input className="mt-2.5 h-11" value={a?.remark ?? ""} maxLength={300} placeholder={a?.ok === false ? "What is wrong? e.g. gland leaking, needs replacement" : "Remark"}
                      aria-label={`${i}: remark`} onChange={(e) => set(k, { remark: e.target.value })} />
                  )}
                  {a?.ok === true && !a.remark && !a.open && (
                    <button type="button" className="mt-1 inline-flex h-9 items-center rounded-md px-1 text-caption font-medium text-ink-soft hover:text-brand-700 dark:hover:text-brand-300" onClick={() => set(k, { open: true })}>Add remark</button>
                  )}
                </li>
              );
            })}
          </ul>
        </SectionCard>
      ))}

      <FormSection title="Report" description="What you found on site and who accepted the visit.">
        <Field label="Visit date" required><Input type="date" name="doneDate" required defaultValue={p.doneDate ?? p.today} max={p.today} className="h-11" /></Field>
        <Field label="Engineer">
          {p.canPickEngineer ? (
            <Select name="engineerId" defaultValue={p.engineerId ?? ""} className="h-11">
              <option value="">Not recorded</option>
              {p.engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          ) : (
            <Input readOnly disabled value={p.engineers.find((e) => e.id === p.engineerId)?.name ?? "Me"} className="h-11" />
          )}
        </Field>
        <Field label="Findings" className="sm:col-span-2" hint="What you saw on site, readings taken, faults found.">
          <Textarea name="findings" rows={4} maxLength={5000} defaultValue={p.findings ?? ""} />
        </Field>
        <Field label="Recommendations" className="sm:col-span-2" hint="Repairs or spares to quote, actions for the customer.">
          <Textarea name="recommendations" rows={3} maxLength={5000} defaultValue={p.recommendations ?? ""} />
        </Field>
        <Field label="Customer sign-off (name)" className="sm:col-span-2">
          <Input name="customerSignoff" maxLength={120} defaultValue={p.customerSignoff ?? ""} placeholder="Name of the person who accepted the visit" autoComplete="off" className="h-11" />
        </Field>
      </FormSection>

      <FormFooter cancelHref={p.cancelHref}
        note={allKeys.length > 0 ? `${answered.length} of ${allKeys.length} checked${notOk ? ` · ${notOk} not OK` : ""}` : undefined}>
        <SubmitButton size="lg" pendingText="Saving report…">Save visit report</SubmitButton>
      </FormFooter>
    </form>
  );
}
