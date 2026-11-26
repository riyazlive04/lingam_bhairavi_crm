import type { ReactNode } from "react";
import type { getCompany } from "@/lib/billing";

type Company = Awaited<ReturnType<typeof getCompany>>;

/** Company letterhead for printable AMC documents (details from settings "company"). */
export function Letterhead({ company, title, children }: { company: Company; title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-brand-700 print:text-black">{company.name}</h1>
        <p className="whitespace-pre-line text-ink-soft">{company.address}</p>
        {company.gstin && <p>GSTIN: <strong>{company.gstin}</strong></p>}
        <p className="text-ink-soft">{[company.phone && `Ph: ${company.phone}`, company.email].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="sm:text-right">
        <p className="text-lg font-semibold uppercase tracking-wide">{title}</p>
        {children}
      </div>
    </header>
  );
}

export const printCell = "border border-line px-2 py-1.5 align-top";
