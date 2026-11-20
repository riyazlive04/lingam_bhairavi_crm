"use client";
/** "Select all" checkbox for the alerts bulk form (toggles every input[name=ids] in the same form). */
export function SelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Select all alerts"
      className="h-4 w-4 accent-brand-600"
      onChange={(e) => {
        const form = e.currentTarget.form;
        if (!form) return;
        form.querySelectorAll<HTMLInputElement>('input[type=checkbox][name="ids"]').forEach((c) => {
          c.checked = e.currentTarget.checked;
        });
      }}
    />
  );
}
