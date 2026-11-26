import { fyBounds, isFyLabel, last12Months, type OrderSort } from "@/lib/reports";
import { PROJECT_STATUSES, SYSTEMS } from "@/lib/constants";

export const REPORT_TABS = {
  pnl: "Monthly P&L",
  orders: "Order profit",
  projects: "Project profit",
  customers: "Customer profit",
  items: "Item margins",
} as const;
export type ReportTab = keyof typeof REPORT_TABS;

export type ReportSP = {
  tab?: string; fy?: string; q?: string; kind?: string; sort?: string; status?: string; system?: string; flagged?: string;
};

const SORTS: OrderSort[] = ["margin_asc", "margin_desc", "profit_desc", "revenue_desc", "date_desc"];

/** Normalise the query string shared by the page and the Excel export. */
export function parseReportParams(sp: ReportSP, today: string) {
  const tab: ReportTab = sp.tab && sp.tab in REPORT_TABS ? (sp.tab as ReportTab) : "pnl";
  // P&L defaults to the last 12 months; the order list defaults to all time
  const fyDefault = tab === "pnl" ? "last12" : "all";
  // "all" is not offered for the P&L (it is a monthly view), so it falls back to the last 12 months there
  const fy = sp.fy === "last12" || (sp.fy === "all" && tab !== "pnl") || isFyLabel(sp.fy) ? sp.fy : fyDefault;
  const range = fy === "last12" ? last12Months(today) : fy === "all" ? null : fyBounds(fy);
  return {
    tab,
    fy,
    range,
    q: sp.q?.trim().slice(0, 80) || undefined,
    kind: sp.kind === "supply" ? ("supply" as const) : sp.kind === "project" ? ("project" as const) : undefined,
    sort: SORTS.includes(sp.sort as OrderSort) ? (sp.sort as OrderSort) : "margin_asc",
    status: sp.status && (PROJECT_STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined,
    system: sp.system && sp.system in SYSTEMS ? sp.system : undefined,
    flagged: sp.flagged === "1",
  };
}
export type ReportParams = ReturnType<typeof parseReportParams>;

export function periodLabel(fy: string) {
  return fy === "last12" ? "Last 12 months" : fy === "all" ? "All time" : `FY ${fy} (Apr to Mar)`;
}
