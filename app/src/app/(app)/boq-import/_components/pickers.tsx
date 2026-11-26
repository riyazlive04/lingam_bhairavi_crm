"use client";
/** Small searchable comboboxes for the BOQ import: customer picker and catalogue item search. */
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cx, inputClass } from "@/components/ui";
import type { ImportCatalogItem } from "../_lib/types";

type Option = { id: number; label: string; hint?: string | null };

function Combobox({
  options, onPick, placeholder, label, initialQuery = "", autoFocus, onCancel, renderOption, emptyText = "Nothing matches",
}: {
  options: (q: string) => Option[];
  onPick: (id: number) => void;
  placeholder: string;
  label: string;
  initialQuery?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  renderOption?: (o: Option) => ReactNode;
  emptyText?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [open, setOpen] = useState(Boolean(autoFocus));
  const [active, setActive] = useState(0);
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => options(q), [options, q]);
  const pick = (o: Option) => { onPick(o.id); setOpen(false); setActive(0); };
  return (
    <div className="relative">
      <label className="sr-only" htmlFor={`${id}-in`}>{label}</label>
      <Search className="icon-sm pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
      <input
        id={`${id}-in`}
        ref={inputRef}
        className={cx(inputClass, "h-9.5 pl-9")}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${id}-o${results[active].id}` : undefined}
        placeholder={placeholder}
        value={q}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); if (results[active]) pick(results[active]); }
          else if (e.key === "Escape") { if (open) setOpen(false); else onCancel?.(); }
        }}
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full min-w-64 overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-ink-soft">{emptyText}</li>}
          {results.map((o, i) => (
            <li
              key={o.id}
              id={`${id}-o${o.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
              className={cx("cursor-pointer px-3 py-2 text-sm", i === active && "bg-muted")}
            >
              {renderOption ? renderOption(o) : (
                <>
                  <div className="font-medium text-ink">{o.label}</div>
                  {o.hint && <div className="text-xs text-ink-soft">{o.hint}</div>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);

/** Searchable customer select. Posts `name` as a hidden input holding the chosen id. */
export function CustomerPicker({ customers, value, onChange, name = "customerId" }: {
  customers: { id: number; name: string; city: string | null }[];
  value: number | null;
  onChange: (id: number | null) => void;
  name?: string;
}) {
  const chosen = value != null ? customers.find((c) => c.id === value) : undefined;
  const hay = useMemo(() => customers.map((c) => ({ c, h: `${c.name} ${c.city ?? ""}`.toLowerCase() })), [customers]);
  const options = useMemo(() => (q: string) => {
    const t = words(q);
    const out: Option[] = [];
    for (const { c, h } of hay) {
      if (t.every((w) => h.includes(w))) out.push({ id: c.id, label: c.name, hint: c.city });
      if (out.length >= 50) break;
    }
    return out;
  }, [hay]);
  return (
    <div>
      <input type="hidden" name={name} value={value ?? ""} />
      {chosen ? (
        <div className="flex h-9.5 items-center justify-between gap-2 rounded-lg border border-line bg-muted px-3 text-sm">
          <span className="min-w-0 truncate font-medium text-ink">{chosen.name}{chosen.city ? <span className="font-normal text-ink-soft">, {chosen.city}</span> : null}</span>
          <button type="button" onClick={() => onChange(null)} className="shrink-0 rounded-md p-1 text-ink-soft hover:bg-surface hover:text-ink" aria-label="Change customer">
            <X className="icon-sm" aria-hidden />
          </button>
        </div>
      ) : (
        <Combobox options={options} onPick={(id) => onChange(id)} placeholder="Type to search customers" label="Search customers" emptyText="No customer with that name. Add it under Customers first." />
      )}
    </div>
  );
}

export function filterCatalog(catalog: readonly ImportCatalogItem[], hay: readonly string[], q: string, limit = 30): ImportCatalogItem[] {
  const t = words(q);
  if (!t.length) return [];
  const out: ImportCatalogItem[] = [];
  for (let i = 0; i < catalog.length; i++) {
    if (t.every((w) => hay[i].includes(w))) {
      out.push(catalog[i]);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Inline catalogue search for one BOQ row. */
export function ItemSearch({ catalog, hay, onPick, onCancel, initialQuery }: {
  catalog: readonly ImportCatalogItem[];
  hay: readonly string[];
  onPick: (id: number) => void;
  onCancel: () => void;
  initialQuery?: string;
}) {
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const options = useMemo(() => (q: string) => filterCatalog(catalog, hay, q).map((c) => ({
    id: c.id, label: c.name, hint: [c.code, c.groupName, c.size, c.make, c.uom].filter(Boolean).join(" · "),
  })), [catalog, hay]);
  return (
    <div className="flex items-start gap-1.5">
      <div className="min-w-0 flex-1">
        <Combobox
          options={options}
          onPick={onPick}
          onCancel={onCancel}
          autoFocus
          initialQuery={initialQuery}
          placeholder="Search by name, size, make or code"
          label="Search the item catalogue"
          emptyText="No matching items"
          renderOption={(o) => {
            const it = byId.get(o.id);
            return (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">{o.label}</span>
                  {it && <span className="shrink-0 font-mono text-xs text-ink-faint">{it.code}</span>}
                </div>
                <div className="text-xs text-ink-soft">{it ? [it.groupName, it.size, it.make, it.uom].filter(Boolean).join(" · ") : o.hint}</div>
              </>
            );
          }}
        />
      </div>
      <button type="button" onClick={onCancel} className="mt-1 rounded-md p-1.5 text-ink-soft hover:bg-muted hover:text-ink" aria-label="Close item search">
        <X className="icon-sm" aria-hidden />
      </button>
    </div>
  );
}
