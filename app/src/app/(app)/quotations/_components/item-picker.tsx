"use client";
/** Searchable item picker (combobox): search by code / name / size / make / group. Shared by BOQ templates & quotations. */
import { useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { inputClass } from "@/components/ui";

export type PickerItem = {
  id: number;
  code: string;
  name: string;
  size: string | null;
  make: string | null;
  uom: string;
  groupName: string;
  system: string;
};

export function filterItems<T extends PickerItem>(items: readonly T[], query: string, system?: string, limit = 40): T[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const out: T[] = [];
  for (const it of items) {
    if (system && it.system !== system) continue;
    const hay = `${it.code} ${it.name} ${it.size ?? ""} ${it.make ?? ""} ${it.groupName}`.toLowerCase();
    if (tokens.every((t) => hay.includes(t))) {
      out.push(it);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function ItemPicker<T extends PickerItem>({
  items, onPick, placeholder = "Search item by code, name, size, make…", label = "Search item master", systemFilter, renderMeta, autoFocus,
}: {
  items: readonly T[];
  onPick: (item: T) => void;
  placeholder?: string;
  label?: string;
  systemFilter?: string;
  renderMeta?: (item: T) => React.ReactNode;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [onlySystem, setOnlySystem] = useState(true);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(
    () => (q.trim() ? filterItems(items, q, onlySystem ? systemFilter : undefined) : []),
    [items, q, systemFilter, onlySystem],
  );

  function pick(it: T) {
    onPick(it);
    setQ("");
    setOpen(false);
    setActive(0);
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor={listId + "-in"}>{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input
          id={listId + "-in"}
          ref={inputRef}
          className={inputClass + " pl-9"}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listId}-o${results[active].id}` : undefined}
          placeholder={placeholder}
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); if (results[active]) pick(results[active]); }
            else if (e.key === "Escape") setOpen(false);
          }}
        />
      </div>
      {systemFilter && (
        <label className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-soft">
          <input type="checkbox" checked={onlySystem} onChange={(e) => setOnlySystem(e.target.checked)} />
          Only items of this system
        </label>
      )}
      {open && q.trim() && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          {results.length === 0 && <li className="px-3 py-2 text-sm text-ink-soft">No matching items</li>}
          {results.map((it, i) => (
            <li
              key={it.id}
              id={`${listId}-o${it.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(it); }}
              onMouseEnter={() => setActive(i)}
              className={"cursor-pointer px-3 py-2 text-sm " + (i === active ? "bg-muted" : "")}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-ink">{it.name}</span>
                <span className="shrink-0 font-mono text-xs text-ink-faint">{it.code}</span>
              </div>
              <div className="text-xs text-ink-soft">
                {[it.groupName, it.size, it.make, it.uom].filter(Boolean).join(" · ")}
                {renderMeta && <> · {renderMeta(it)}</>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
