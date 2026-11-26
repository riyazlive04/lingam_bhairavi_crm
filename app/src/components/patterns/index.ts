/**
 * Page patterns for the LBE Fire Safety CRM. Import from "@/components/patterns".
 * Read docs/DESIGN_SYSTEM.md first; the three reference pages show every pattern in use:
 *   - List page:      src/app/(app)/quotations/(list)/page.tsx
 *   - Detail page:    src/app/(app)/orders/[id]/page.tsx
 *   - Document print: src/app/(app)/returns/[id]/print/page.tsx
 *
 * Server-safe unless marked (client). Client components can still be rendered from server pages.
 * Query-string helpers for filter links live in "@/lib/url" (qs, withParams, searchString).
 *
 * @example List page
 * <ListPage title="Vendors" primaryAction={<LinkButton href="/vendors/new">New vendor</LinkButton>}
 *   filters={<ListFilters q={sp.q} clearHref="/vendors" activeCount={sp.q ? 1 : 0} />}
 *   isEmpty={!rows.length} empty={<ListEmpty filtered={!!sp.q} noun="vendors" clearHref="/vendors" />}>
 *   <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => r.id} />
 * </ListPage>
 *
 * @example Detail page
 * <DetailPage back={{ href: "/amc", label: "AMC" }} title={c.number} status={<StatusPill status={c.status} />}
 *   primaryAction={...} moreActions={<form action={cancel}><ConfirmButton variant="ghost" confirm="Cancel this contract?">Cancel contract</ConfirmButton></form>}
 *   tabs={<Tabs basePath={`/amc/${c.id}`} params={sp} active={tab} items={[...]} />} aside={<SectionCard title="Summary">...</SectionCard>}>
 *   ...
 * </DetailPage>
 *
 * @example Form page
 * <FormPage title="New expense" back={{ href: "/expenses", label: "Expenses" }}>
 *   <form action={save}><FormSection title="Voucher">...</FormSection><FormFooter cancelHref="/expenses"><SubmitButton>Save voucher</SubmitButton></FormFooter></form>
 * </FormPage>
 */
export { ListPage, ListFilters, ListEmpty, Pagination, type ListPageProps } from "./list-page";
export { ResponsiveTable, type Column, type CardSlot, type FooterCell, type FooterRow, type ResponsiveTableProps } from "./responsive-table";
export { DetailPage, MetaChip, flattenActions, type DetailPageProps } from "./detail-page";
export { FormPage, FormSection, FormFooter, LineItemsTable, li, MoneySummary, type MoneyRow } from "./form-page";
export { SectionCard, Callout, KeyValueGrid, SummaryRows, Metric, MetricStrip, StatusTimeline, ActivityFeed, type KV, type TimelineItem } from "./blocks";
export { Tabs, tabHref, activeTab, type TabItem } from "./tabs";
export { StatusPill, FilterPills, type FilterPillItem } from "./status";
export { STATUS_SEMANTIC, SEMANTIC_TONE, statusLabel, statusSemantic, type StatusSemantic } from "./status-tones";
export { DocumentSheet, DocTable, GstSummaryTable, DocTotals, DocNotes, DocSignature, type DocCompany, type DocParty, type DocumentSheetProps } from "./document-sheet";
export { ProgressBar, type ProgressBarProps } from "./progress-bar";
export { progressTone, progressPercent, type ProgressTone, type ProgressMode } from "./progress-tone";
export { BarChart, niceStep, type BarChartProps, type ChartSeries, type ChartColor } from "./bar-chart";
export { Prose } from "./prose";
// client components
export { ConfirmButton, type ConfirmButtonProps } from "./confirm-button";
export { ActionMenu, MenuLink, MenuSeparator, type ActionMenuProps } from "./action-menu";
export { DensityToggle } from "./density-toggle";
export { PrintButton } from "./print-button";
export { RouteTabs, activeRouteIndex, type RouteTabItem } from "./route-tabs";
export { ClientPills, ClientTabs, clientTabId, type ClientPillItem, type ClientTabItem } from "./client-switch";
