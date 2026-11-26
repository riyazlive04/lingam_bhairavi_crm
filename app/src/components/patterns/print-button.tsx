"use client";
import { Printer } from "lucide-react";
import { buttonClass } from "../ui";

/** Opens the browser print dialog. "Save as PDF" works on phones too. One shared button for every document. */
export function PrintButton({ label = "Print or save PDF", variant = "primary" }: { label?: string; variant?: "primary" | "secondary" }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass(variant, "md", "no-print")}>
      <Printer className="icon-sm" aria-hidden /> {label}
    </button>
  );
}
