"use client";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui";
import { ConfirmButton } from "./patterns/confirm-button";
import type { ComponentProps } from "react";

/**
 * Submit button that disables itself while its server action is running.
 * With `confirm`, it asks first with an inline two-step confirm (no browser popup).
 */
export function SubmitButton({
  children, pendingText = "Saving…", variant = "primary", size = "md", className, confirm, ...p
}: ComponentProps<"button"> & { pendingText?: string; variant?: "primary" | "secondary" | "ghost" | "danger" | "success"; size?: "sm" | "md" | "lg"; confirm?: string }) {
  const { pending } = useFormStatus();
  if (confirm) {
    // `type` is always submit for the final button inside ConfirmButton.
    const { type: _type, ...rest } = p;
    void _type;
    return (
      <ConfirmButton confirm={confirm} variant={variant} size={size} className={className} pendingText={pendingText}
        confirmVariant={variant === "danger" ? "danger" : "primary"} {...rest}>
        {children}
      </ConfirmButton>
    );
  }
  return (
    <button
      type="submit"
      disabled={pending || p.disabled}
      className={buttonClass(variant, size, className)}
      {...p}
    >
      {pending ? pendingText : children}
    </button>
  );
}
