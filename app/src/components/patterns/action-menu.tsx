"use client";
/**
 * Small accessible dropdown menu used for the detail page "More" button and the top bar
 * "Quick create" menu. Content is any server-rendered markup (links, forms with ConfirmButton),
 * so server actions keep working. Closes on outside click, Escape, or when a link inside is clicked.
 */
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { buttonClass, cx } from "../ui";

export type ActionMenuProps = {
  /** Button text. Defaults to "More". */
  label?: string;
  /** Icon shown before the label (defaults to the three dots). */
  icon?: LucideIcon;
  /** Hide the text and show only the icon (still announced to screen readers). */
  iconOnly?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  align?: "start" | "end";
  /** Open upwards (used by the phone action bar at the bottom of the screen). */
  side?: "bottom" | "top";
  className?: string;
  menuClassName?: string;
  children: ReactNode;
};

export function ActionMenu({
  label = "More", icon: Icon = MoreHorizontal, iconOnly, variant = "secondary", size = "md", align = "end", side = "bottom",
  className, menuClassName, children,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      // An armed ConfirmButton handles its own Escape first.
      if (e.key === "Escape" && !e.defaultPrevented) { setOpen(false); btn.current?.focus(); }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    const first = root.current?.querySelector<HTMLElement>("[data-menu] a, [data-menu] button");
    first?.focus();
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={root} className={cx("relative", className)}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={buttonClass(variant, size, iconOnly ? (size === "sm" ? "w-8 px-0" : "w-9.5 px-0") : undefined)}
        title={iconOnly ? label : undefined}
      >
        <Icon className="icon-sm" aria-hidden />
        {iconOnly ? <span className="sr-only">{label}</span> : label}
      </button>
      {open && (
        <div
          id={id}
          data-menu
          onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}
          className={cx(
            "ui-pop absolute z-40 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-1.5 shadow-lg",
            align === "end" ? "right-0" : "left-0",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
            // Plain buttons and links placed inside read as menu rows.
            "[&_form]:w-full [&>a]:w-full [&>form>button]:w-full [&>a]:justify-start [&>form>button]:justify-start",
            menuClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** A menu row that navigates. Works inside ActionMenu from server components. */
export function MenuLink({ icon: Icon, children, className, danger, ...p }: ComponentProps<typeof Link> & { icon?: LucideIcon; danger?: boolean }) {
  return (
    <Link
      className={cx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-muted",
        danger ? "text-danger" : "text-ink", className)}
      {...p}
    >
      {Icon && <Icon className="icon-sm text-ink-soft" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Link>
  );
}

/** Thin separator with an optional caption between groups of menu rows. */
export function MenuSeparator({ label }: { label?: string }) {
  return label
    ? <div className="mt-1.5 border-t border-line px-2.5 pb-1 pt-2 text-overline uppercase text-ink-faint">{label}</div>
    : <div className="my-1.5 border-t border-line" role="separator" />;
}
