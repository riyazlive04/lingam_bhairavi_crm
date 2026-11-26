"use client";
import type { ChangeEvent } from "react";

/** Header checkbox that toggles every `<input name={name}>` checkbox in the same form. */
export function SelectAll({ name = "ids", label = "Select all" }: { name?: string; label?: string }) {
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const form = e.currentTarget.form;
    if (!form) return;
    form.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`).forEach((cb) => {
      if (!cb.disabled) cb.checked = e.currentTarget.checked;
    });
  };
  return <input type="checkbox" aria-label={label} onChange={onChange} className="icon-sm accent-brand-600" />;
}
