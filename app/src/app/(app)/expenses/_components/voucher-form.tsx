"use client";
import { useState } from "react";
import { Plus, Split, Trash2 } from "lucide-react";
import { Button, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type ProjectOpt = { id: number; code: string; name: string };
type Row = { key: number; projectId: string; amount: string };
export type VoucherInitial = {
  id?: number;
  date: string;
  category: string;
  amount: string;
  paidTo: string;
  billRef: string;
  description: string;
  allocations: { projectId: number; amount: number }[];
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);

/** Mobile-first expense voucher with multi-project allocation (manual or equal split). */
export function VoucherForm({
  action, projects, categories, initial, maxDate,
}: {
  action: (fd: FormData) => Promise<void>;
  projects: ProjectOpt[];
  categories: Record<string, string>;
  initial: VoucherInitial;
  maxDate: string;
}) {
  const [amount, setAmount] = useState(initial.amount);
  const [rows, setRows] = useState<Row[]>(() =>
    initial.allocations.length
      ? initial.allocations.map((a, i) => ({ key: i + 1, projectId: String(a.projectId), amount: a.amount ? String(a.amount) : "" }))
      : [{ key: 1, projectId: "", amount: "" }],
  );
  const [nextKey, setNextKey] = useState(rows.length + 1);

  const total = Number(amount) || 0;
  const active = rows.filter((r) => r.projectId);
  // a single project row with a blank amount takes the full voucher amount
  const effective = active.length === 1 && !active[0].amount ? [{ ...active[0], amount: String(total) }] : active;
  const allocated = r2(effective.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const diff = r2(total - allocated);
  const dupes = new Set(active.map((r) => r.projectId)).size !== active.length;
  const mismatch = active.length > 0 && Math.abs(diff) > 0.01;
  const payload = JSON.stringify(effective.map((r) => ({ projectId: Number(r.projectId), amount: r2(Number(r.amount) || 0) })));

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => { setRows((rs) => [...rs, { key: nextKey, projectId: "", amount: "" }]); setNextKey((k) => k + 1); };
  const removeRow = (key: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [{ key: nextKey, projectId: "", amount: "" }]));
  const splitEqually = () => {
    const sel = rows.filter((r) => r.projectId);
    if (!sel.length || !total) return;
    const paise = Math.round(total * 100);
    const base = Math.floor(paise / sel.length);
    let extra = paise - base * sel.length; // distribute leftover paise to the first rows
    const amounts = new Map<number, string>();
    for (const r of sel) {
      const p = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
      amounts.set(r.key, (p / 100).toFixed(2));
    }
    setRows((rs) => rs.map((r) => (amounts.has(r.key) ? { ...r, amount: amounts.get(r.key)! } : r)));
  };

  return (
    <form action={action} className="space-y-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="allocations" value={payload} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" required>
          <Input type="date" name="date" required defaultValue={initial.date} max={maxDate} />
        </Field>
        <Field label="Category" required>
          <Select name="category" required defaultValue={initial.category}>
            <option value="" disabled>Select…</option>
            {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Amount (₹)" required>
          <Input
            type="number" name="amount" required min={0.01} step="0.01" inputMode="decimal"
            value={amount} onChange={(e) => setAmount(e.target.value)} className="text-lg font-semibold" placeholder="0.00"
          />
        </Field>
        <Field label="Paid to">
          <Input name="paidTo" maxLength={120} defaultValue={initial.paidTo} placeholder="e.g. HP petrol bunk, Sri Lodge" />
        </Field>
        <Field label="Bill / receipt no.">
          <Input name="billRef" maxLength={80} defaultValue={initial.billRef} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea name="description" rows={2} maxLength={1000} defaultValue={initial.description} placeholder="Purpose: e.g. site visit to ABC Foods & XYZ Pharma, 64 km" />
        </Field>
      </div>

      <fieldset className="rounded-xl border border-line p-3">
        <legend className="px-1 text-sm font-semibold text-ink">Charge to project(s)</legend>
        <p className="mb-3 text-xs text-ink-soft">
          Pick the project this expense is for. One trip for two sites? Add both and tap <b>Split equally</b>, or type each share. Leave empty for office overhead.
        </p>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.key} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_9rem_auto]">
              <Select
                aria-label={`Project ${i + 1}`}
                value={r.projectId}
                onChange={(e) => update(r.key, { projectId: e.target.value })}
                className="col-span-2 sm:col-span-1"
              >
                <option value="">— select project —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
              <Input
                aria-label={`Amount for project ${i + 1}`}
                type="number" min={0} step="0.01" inputMode="decimal"
                placeholder={active.length === 1 && r.projectId ? String(total || "") : "0.00"}
                value={r.amount}
                onChange={(e) => update(r.key, { amount: e.target.value })}
              />
              <Button type="button" variant="ghost" size="md" onClick={() => removeRow(r.key)} aria-label={`Remove project row ${i + 1}`}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={addRow} disabled={rows.length >= 20}>
            <Plus className="h-4 w-4" aria-hidden /> Add project
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={splitEqually} disabled={active.length < 1 || !total}>
            <Split className="h-4 w-4" aria-hidden /> Split equally
          </Button>
        </div>
        {active.length > 0 && (
          <div
            aria-live="polite"
            className={cx("mt-3 rounded-lg px-3 py-2 text-sm", mismatch || dupes ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-muted text-ink-soft")}
          >
            {dupes
              ? "The same project is selected twice."
              : mismatch
                ? `Allocated ${inr(allocated)} of ${inr(total)} — ${diff > 0 ? `${inr(diff)} left to allocate` : `${inr(-diff)} too much`}.`
                : `Allocated ${inr(allocated)} across ${active.length} project${active.length === 1 ? "" : "s"}.`}
          </div>
        )}
      </fieldset>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SubmitButton size="lg" disabled={mismatch || dupes || !total} className="w-full sm:w-auto">
          {initial.id ? "Save changes" : "Submit voucher"}
        </SubmitButton>
        {!initial.id && (
          <SubmitButton size="lg" variant="secondary" name="next" value="new" disabled={mismatch || dupes || !total} className="w-full sm:w-auto">
            Submit & add another
          </SubmitButton>
        )}
      </div>
    </form>
  );
}
