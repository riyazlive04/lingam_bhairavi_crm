"use client";
import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("primary", "md", "no-print")}>
      <Printer className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
}
