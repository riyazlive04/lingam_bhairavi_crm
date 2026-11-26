/** Serialisable shapes shared by the BOQ import page, its client components and server actions. */
import type { BoqColumns, BoqRow, RowMatch } from "@/lib/boq-import";
import type { CostSource } from "@/lib/pricing";

/** One catalogue item as the review screen sees it. `cost` is null when the viewer may not see buying prices. */
export type ImportCatalogItem = {
  id: number;
  code: string;
  name: string;
  groupName: string;
  size: string | null;
  make: string | null;
  uom: string;
  system: string;
  cost: number | null;
  costDate: string | null;
  costVendorName: string | null;
  costSource: CostSource;
  /** supply rate at the default markup (used when cost is hidden) */
  supplyAtDefault: number;
  erectionRate: number;
  volatile: boolean;
};

export type ReviewRowData = BoqRow & { match: RowMatch | null };
export type ReviewSheet = { name: string; headerRow: number | null; columns: BoqColumns | null; rows: ReviewRowData[] };

export type AnalyseResult = {
  fileName: string;
  customer: { id: number; name: string };
  projectName: string;
  siteLocation: string;
  warnings: string[];
  sheets: ReviewSheet[];
};

export type AnalyseState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; token: string; data: AnalyseResult };

export type CreateState = { status: "idle" } | { status: "error"; message: string };

/** One line posted by the review screen. Cost is never sent: the server re-reads it from the item. */
export type CreateLine = {
  sheet: string;
  rowNo: number;
  section: string | null;
  boqRef: string | null;
  itemId: number | null;
  description: string;
  qty: number;
  uom: string;
  supplyRate: number;
  erectionRate: number;
  remarks: string | null;
  include: boolean;
};

export type CreatePayload = {
  intent: "quote" | "template";
  customerId: number;
  projectName: string;
  siteLocation: string;
  fileName: string;
  markupPct: number;
  gstPct: number;
  saveTemplate: boolean;
  templateName: string;
  /** item rows in the import (the payload may carry fewer lines) */
  rowCount: number;
  lines: CreateLine[];
};
