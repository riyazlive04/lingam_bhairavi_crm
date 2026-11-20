"use client";
import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui";

/** Opens the browser print dialog (Save as PDF works on phones too). */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("primary", "md", "no-print")}>
      <Printer className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
}
