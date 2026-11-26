"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ClipboardCopy, FileText, RefreshCw, X } from "lucide-react";
import { Button, Field, Input, Select, Textarea, buttonClass, cx } from "@/components/ui";
import { ResponsiveTable, StatusPill, type Column, type StatusSemantic } from "@/components/patterns";
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

const BUCKET_SEMANTIC: Record<AssetRow["bucket"], StatusSemantic> = { overdue: "danger", due10: "warning", due30: "info", later: "neutral" };
const KINDS = { refill: "Refill", service: "Service or inspection", hpt: "Hydraulic pressure test", replacement: "Replacement" };

function dueLabel(r: AssetRow) {
  if (r.status !== "active") return "Retired";
  if (r.daysLeft < 0) return `${-r.daysLeft} d overdue`;
  if (r.daysLeft === 0) return "Due today";
  return `In ${r.daysLeft} d`;
}

/** Asset list with multi-select: refill quotation link, WhatsApp reminder text and bulk "record refill". */
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

  const columns: Column<AssetRow>[] = [
    {
      key: "sel", label: "Select", card: "actions",
      header: <input type="checkbox" aria-label="Select all active assets" checked={allSelected} onChange={toggleAll} className="icon-sm accent-brand-600" />,
      headerClassName: "w-8",
      cell: (r) => (
        <label className="relative z-[1] inline-flex min-h-9 items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} disabled={r.status !== "active"}
            aria-label={`Select ${r.extType} at ${r.customerName}`} className="icon-sm accent-brand-600" />
          <span className="sm:hidden">Select</span>
        </label>
      ),
    },
    {
      key: "customer", header: "Customer / location", card: "title",
      cell: (r) => (
        <>
          <Link href={`/refills/${r.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{r.customerName}</Link>
          <div className="max-w-56 truncate text-caption font-normal text-ink-soft">{r.location || "-"}</div>
        </>
      ),
    },
    { key: "type", header: "Type", card: "subtitle", nowrap: true, cell: (r) => r.extType },
    { key: "due", header: "Next due", card: "badge", nowrap: true,
      cell: (r) => (
        <div className="flex flex-col items-start gap-1 max-sm:items-end">
          <StatusPill semantic={r.status === "active" ? BUCKET_SEMANTIC[r.bucket] : "neutral"} label={dueLabel(r)} />
          <span className="text-caption text-ink-soft">{fmtDate(r.nextDueDate)}</span>
        </div>
      ) },
    { key: "qty", header: "Qty", align: "right", card: "amount", cell: (r) => r.qty },
    { key: "make", header: "Make / serial", priority: 3, cell: (r) => <>{r.make || "-"}{r.serialNo && <div className="text-caption text-ink-soft">#{r.serialNo}</div>}</> },
    { key: "last", header: "Last refill", nowrap: true, cell: (r) => fmtDate(r.lastRefillDate) },
    { key: "interval", header: "Interval", priority: 3, nowrap: true,
      cell: (r) => (r.refillIntervalMonths % 12 === 0 ? `${r.refillIntervalMonths / 12} yr` : `${r.refillIntervalMonths} mo`) },
    { key: "hpt", header: "HPT due", nowrap: true,
      cell: (r) => <span className={cx(r.hptDue && "font-semibold text-danger")}>{fmtDate(r.hptDueDate)}</span> },
  ];

  return (
    <div>
      <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-sm backdrop-blur-md" aria-live="polite">
        <span className="min-w-0 flex-1 basis-full text-sm text-ink-soft sm:basis-auto">
          {selected.length ? `${selected.length} selected · ${selected.reduce((s, r) => s + r.qty, 0)} units` : "Select due assets of one customer to quote or remind."}
        </span>
        {selected.length > 0 && !oneCustomer && <StatusPill semantic="warning" label="Select assets of one customer only" />}
        {oneCustomer && (
          <>
            <Link href={quoteHref} className={buttonClass("primary", "sm", "max-sm:h-10 max-sm:flex-1")}><FileText className="icon-sm" aria-hidden /> Create refill quotation</Link>
            <Button type="button" size="sm" variant="secondary" onClick={copy} className="max-sm:h-10 max-sm:flex-1">
              <ClipboardCopy className="icon-sm" aria-hidden /> {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed" : "Copy WhatsApp reminder"}
            </Button>
          </>
        )}
        {canWrite && selected.length > 0 && (
          <Button type="button" size="sm" variant="secondary" onClick={() => setShowRecord((v) => !v)} aria-expanded={showRecord} className="max-sm:h-10 max-sm:flex-1">
            <RefreshCw className="icon-sm" aria-hidden /> Record refill
          </Button>
        )}
        {selected.length > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setSel(new Set())} className="max-sm:h-10">
            <X className="icon-sm" aria-hidden /> Clear selection
          </Button>
        )}
      </div>

      {oneCustomer && copied === "fail" && (
        <Textarea readOnly value={text} rows={6} className="mb-3 font-mono text-xs" aria-label="Reminder text to copy manually" />
      )}

      {canWrite && showRecord && selected.length > 0 && (
        <form action={recordAction} className="mb-4 rounded-2xl border border-line bg-surface shadow-sm">
          <input type="hidden" name="back" value={back} />
          {selected.map((r) => <input key={r.id} type="hidden" name="ids" value={r.id} />)}
          <header className="border-b border-line px-4 py-3 sm:px-5">
            <h2 className="text-subheading text-ink">Record service for {selected.length} selected asset{selected.length === 1 ? "" : "s"}</h2>
            <p className="mt-0.5 text-caption text-ink-soft">The next due date moves on from the date you enter.</p>
          </header>
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
            <Field label="Date" required><Input type="date" name="date" required defaultValue={today} max={today} /></Field>
            <Field label="Kind" required>
              <Select name="kind" defaultValue="refill">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </Field>
            <Field label="Amount for job (₹)" hint="Split across assets by qty"><Input type="number" name="amount" min={0} step="0.01" inputMode="decimal" className="text-right" /></Field>
            <Field label="Notes"><Input name="notes" maxLength={1000} /></Field>
          </div>
          <div className="flex justify-end border-t border-line px-4 py-3 sm:px-5">
            <SubmitButton pendingText="Saving…" className="max-sm:w-full">Save service record</SubmitButton>
          </div>
        </form>
      )}

      <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="Extinguishers"
        rowClassName={(r) => cx(sel.has(r.id) && "bg-brand-50/60 dark:bg-brand-950/30", r.status !== "active" && "opacity-60")} />
    </div>
  );
}
