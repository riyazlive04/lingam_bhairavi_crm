"use client";
/** BOQ template editor: header + ordered line editor (section, BOQ ref, item link, description, UOM, default qty). */
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Link2, Plus, Trash2, Unlink } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { FormFooter, FormSection, LineItemsTable, StatusPill, li } from "@/components/patterns";
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
  action, template, initialLines, items, cancelHref,
}: {
  action: (f: FormData) => Promise<void>;
  /** Where Cancel goes (the list for a new template, the template for an edit). */
  cancelHref: string;
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
    <form action={action} className="space-y-4">
      {template.id && <input type="hidden" name="id" value={template.id} />}
      <input type="hidden" name="lines" value={payload} />
      <FormSection title="Template details" description="Name it so sales can pick the right one when quoting.">
        <Field label="Template name" required>
          <Input name="name" defaultValue={template.name} required maxLength={160} placeholder="For example Hydrant system, 100NB to 150NB" />
        </Field>
        <Field label="System" required>
          <Select name="system" value={system} onChange={(e) => setSystem(e.target.value)} required>
            {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Description" className="sm:col-span-2" hint="Size range, scope or when to use this template">
          <Textarea name="description" defaultValue={template.description} maxLength={2000} rows={2} />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm text-ink sm:col-span-2">
          <input type="checkbox" name="active" defaultChecked={template.active} className="icon-sm accent-brand-600" /> Active (available when creating quotations)
        </label>
      </FormSection>

      <FormSection columns={1} title="Bill of quantities" description={`${lines.length} line${lines.length === 1 ? "" : "s"}. Link lines to the item master so quotations price them automatically.`}>
        {lines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-soft">No lines yet. Add items from the item master or a free text line below.</p>
        ) : (
          <LineItemsTable minWidth={900} caption="Template lines">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th className="w-44">Section</th>
                <th className="w-24">BOQ ref</th>
                <th>Description and linked item</th>
                <th className="w-20">UOM</th>
                <th className={`w-24 ${li.num}`}>Default qty</th>
                <th className="w-28"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const it = l.itemId != null ? itemById.get(l.itemId) : undefined;
                return (
                  <tr key={l.key}>
                    <td className="pt-2.5 text-caption text-ink-faint tabular-nums">{idx + 1}</td>
                    <td>
                      <input aria-label={`Section, line ${idx + 1}`} className={li.input} list="boq-sections" value={l.section} maxLength={120}
                        onChange={(e) => update(l.key, { section: e.target.value })} />
                    </td>
                    <td>
                      <input aria-label={`BOQ ref, line ${idx + 1}`} className={li.input} value={l.boqRef} maxLength={20}
                        onChange={(e) => update(l.key, { boqRef: e.target.value })} />
                    </td>
                    <td className="min-w-72">
                      <textarea aria-label={`Description, line ${idx + 1}`} className={`${li.input} h-auto min-h-10 py-1.5`} rows={2} value={l.description} required
                        onChange={(e) => update(l.key, { description: e.target.value })} />
                      <div className="mt-1 flex flex-wrap items-center gap-2 px-2 text-caption">
                        {l.itemId != null ? (
                          <>
                            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-ink-soft">
                              <Link2 className="icon-xs" aria-hidden />
                              {it ? `${it.code} · ${it.name}` : `Item #${l.itemId} (inactive)`}
                            </span>
                            <button type="button" className="inline-flex items-center gap-1 text-ink-soft hover:text-brand-700 dark:hover:text-brand-300" onClick={() => update(l.key, { itemId: null })}>
                              <Unlink className="icon-xs" aria-hidden /> Unlink
                            </button>
                          </>
                        ) : (
                          <StatusPill semantic="warning" label="Free text, priced manually in the quotation" noDot />
                        )}
                        <button type="button" className="font-medium text-brand-700 hover:underline dark:text-brand-300" onClick={() => setLinkingKey(linkingKey === l.key ? null : l.key)}>
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
                    <td>
                      <input aria-label={`UOM, line ${idx + 1}`} className={li.input} value={l.uom} maxLength={20}
                        onChange={(e) => update(l.key, { uom: e.target.value })} />
                    </td>
                    <td>
                      <input aria-label={`Default quantity, line ${idx + 1}`} className={li.numInput} type="number" inputMode="decimal" min={0} step="any"
                        value={l.defaultQty} onChange={(e) => update(l.key, { defaultQty: Math.max(0, Number(e.target.value) || 0) })} />
                    </td>
                    <td>
                      <div className="flex items-center gap-0.5">
                        <button type="button" aria-label={`Move line ${idx + 1} up`} disabled={idx === 0} onClick={() => move(idx, -1)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:bg-muted disabled:opacity-30"><ArrowUp className="icon-sm" aria-hidden /></button>
                        <button type="button" aria-label={`Move line ${idx + 1} down`} disabled={idx === lines.length - 1} onClick={() => move(idx, 1)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:bg-muted disabled:opacity-30"><ArrowDown className="icon-sm" aria-hidden /></button>
                        <button type="button" aria-label={`Remove line ${idx + 1}`} onClick={() => remove(l.key)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger-soft"><Trash2 className="icon-sm" aria-hidden /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </LineItemsTable>
        )}
        <datalist id="boq-sections">{sections.map((s) => <option key={s} value={s} />)}</datalist>
        <div className="grid gap-3 rounded-xl border border-line bg-surface-2 p-3 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-start">
          <Field label="Add to section" hint={targetSection ? `New lines go to "${targetSection}"` : "Leave blank for no section"}>
            <Input list="boq-sections" value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder={lastSection || "For example A. Pump house"} />
          </Field>
          <Field label="Add item from item master">
            <ItemPicker items={items} systemFilter={system} onPick={addFromItem} />
          </Field>
          <div className="sm:pt-7">
            <Button type="button" variant="secondary" onClick={addFree} className="max-sm:w-full"><Plus className="icon-sm" aria-hidden /> Add free text line</Button>
          </div>
        </div>
      </FormSection>

      <FormFooter cancelHref={cancelHref} note={`${lines.length} line${lines.length === 1 ? "" : "s"}`}>
        <SubmitButton pendingText="Saving…">Save template</SubmitButton>
      </FormFooter>
    </form>
  );
}
