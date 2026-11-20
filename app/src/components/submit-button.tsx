"use client";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui";
import type { ComponentProps } from "react";

/** Submit button that disables itself while its server action is running. */
export function SubmitButton({
  children, pendingText = "Saving…", variant = "primary", size = "md", className, confirm, ...p
}: ComponentProps<"button"> & { pendingText?: string; variant?: "primary" | "secondary" | "ghost" | "danger" | "success"; size?: "sm" | "md" | "lg"; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || p.disabled}
      className={buttonClass(variant, size, className)}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
      {...p}
    >
      {pending ? pendingText : children}
    </button>
  );
}
