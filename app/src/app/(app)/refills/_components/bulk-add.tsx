"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type Row = { key: number; extType: string; make: string; qty: string; location: string };

/** Bulk-add extinguishers for one customer (e.g. after a site survey). */
export function BulkAdd({ action, customers, types, intervals, today, defaultCustomerId }: {
  action: (fd: FormData) => Promise<void>;
  customers: { id: number; name: string }[];
  types: readonly string[];
  intervals: readonly (readonly [number, string])[];
  today: string;
  defaultCustomerId?: number;
}) {
  const [rows, setRows] = useState<Row[]>([{ key: 1, extType: "", make: "", qty: "1", location: "" }]);
  const [nextKey, setNextKey] = useState(2);
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () => {
    const last = rows[rows.length - 1];
    setRows((rs) => [...rs, { key: nextKey, extType: "", make: last?.make ?? "", qty: "1", location: last?.location ?? "" }]);
    setNextKey((k) => k + 1);
  };
  const remove = (key: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  const valid = rows.filter((r) => r.extType.trim() && Number(r.qty) >= 1);
  const units = valid.reduce((s, r) => s + Number(r.qty), 0);
  const payload = JSON.stringify(valid.map((r) => ({ extType: r.extType.trim(), make: r.make.trim(), qty: Math.floor(Number(r.qty)), location: r.location.trim() })));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="rows" value={payload} />
      <datalist id="bulk-ext-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer" required>
          <Select name="customerId" required defaultValue={defaultCustomerId ?? ""}>
            <option value="" disabled>Select customer…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Default location" hint="Used for rows without their own location">
          <Input name="location" maxLength={200} placeholder="e.g. Plant 1" />
        </Field>
        <Field label="Date applies to" required>
          <Select name="dateKind" defaultValue="lastRefill">
            <option value="lastRefill">Last refill date</option>
            <option value="install">Install date (new extinguishers)</option>
          </Select>
        </Field>
        <Field label="Date" required>
          <Input type="date" name="baseDate" required max={today} defaultValue={today} />
        </Field>
        <Field label="Refill interval" required>
          <Select name="refillIntervalMonths" defaultValue={12}>
            {intervals.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
          </Select>
        </Field>
        <Field label="HPT due (optional)">
          <Input type="date" name="hptDueDate" />
        </Field>
      </div>

      <fieldset className="rounded-xl border border-line p-3">
        <legend className="px-1 text-sm font-semibold text-ink">Extinguishers</legend>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.key} className="grid grid-cols-2 gap-2 border-b border-line pb-3 last:border-0 last:pb-0 sm:grid-cols-[1.3fr_1fr_5rem_1.3fr_auto]">
              <Input aria-label={`Type, row ${i + 1}`} list="bulk-ext-types" placeholder="Type e.g. CO2 4.5 Kg" value={r.extType} onChange={(e) => update(r.key, { extType: e.target.value })} maxLength={60} className="col-span-2 sm:col-span-1" />
              <Input aria-label={`Make, row ${i + 1}`} placeholder="Make" value={r.make} onChange={(e) => update(r.key, { make: e.target.value })} maxLength={60} />
              <Input aria-label={`Quantity, row ${i + 1}`} type="number" min={1} step={1} inputMode="numeric" value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value })} />
              <Input aria-label={`Location, row ${i + 1}`} placeholder="Location (optional)" value={r.location} onChange={(e) => update(r.key, { location: e.target.value })} maxLength={200} className="col-span-2 sm:col-span-1" />
              <Button type="button" variant="ghost" onClick={() => remove(r.key)} disabled={rows.length === 1} aria-label={`Remove row ${i + 1}`} className="col-span-2 sm:col-span-1">
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={add} disabled={rows.length >= 200}>
          <Plus className="h-4 w-4" aria-hidden /> Add row
        </Button>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={!valid.length}>Add {valid.length} line{valid.length === 1 ? "" : "s"} ({units} units)</SubmitButton>
        <span className="text-xs text-ink-soft">Rows without a type are ignored.</span>
      </div>
    </form>
  );
}
