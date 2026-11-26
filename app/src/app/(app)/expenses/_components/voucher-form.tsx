"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Split, Trash2 } from "lucide-react";
import { Button, Field, Input, Select, Textarea, buttonClass, cx } from "@/components/ui";
import { FormFooter, FormSection } from "@/components/patterns";
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
/** Phone-friendly controls: 44px tall, 16px text so iOS does not zoom in. */
const big = "h-11 text-base sm:h-9.5 sm:text-sm";

/** Mobile-first expense voucher with multi-project allocation (manual or equal split). */
export function VoucherForm({
  action, projects, categories, initial, maxDate, cancelHref, stickyFooter = true,
}: {
  action: (fd: FormData) => Promise<void>;
  projects: ProjectOpt[];
  categories: Record<string, string>;
  initial: VoucherInitial;
  maxDate: string;
  cancelHref?: string;
  /** Turn off on pages that already have a fixed phone action bar. */
  stickyFooter?: boolean;
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
  const blocked = mismatch || dupes || !total;

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

  const status = dupes
    ? "The same project is selected twice."
    : mismatch
      ? `Allocated ${inr(allocated)} of ${inr(total)}: ${diff > 0 ? `${inr(diff)} left to allocate` : `${inr(-diff)} too much`}.`
      : active.length > 0
        ? `Allocated ${inr(allocated)} across ${active.length} project${active.length === 1 ? "" : "s"}.`
        : total ? "Not charged to a project, so it counts as office overhead." : "Enter the amount to submit.";

  return (
    <form action={action} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="allocations" value={payload} />

      <FormSection title="Voucher" description="What was spent, when and on what.">
        <Field label="Amount (₹)" required className="sm:col-span-2">
          <Input
            type="number" name="amount" required min={0.01} step="0.01" inputMode="decimal"
            value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 text-xl font-semibold tabular-nums" placeholder="0.00"
          />
        </Field>
        <Field label="Date" required>
          <Input type="date" name="date" required defaultValue={initial.date} max={maxDate} className={big} />
        </Field>
        <Field label="Category" required>
          <Select name="category" required defaultValue={initial.category} className={big}>
            <option value="" disabled>Select a category</option>
            {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Paid to">
          <Input name="paidTo" maxLength={120} defaultValue={initial.paidTo} placeholder="e.g. HP petrol bunk, Sri Lodge" className={big} />
        </Field>
        <Field label="Bill or receipt no.">
          <Input name="billRef" maxLength={80} defaultValue={initial.billRef} className={big} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea name="description" rows={2} maxLength={1000} defaultValue={initial.description} className="text-base sm:text-sm"
            placeholder="Purpose, e.g. site visit to ABC Foods and XYZ Pharma, 64 km" />
        </Field>
      </FormSection>

      <FormSection title="Charge to projects" columns={1}
        description="Pick the project this expense is for. One trip for two sites? Add both and tap Split equally, or type each share. Leave it empty for office overhead.">
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-line bg-surface-2 p-2 sm:grid-cols-[1fr_10rem_auto] sm:border-0 sm:bg-transparent sm:p-0">
              <Select
                aria-label={`Project ${i + 1}`}
                value={r.projectId}
                onChange={(e) => update(r.key, { projectId: e.target.value })}
                className={cx("col-span-2 sm:col-span-1", big)}
              >
                <option value="">Select a project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
              <Input
                aria-label={`Amount for project ${i + 1}`}
                type="number" min={0} step="0.01" inputMode="decimal"
                placeholder={active.length === 1 && r.projectId ? String(total || "") : "0.00"}
                value={r.amount}
                onChange={(e) => update(r.key, { amount: e.target.value })}
                className={cx("text-right tabular-nums", big)}
              />
              <Button type="button" variant="ghost" onClick={() => removeRow(r.key)} aria-label={`Remove project row ${i + 1}`} className="h-11 w-11 px-0 sm:h-9.5 sm:w-9.5">
                <Trash2 className="icon-sm" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button type="button" variant="secondary" onClick={addRow} disabled={rows.length >= 20} className="h-11 sm:h-8">
            <Plus className="icon-sm" aria-hidden /> Add project
          </Button>
          <Button type="button" variant="secondary" onClick={splitEqually} disabled={active.length < 1 || !total} className="h-11 sm:h-8">
            <Split className="icon-sm" aria-hidden /> Split equally
          </Button>
        </div>
      </FormSection>

      <FormFooter
        sticky={stickyFooter}
        note={<span aria-live="polite" className={cx((mismatch || dupes) && "font-medium text-danger")}>{status}</span>}
      >
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {cancelHref && <Link href={cancelHref} className={buttonClass("ghost", "md", "max-sm:hidden")}>Cancel</Link>}
          {!initial.id && (
            <SubmitButton variant="secondary" name="next" value="new" disabled={blocked} pendingText="Submitting…" className="max-sm:order-2 max-sm:h-11">
              Submit and add another
            </SubmitButton>
          )}
          <SubmitButton disabled={blocked} pendingText={initial.id ? "Saving…" : "Submitting…"} className="max-sm:order-1 max-sm:h-11 max-sm:text-base">
            {initial.id ? "Save changes" : "Submit voucher"}
          </SubmitButton>
        </div>
      </FormFooter>
    </form>
  );
}
