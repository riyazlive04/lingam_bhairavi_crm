"use client";
/** Upload step of the consultant BOQ import. After a successful analysis it shows the review screen. */
import { startTransition, useActionState, useState } from "react";
import { CircleAlert, FileSpreadsheet, ListChecks, Upload, WandSparkles } from "lucide-react";
import { Button, Card, Field, Input } from "@/components/ui";
import { BOQ_MAX_FILE_BYTES, fileTypeProblem } from "@/lib/boq-import";
import { analyseBoq } from "../actions";
import type { AnalyseState, ImportCatalogItem } from "../_lib/types";
import { BoqReview } from "./boq-review";
import { CustomerPicker } from "./pickers";

const INITIAL: AnalyseState = { status: "idle" };

export type BoqImportProps = {
  customers: { id: number; name: string; city: string | null }[];
  catalog: ImportCatalogItem[];
  showCost: boolean;
  defaultMarkup: number;
  gstPct: number;
  today: string;
  canTemplate: boolean;
  initialCustomerId: number | null;
};

export function BoqImport(props: BoqImportProps) {
  const [state, formAction, pending] = useActionState(analyseBoq, INITIAL);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<number | null>(props.initialCustomerId);
  const [projectName, setProjectName] = useState("");
  const [siteLocation, setSiteLocation] = useState("");
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  if (state.status === "ok" && state.token !== dismissed) {
    return (
      <BoqReview
        key={state.token}
        data={state.data}
        catalog={props.catalog}
        showCost={props.showCost}
        defaultMarkup={props.defaultMarkup}
        defaultGst={props.gstPct}
        today={props.today}
        canTemplate={props.canTemplate}
        onReset={() => { setDismissed(state.token); setFile(null); }}
      />
    );
  }

  const serverError = state.status === "error" ? state.message : null;
  const error = fileError ?? serverError;
  const ready = customerId != null && file != null && !fileError;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form
        className="space-y-6 lg:col-span-2"
        aria-describedby={error ? "boq-upload-error" : undefined}
        onSubmit={(e) => {
          // Submit manually so React does not reset the form (the chosen customer and file stay put on errors).
          e.preventDefault();
          if (!ready || pending) return;
          const fd = new FormData(e.currentTarget);
          startTransition(() => formAction(fd));
        }}
      >
        <Card title="Upload the consultant's BOQ" icon={Upload} subtitle="Excel (.xlsx) or CSV, up to 8 MB">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer" required className="sm:col-span-2" hint="The quotation is made out to this customer">
              <CustomerPicker customers={props.customers} value={customerId} onChange={setCustomerId} />
            </Field>
            <Field label="Project name">
              <Input name="projectName" maxLength={200} value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Hydrant and sprinkler for new plant" />
            </Field>
            <Field label="Site location">
              <Input name="siteLocation" maxLength={200} value={siteLocation} onChange={(e) => setSiteLocation(e.target.value)} placeholder="e.g. SIPCOT Phase II, Hosur" />
            </Field>
            <Field label="BOQ file" required className="sm:col-span-2" hint="All sheets are read. Formulas are not run; we read the values Excel saved.">
              <Input
                name="file"
                type="file"
                required
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) { setFile(null); setFileError(null); return; }
                  const problem = fileTypeProblem(f.name) ?? (f.size > BOQ_MAX_FILE_BYTES ? "The file is larger than 8 MB. Remove pictures or extra sheets and try again." : f.size === 0 ? "The file is empty." : null);
                  setFileError(problem);
                  setFile(problem ? null : { name: f.name, size: f.size });
                  if (problem) e.target.value = "";
                }}
              />
            </Field>
          </div>
          {error && (
            <div id="boq-upload-error" role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            {!ready && !pending && <span className="text-xs text-ink-soft">Choose a customer and a file to continue</span>}
            <Button type="submit" disabled={!ready || pending}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              {pending ? "Reading the BOQ…" : "Read BOQ and match items"}
            </Button>
          </div>
        </Card>
      </form>

      <aside aria-labelledby="boq-how" className="h-fit rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 id="boq-how" className="text-[0.9375rem] font-semibold text-ink">How it works</h2>
        <ol className="mt-4 space-y-4">
          <Step n={1} icon={Upload} title="Upload the BOQ">
            Use the Excel file exactly as the customer or consultant sent it. Every sheet is read, with its sections and BOQ refs.
          </Step>
          <Step n={2} icon={WandSparkles} title="Check the matches">
            Each row is matched to an item in your catalogue with the latest purchase price and date. Green rows are matched, amber rows need a quick look, grey rows are priced by hand.
          </Step>
          <Step n={3} icon={ListChecks} title="Create the quotation">
            A draft quotation is created with the consultant&apos;s own descriptions. Approval rules then apply as usual before it is sent.
          </Step>
        </ol>
        <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-xs text-ink-soft">
          Rows with zero quantity are left out of the quotation, as per your rule. You can still enter a quantity on the review screen.
        </p>
      </aside>
    </div>
  );
}

function Step({ n, icon: Icon, title, children }: { n: number; icon: typeof Upload; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-950/60 dark:text-brand-300" aria-hidden>{n}</span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink"><Icon className="h-4 w-4 text-ink-faint" aria-hidden />{title}</p>
        <p className="mt-0.5 text-sm text-ink-soft">{children}</p>
      </div>
    </li>
  );
}
