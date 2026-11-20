"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, Input } from "@/components/ui";
import type { ActionItem } from "../_lib/types";

type Row = ActionItem & { key: number };

/** Editable action-item list serialised to a hidden JSON input named "actionItems". */
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
      {rows.length === 0 && <p className="mb-2 text-sm text-ink-soft">No action items.</p>}
      <ol className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.key} className="grid grid-cols-[auto_1fr] gap-2 border-b border-line pb-3 last:border-0 sm:grid-cols-[auto_1fr_10rem_9.5rem_auto]">
            <input
              type="checkbox" checked={r.done} onChange={(e) => update(r.key, { done: e.target.checked })}
              aria-label={`Action ${i + 1} done`} className="mt-2.5 h-4 w-4 accent-brand-600"
            />
            <Input aria-label={`Action ${i + 1}`} placeholder="Action" value={r.text} maxLength={500} onChange={(e) => update(r.key, { text: e.target.value })} />
            <Input aria-label={`Owner of action ${i + 1}`} placeholder="Owner" value={r.owner} maxLength={120} onChange={(e) => update(r.key, { owner: e.target.value })} className="col-start-2 sm:col-start-auto" />
            <Input aria-label={`Due date of action ${i + 1}`} type="date" value={r.due ?? ""} onChange={(e) => update(r.key, { due: e.target.value || undefined })} className="col-start-2 sm:col-start-auto" />
            <div className="col-start-2 flex gap-1 sm:col-start-auto">
              <Button type="button" variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move action ${i + 1} up`}><ArrowUp className="h-4 w-4" aria-hidden /></Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Move action ${i + 1} down`}><ArrowDown className="h-4 w-4" aria-hidden /></Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove action ${i + 1}`}><Trash2 className="h-4 w-4" aria-hidden /></Button>
            </div>
          </li>
        ))}
      </ol>
      <Button
        type="button" variant="secondary" size="sm" className="mt-3"
        onClick={() => { setRows((rs) => [...rs, { key: nextKey, text: "", owner: "", done: false }]); setNextKey((k) => k + 1); }}
        disabled={rows.length >= 200}
      >
        <Plus className="h-4 w-4" aria-hidden /> Add action item
      </Button>
    </div>
  );
}
