"use client";
/**
 * Two-step inline confirm for a form submit (replaces window.confirm).
 * First click arms it and shows the question with "Yes" and "Keep" buttons in place;
 * the second click submits the surrounding form. Escape or "Keep" disarms.
 * Any name / value props go on the real submit button, so `name="op" value="cancel"` still works.
 */
import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, cx } from "../ui";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";

export type ConfirmButtonProps = Omit<ComponentProps<"button">, "type"> & {
  /** The question shown after the first click, e.g. "Cancel this order? It cannot be delivered afterwards." */
  confirm: ReactNode;
  /** Label of the button that really submits. Defaults to "Yes, " + the original label when it is plain text. */
  confirmLabel?: ReactNode;
  /** Label of the button that backs out. */
  keepLabel?: string;
  pendingText?: string;
  variant?: Variant;
  /** Variant of the final submit button. Defaults to danger for danger buttons, otherwise primary. */
  confirmVariant?: Variant;
  size?: "sm" | "md" | "lg";
  /** Stack the question above the buttons (for narrow places such as menus and table cells). */
  stacked?: boolean;
};

export function ConfirmButton({
  confirm, confirmLabel, keepLabel = "Keep", pendingText = "Working…", variant = "secondary", confirmVariant, size = "md",
  stacked, children, className, name, value, disabled, onClick, form, formAction, formNoValidate, ...rest
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  const yesRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const qid = useId();

  useEffect(() => { if (armed) yesRef.current?.focus(); }, [armed]);

  if (!armed) {
    return (
      <button
        type="button"
        ref={firstRef}
        disabled={disabled || pending}
        className={buttonClass(variant, size, className)}
        onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) setArmed(true); }}
        {...rest}
      >
        {children}
      </button>
    );
  }

  const yes = confirmLabel ?? (typeof children === "string" ? `Yes, ${children.charAt(0).toLowerCase()}${children.slice(1)}` : "Yes, continue");
  const disarm = () => { setArmed(false); window.setTimeout(() => firstRef.current?.focus(), 0); };
  return (
    <span
      role="group"
      aria-labelledby={qid}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); disarm(); } }}
      className={cx("ui-fade-in inline-flex max-w-full rounded-xl border border-line bg-surface-2 p-1.5 shadow-xs",
        stacked ? "flex-col items-stretch gap-1.5" : "flex-wrap items-center gap-2")}
    >
      <span id={qid} className={cx("text-caption text-ink", stacked ? "px-1" : "max-w-xs pl-1.5")} role="alert">{confirm}</span>
      <span className="inline-flex items-center gap-1.5">
        <button
          ref={yesRef}
          type="submit"
          name={name}
          value={value}
          form={form}
          formAction={formAction}
          formNoValidate={formNoValidate}
          disabled={pending}
          className={buttonClass(confirmVariant ?? (variant === "danger" ? "danger" : "primary"), "sm")}
        >
          {pending ? pendingText : yes}
        </button>
        {!pending && <button type="button" onClick={disarm} className={buttonClass("ghost", "sm")}>{keepLabel}</button>}
      </span>
    </span>
  );
}
