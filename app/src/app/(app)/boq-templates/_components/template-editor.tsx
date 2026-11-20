"use client";
/** BOQ template editor: header + ordered line editor (section, BOQ ref, item link, description, UOM, default qty). */
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Link2, Plus, Trash2, Unlink } from "lucide-react";
import { Button, Card, Field, Input, Select, Textarea, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { SYSTEMS } from "@/lib/constants";
import { ItemPicker, type PickerItem } from "../../quotations/_components/item-picker";

export type EditorLine = {
  key: string;
  section: string;
  boqRef: string;
  itemId: number | null;
  description: string;
  uom: string;
  defaultQty: number;
};

let seq = 0;
const newKey = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

export function TemplateEditor({
  action, template, initialLines, items,
}: {
  action: (f: FormData) => Promise<void>;
  template: { id?: number; name: string; system: string; description: string; active: boolean };
  initialLines: EditorLine[];
  items: PickerItem[];
}) {
  const [system, setSystem] = useState(template.system);
  const [lines, setLines] = useState<EditorLine[]>(initialLines);
  const [linkingKey, setLinkingKey] = useState<string | null>(null);
  const [newSection, setNewSection] = useState("");
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const sections = useMemo(() => [...new Set(lines.map((l) => l.section).filter(Boolean))], [lines]);
  const lastSection = lines.length ? lines[lines.length - 1].section : "";
  const targetSection = newSection.trim() || lastSection;

  function update(key: string, patch: Partial<EditorLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function move(idx: number, dir: -1 | 1) {
    setLines((ls) => {
      const j = idx + dir;
      if (j < 0 || j >= ls.length) return ls;
      const copy = [...ls];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });
  }
  function remove(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }
  function addFromItem(it: PickerItem) {
    setLines((ls) => [...ls, {
      key: newKey(), section: targetSection, boqRef: "", itemId: it.id,
      description: [it.name, it.make ? `(${it.make})` : ""].filter(Boolean).join(" "), uom: it.uom, defaultQty: 0,
    }]);
  }
  function addFree() {
    setLines((ls) => [...ls, { key: newKey(), section: targetSection, boqRef: "", itemId: null, description: "", uom: "Nos", defaultQty: 0 }]);
  }

  const payload = JSON.stringify(lines.map((l) => ({
    section: l.section || null, boqRef: l.boqRef || null, itemId: l.itemId, description: l.description, uom: l.uom || "Nos", defaultQty: l.defaultQty || 0,
  })));

  return (
    <form action={action} className="space-y-6">
      {template.id && <input type="hidden" name="id" value={template.id} />}
      <input type="hidden" name="lines" value={payload} />
      <Card title="Template details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Template name" required>
            <Input name="name" defaultValue={template.name} required maxLength={160} placeholder="e.g. Hydrant System — 100NB to 150NB" />
          </Field>
          <Field label="System" required>
            <Select name="system" value={system} onChange={(e) => setSystem(e.target.value)} required>
              {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Description" className="sm:col-span-2" hint="Size range, scope or when to use this template">
            <Textarea name="description" defaultValue={template.description} maxLength={2000} rows={2} />
          </Field>
          <label className="inline-flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="active" defaultChecked={template.active} /> Active (available when creating quotations)
          </label>
        </div>
      </Card>

      <Card title={`Bill of quantities — ${lines.length} line${lines.length === 1 ? "" : "s"}`} bodyClassName="p-0">
        {lines.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-soft">No lines yet. Add items from the item master or free-text lines below.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="bg-muted text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  <th className="w-10 px-2 py-2">#</th>
                  <th className="w-44 px-2 py-2">Section</th>
                  <th className="w-24 px-2 py-2">BOQ Ref</th>
                  <th className="px-2 py-2">Description / linked item</th>
                  <th className="w-20 px-2 py-2">UOM</th>
                  <th className="w-24 px-2 py-2">Default qty</th>
                  <th className="w-28 px-2 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const it = l.itemId != null ? itemById.get(l.itemId) : undefined;
                  return (
                    <tr key={l.key} className="border-t border-line align-top">
                      <td className="px-2 py-2 text-xs text-ink-faint tabular-nums">{idx + 1}</td>
                      <td className="px-2 py-2">
                        <input aria-label={`Section, line ${idx + 1}`} className={inputClass} list="boq-sections" value={l.section} maxLength={120}
                          onChange={(e) => update(l.key, { section: e.target.value })} />
                      </td>
                      <td className="px-2 py-2">
                        <input aria-label={`BOQ ref, line ${idx + 1}`} className={inputClass} value={l.boqRef} maxLength={20}
                          onChange={(e) => update(l.key, { boqRef: e.target.value })} />
                      </td>
                      <td className="px-2 py-2">
                        <textarea aria-label={`Description, line ${idx + 1}`} className={inputClass + " min-h-10"} rows={2} value={l.description} required
                          onChange={(e) => update(l.key, { description: e.target.value })} />
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          {l.itemId != null ? (
                            <>
                              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-ink-soft">
                                <Link2 className="h-3 w-3" aria-hidden />
                                {it ? `${it.code} · ${it.name}` : `Item #${l.itemId} (inactive)`}
                              </span>
                              <button type="button" className="inline-flex items-center gap-1 text-ink-soft hover:text-brand-700" onClick={() => update(l.key, { itemId: null })}>
                                <Unlink className="h-3 w-3" aria-hidden /> Unlink
                              </button>
                            </>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">Free text — priced manually in quotation</span>
                          )}
                          <button type="button" className="text-brand-700 hover:underline" onClick={() => setLinkingKey(linkingKey === l.key ? null : l.key)}>
                            {l.itemId != null ? "Change item" : "Link item"}
                          </button>
                        </div>
                        {linkingKey === l.key && (
                          <div className="mt-2">
                            <ItemPicker items={items} systemFilter={system} autoFocus
                              onPick={(p) => { update(l.key, { itemId: p.id, uom: p.uom, description: l.description || p.name }); setLinkingKey(null); }} />
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <input aria-label={`UOM, line ${idx + 1}`} className={inputClass} value={l.uom} maxLength={20}
                          onChange={(e) => update(l.key, { uom: e.target.value })} />
                      </td>
                      <td className="px-2 py-2">
                        <input aria-label={`Default quantity, line ${idx + 1}`} className={inputClass + " text-right tabular-nums"} type="number" min={0} step="any"
                          value={l.defaultQty} onChange={(e) => update(l.key, { defaultQty: Math.max(0, Number(e.target.value) || 0) })} />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <button type="button" aria-label={`Move line ${idx + 1} up`} disabled={idx === 0} onClick={() => move(idx, -1)}
                            className="rounded p-1.5 text-ink-soft hover:bg-muted disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                          <button type="button" aria-label={`Move line ${idx + 1} down`} disabled={idx === lines.length - 1} onClick={() => move(idx, 1)}
                            className="rounded p-1.5 text-ink-soft hover:bg-muted disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                          <button type="button" aria-label={`Delete line ${idx + 1}`} onClick={() => remove(l.key)}
                            className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <datalist id="boq-sections">{sections.map((s) => <option key={s} value={s} />)}</datalist>
        <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-start">
          <Field label="Add to section" hint={targetSection ? `New lines go to “${targetSection}”` : "Leave blank for no section"}>
            <input className={inputClass} list="boq-sections" value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder={lastSection || "e.g. A - Pump House"} />
          </Field>
          <Field label="Add item from item master">
            <ItemPicker items={items} systemFilter={system} onPick={addFromItem} />
          </Field>
          <div className="sm:pt-6">
            <Button type="button" variant="secondary" onClick={addFree}><Plus className="h-4 w-4" aria-hidden /> Free-text line</Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <SubmitButton>Save template</SubmitButton>
      </div>
    </form>
  );
}
