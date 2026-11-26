"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, Input } from "@/components/ui";
import type { ActionItem } from "../_lib/types";

type Row = ActionItem & { key: number };

/** Editable action item list serialised to a hidden JSON input named "actionItems". */
export function ActionItemsEditor({ initial }: { initial: ActionItem[] }) {
  const [rows, setRows] = useState<Row[]>(() => initial.map((a, i) => ({ ...a, key: i + 1 })));
  const [nextKey, setNextKey] = useState(initial.length + 1);
  const update = (key: number, patch: Partial<ActionItem>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (idx: number, dir: -1 | 1) => setRows((rs) => {
    const j = idx + dir;
    if (j < 0 || j >= rs.length) return rs;
    const n = [...rs];
    [n[idx], n[j]] = [n[j], n[idx]];
    return n;
  });
  const payload = JSON.stringify(
    rows.filter((r) => r.text.trim()).map((r) => ({ text: r.text.trim(), owner: r.owner.trim(), due: r.due || undefined, done: r.done })),
  );

  return (
    <div>
      <input type="hidden" name="actionItems" value={payload} />
      {rows.length === 0 && <p className="mb-3 text-sm text-ink-soft">No action items yet. Add one for each follow-up agreed in the meeting.</p>}
      <ol className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.key} className="rounded-xl border border-line bg-surface-2 p-3 sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent sm:p-0 sm:pb-3 sm:last:border-b-0">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_10rem_9.5rem_auto] sm:items-center">
              <label className="grid h-9.5 w-9 place-items-center">
                <span className="sr-only">Action {i + 1} done</span>
                <input type="checkbox" checked={r.done} onChange={(e) => update(r.key, { done: e.target.checked })} className="h-5 w-5 accent-brand-600" />
              </label>
              <Input aria-label={`Action ${i + 1}`} placeholder="What needs to happen" value={r.text} maxLength={500} onChange={(e) => update(r.key, { text: e.target.value })} />
              <Input aria-label={`Owner of action ${i + 1}`} placeholder="Owner" value={r.owner} maxLength={120} onChange={(e) => update(r.key, { owner: e.target.value })} className="col-start-2 sm:col-start-auto" />
              <Input aria-label={`Due date of action ${i + 1}`} type="date" value={r.due ?? ""} onChange={(e) => update(r.key, { due: e.target.value || undefined })} className="col-start-2 sm:col-start-auto" />
              <div className="col-start-2 flex justify-end gap-1 sm:col-start-auto">
                <Button type="button" variant="ghost" className="w-9.5 px-0" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move action ${i + 1} up`}><ArrowUp className="icon-sm" aria-hidden /></Button>
                <Button type="button" variant="ghost" className="w-9.5 px-0" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Move action ${i + 1} down`}><ArrowDown className="icon-sm" aria-hidden /></Button>
                <Button type="button" variant="ghost" className="w-9.5 px-0 hover:text-danger" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove action ${i + 1}`}><Trash2 className="icon-sm" aria-hidden /></Button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <Button
        type="button" variant="secondary" className="mt-3 max-sm:w-full"
        onClick={() => { setRows((rs) => [...rs, { key: nextKey, text: "", owner: "", done: false }]); setNextKey((k) => k + 1); }}
        disabled={rows.length >= 200}
      >
        <Plus className="icon-sm" aria-hidden /> Add action item
      </Button>
    </div>
  );
}
