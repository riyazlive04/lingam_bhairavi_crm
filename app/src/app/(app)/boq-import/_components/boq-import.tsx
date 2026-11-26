"use client";
/** Upload step of the consultant BOQ import (step 1 of 2). After a successful analysis it shows the review screen. */
import { startTransition, useActionState, useState, type ReactNode } from "react";
import { FileSpreadsheet, ListChecks, Upload, WandSparkles } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { Callout, FormFooter, FormPage, FormSection, SectionCard } from "@/components/patterns";
import { BOQ_MAX_FILE_BYTES, fileTypeProblem } from "@/lib/boq-import";
import { analyseBoq } from "../actions";
import type { AnalyseState, ImportCatalogItem } from "../_lib/types";
import { BoqReview } from "./boq-review";
import { CustomerPicker } from "./pickers";

const INITIAL: AnalyseState = { status: "idle" };

export type BoqImportProps = {
  /** Page subtitle for the upload step. */
  intro: string;
  /** <Flash /> from the server page. */
  notices?: ReactNode;
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
    <FormPage eyebrow="Step 1 of 2" title="Import consultant BOQ" subtitle={props.intro} back={{ href: "/quotations", label: "Quotations" }} notices={props.notices}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form
          className="min-w-0 space-y-4"
          aria-describedby={error ? "boq-upload-error" : undefined}
          onSubmit={(e) => {
            // Submit manually so React does not reset the form (the chosen customer and file stay put on errors).
            e.preventDefault();
            if (!ready || pending) return;
            const fd = new FormData(e.currentTarget);
            startTransition(() => formAction(fd));
          }}
        >
          <FormSection title="Upload the consultant's BOQ" description="Excel (.xlsx) or CSV, up to 8 MB.">
            <Field label="Customer" required className="sm:col-span-2" hint="The quotation is made out to this customer">
              <CustomerPicker customers={props.customers} value={customerId} onChange={setCustomerId} />
            </Field>
            <Field label="Project name">
              <Input name="projectName" maxLength={200} value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="For example: hydrant and sprinkler for new plant" />
            </Field>
            <Field label="Site location">
              <Input name="siteLocation" maxLength={200} value={siteLocation} onChange={(e) => setSiteLocation(e.target.value)} placeholder="For example: SIPCOT Phase II, Hosur" />
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
            {error && (
              <div id="boq-upload-error" className="sm:col-span-2">
                <Callout tone="danger" title="We could not read this file">{error}</Callout>
              </div>
            )}
          </FormSection>
          <FormFooter cancelHref="/quotations" note={!ready && !pending ? "Choose a customer and a file to continue." : undefined}>
            <Button type="submit" disabled={!ready || pending}>
              <FileSpreadsheet className="icon-sm" aria-hidden />
              {pending ? "Reading the BOQ…" : "Read BOQ and match items"}
            </Button>
          </FormFooter>
        </form>

        <SectionCard title="How it works" className="h-fit">
          <ol className="space-y-4">
            <Step n={1} icon={Upload} title="Upload the BOQ">
              Use the Excel file exactly as the customer or consultant sent it. Every sheet is read, with its sections and BOQ refs.
            </Step>
            <Step n={2} icon={WandSparkles} title="Check the matches">
              Each row is matched to an item in your catalogue with the latest purchase price and date. Matched rows are ready, rows marked &ldquo;Check&rdquo; need a quick look, and rows with no match are priced by hand.
            </Step>
            <Step n={3} icon={ListChecks} title="Create the quotation">
              A draft quotation is created with the consultant&apos;s own descriptions. Approval rules then apply as usual before it is sent.
            </Step>
          </ol>
          <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-caption text-ink-soft">
            Rows with zero quantity are left out of the quotation. You can still enter a quantity on the review screen.
          </p>
        </SectionCard>
      </div>
    </FormPage>
  );
}

function Step({ n, icon: Icon, title, children }: { n: number; icon: typeof Upload; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-950/60 dark:text-brand-300" aria-hidden>{n}</span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink"><Icon className="icon-sm text-ink-faint" aria-hidden />{title}</p>
        <p className="mt-0.5 text-sm text-ink-soft">{children}</p>
      </div>
    </li>
  );
}
