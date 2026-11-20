"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ClipboardCopy, FileText, RefreshCw } from "lucide-react";
import { Badge, Button, Field, Input, Select, Table, Td, Th, Textarea, buttonClass, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { fmtDate } from "@/lib/format";
import { reminderText } from "../_lib/reminder";

export type AssetRow = {
  id: number;
  customerId: number;
  customerName: string;
  location: string | null;
  extType: string;
  make: string | null;
  serialNo: string | null;
  qty: number;
  lastRefillDate: string | null;
  refillIntervalMonths: number;
  nextDueDate: string;
  hptDueDate: string | null;
  daysLeft: number;
  bucket: "overdue" | "due10" | "due30" | "later";
  status: string;
  hptDue: boolean;
};

const BUCKET_TONE = { overdue: "red", due10: "amber", due30: "blue", later: "gray" } as const;
const KINDS = { refill: "Refill", service: "Service / inspection", hpt: "Hydraulic pressure test", replacement: "Replacement" };

function dueLabel(r: AssetRow) {
  if (r.status !== "active") return "Retired";
  if (r.daysLeft < 0) return `${-r.daysLeft} d overdue`;
  if (r.daysLeft === 0) return "Due today";
  return `in ${r.daysLeft} d`;
}

/** Asset list with multi-select → refill quotation link, WhatsApp reminder text, bulk "record refill". */
export function AssetTable({ rows, canWrite, today, recordAction, back }: {
  rows: AssetRow[];
  canWrite: boolean;
  today: string;
  recordAction: (fd: FormData) => Promise<void>;
  back: string;
}) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const [showRecord, setShowRecord] = useState(false);
  const selected = useMemo(() => rows.filter((r) => sel.has(r.id)), [rows, sel]);
  const customerIds = [...new Set(selected.map((r) => r.customerId))];
  const oneCustomer = customerIds.length === 1;
  const activeRows = rows.filter((r) => r.status === "active");
  const allSelected = activeRows.length > 0 && activeRows.every((r) => sel.has(r.id));

  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(activeRows.map((r) => r.id)));

  const quoteHref = oneCustomer
    ? `/quotations/new?${new URLSearchParams({ customerId: String(customerIds[0]), source: "refill", assetIds: selected.map((r) => r.id).join(",") })}`
    : "";
  const text = oneCustomer ? reminderText(selected[0].customerName, selected) : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied(""), 2500);
  };

  return (
    <div>
      <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 shadow-sm" aria-live="polite">
        <span className="text-sm text-ink-soft">
          {selected.length ? `${selected.length} selected · ${selected.reduce((s, r) => s + r.qty, 0)} units` : "Select due assets of one customer to quote or remind."}
        </span>
        {selected.length > 0 && !oneCustomer && <Badge tone="amber">Select assets of one customer only</Badge>}
        {oneCustomer && (
          <>
            <Link href={quoteHref} className={buttonClass("primary", "sm")}><FileText className="h-4 w-4" aria-hidden /> Create refill quotation</Link>
            <Button type="button" size="sm" variant="secondary" onClick={copy}>
              <ClipboardCopy className="h-4 w-4" aria-hidden /> {copied === "ok" ? "Copied!" : copied === "fail" ? "Copy failed" : "Copy WhatsApp reminder"}
            </Button>
          </>
        )}
        {canWrite && selected.length > 0 && (
          <Button type="button" size="sm" variant="secondary" onClick={() => setShowRecord((v) => !v)} aria-expanded={showRecord}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Record refill
          </Button>
        )}
        {selected.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Button>}
      </div>

      {oneCustomer && copied === "fail" && (
        <Textarea readOnly value={text} rows={6} className="mb-3 font-mono text-xs" aria-label="Reminder text to copy manually" />
      )}

      {canWrite && showRecord && selected.length > 0 && (
        <form action={recordAction} className="mb-4 rounded-xl border border-line bg-surface p-4">
          <input type="hidden" name="back" value={back} />
          {selected.map((r) => <input key={r.id} type="hidden" name="ids" value={r.id} />)}
          <p className="mb-3 text-sm font-medium text-ink">Record service for {selected.length} selected asset{selected.length === 1 ? "" : "s"}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Date" required><Input type="date" name="date" required defaultValue={today} max={today} /></Field>
            <Field label="Kind" required>
              <Select name="kind" defaultValue="refill">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </Field>
            <Field label="Amount for job (₹)" hint="Split across assets by qty"><Input type="number" name="amount" min={0} step="0.01" inputMode="decimal" /></Field>
            <Field label="Notes"><Input name="notes" maxLength={1000} /></Field>
          </div>
          <div className="mt-3"><SubmitButton size="sm">Save</SubmitButton></div>
        </form>
      )}

      <Table>
        <thead>
          <tr>
            <Th className="w-8"><input type="checkbox" aria-label="Select all active assets" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-brand-600" /></Th>
            <Th>Customer / location</Th>
            <Th>Type</Th>
            <Th>Make / serial</Th>
            <Th className="text-right">Qty</Th>
            <Th>Last refill</Th>
            <Th>Interval</Th>
            <Th>Next due</Th>
            <Th>HPT due</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={cx("hover:bg-muted/60", sel.has(r.id) && "bg-brand-50/60 dark:bg-brand-800/20", r.status !== "active" && "opacity-60")}>
              <Td>
                <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} disabled={r.status !== "active"} aria-label={`Select ${r.extType} at ${r.customerName}`} className="h-4 w-4 accent-brand-600" />
              </Td>
              <Td>
                <Link href={`/refills/${r.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.customerName}</Link>
                <div className="max-w-56 truncate text-xs text-ink-soft">{r.location || "-"}</div>
              </Td>
              <Td className="whitespace-nowrap">{r.extType}</Td>
              <Td>{r.make || "-"}{r.serialNo && <div className="text-xs text-ink-soft">#{r.serialNo}</div>}</Td>
              <Td className="text-right tabular-nums">{r.qty}</Td>
              <Td className="whitespace-nowrap">{fmtDate(r.lastRefillDate)}</Td>
              <Td>{r.refillIntervalMonths % 12 === 0 ? `${r.refillIntervalMonths / 12} yr` : `${r.refillIntervalMonths} mo`}</Td>
              <Td className="whitespace-nowrap">
                {fmtDate(r.nextDueDate)}
                <div><Badge tone={r.status === "active" ? BUCKET_TONE[r.bucket] : "gray"}>{dueLabel(r)}</Badge></div>
              </Td>
              <Td className={cx("whitespace-nowrap", r.hptDue && "font-semibold text-red-600")}>{fmtDate(r.hptDueDate)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
