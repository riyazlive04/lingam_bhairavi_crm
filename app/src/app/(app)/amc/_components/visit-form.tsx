"use client";
import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { recordVisit } from "../actions";

type Section = { key: string; title: string; items: string[] };
type Result = { item: string; ok: boolean; remark?: string };
type Answer = { ok: boolean | null; remark: string; open?: boolean };

/** Mobile-first visit report: OK / Not OK + remark per checklist item, findings and sign-off. */
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

  return (
    <form action={recordVisit} className="space-y-6">
      <input type="hidden" name="contractId" value={p.contractId} />
      <input type="hidden" name="visitId" value={p.visitId} />
      <input type="hidden" name="checklist" value={JSON.stringify(payload)} />

      <div className="sticky top-[4.5rem] z-10 -mx-1 rounded-xl border border-line bg-surface/95 px-3 py-2 text-sm shadow-sm backdrop-blur">
        <span className="font-semibold text-ink">{answered.length} of {allKeys.length}</span> <span className="text-ink-soft">items checked</span>
        {notOk > 0 && <span className="ml-2 font-medium text-red-600">{notOk} not OK</span>}
      </div>

      {sections.length === 0 && (
        <p className="rounded-xl border border-dashed border-line-strong p-4 text-sm text-ink-soft">This contract has no systems with a standard checklist. Write what was checked in the findings below.</p>
      )}

      {sections.map((s) => (
        <Card key={s.key} title={s.title} bodyClassName="p-0"
          actions={<button type="button" className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-muted dark:text-brand-300"
            onClick={() => setAnswers((a) => { const n = { ...a }; for (const i of s.items) { const k = keyOf(s, i); if (n[k]?.ok == null) n[k] = { ok: true, remark: n[k]?.remark ?? "" }; } return n; })}>
            Mark rest OK
          </button>}>
          <ul className="divide-y divide-line">
            {s.items.map((i) => {
              const k = keyOf(s, i);
              const a = answers[k];
              return (
                <li key={k} className={cx("px-4 py-3 sm:px-5", a?.ok === false && "bg-red-50/60 dark:bg-red-950/20")}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-ink">{i}</span>
                    <div className="flex shrink-0 gap-2" role="group" aria-label={`${i}: result`}>
                      <button type="button" aria-pressed={a?.ok === true} onClick={() => set(k, { ok: a?.ok === true ? null : true })}
                        className={cx("inline-flex h-10 min-w-20 items-center justify-center gap-1 rounded-lg border px-3 text-sm font-medium transition",
                          a?.ok === true ? "border-emerald-600 bg-emerald-600 text-white" : "border-line text-ink-soft hover:border-line-strong")}>
                        <Check className="h-4 w-4" aria-hidden /> OK
                      </button>
                      <button type="button" aria-pressed={a?.ok === false} onClick={() => set(k, { ok: a?.ok === false ? null : false })}
                        className={cx("inline-flex h-10 min-w-24 items-center justify-center gap-1 rounded-lg border px-3 text-sm font-medium transition",
                          a?.ok === false ? "border-red-600 bg-red-600 text-white" : "border-line text-ink-soft hover:border-line-strong")}>
                        <X className="h-4 w-4" aria-hidden /> Not OK
                      </button>
                    </div>
                  </div>
                  {(a?.ok === false || a?.remark || a?.open) && (
                    <Input className="mt-2" value={a?.remark ?? ""} maxLength={300} placeholder={a?.ok === false ? "What is wrong? e.g. gland leaking, needs replacement" : "Remark"}
                      aria-label={`${i}: remark`} onChange={(e) => set(k, { remark: e.target.value })} />
                  )}
                  {a?.ok === true && !a.remark && !a.open && (
                    <button type="button" className="mt-1 text-xs text-ink-soft hover:text-brand-700" onClick={() => set(k, { open: true })}>Add remark</button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      <Card title="Report">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Visit date" required><Input type="date" name="doneDate" required defaultValue={p.doneDate ?? p.today} max={p.today} /></Field>
          <Field label="Engineer">
            {p.canPickEngineer ? (
              <Select name="engineerId" defaultValue={p.engineerId ?? ""}>
                <option value="">Not recorded</option>
                {p.engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            ) : (
              <Input readOnly disabled value={p.engineers.find((e) => e.id === p.engineerId)?.name ?? "Me"} />
            )}
          </Field>
          <Field label="Findings" className="sm:col-span-2" hint="What you saw on site, readings taken, faults found.">
            <Textarea name="findings" rows={4} maxLength={5000} defaultValue={p.findings ?? ""} />
          </Field>
          <Field label="Recommendations" className="sm:col-span-2" hint="Repairs or spares to quote, actions for the customer.">
            <Textarea name="recommendations" rows={3} maxLength={5000} defaultValue={p.recommendations ?? ""} />
          </Field>
          <Field label="Customer sign-off (name)" className="sm:col-span-2">
            <Input name="customerSignoff" maxLength={120} defaultValue={p.customerSignoff ?? ""} placeholder="Name of the person who accepted the visit" autoComplete="off" />
          </Field>
        </div>
      </Card>

      <SubmitButton size="lg" className="w-full sm:w-auto" pendingText="Saving report...">Save visit report</SubmitButton>
    </form>
  );
}
