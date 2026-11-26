/**
 * List page scaffold and its parts: header, stat strip, filters, results, pagination, empty state.
 * Server-safe. Maintainer: Sirah Digital.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button, EmptyState, Input, PageHeader, cx } from "../ui";
import { DensityToggle } from "./density-toggle";
import { FilterDisclosure } from "./filter-disclosure";

export type ListPageProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  /** The one main action, usually "New ..." (hide it when the user cannot write). */
  primaryAction?: ReactNode;
  /** Up to two quieter actions (Import, Export). More than that belongs in a menu. */
  secondaryActions?: ReactNode;
  /** <Flash ok err /> and any page-level <Callout>. */
  notices?: ReactNode;
  /**
   * Section or view tabs (<Tabs>), drawn right under the header, before notices, stats and filters.
   * Use it for "Item list / Price master", "Stock on hand / Allocations", report sections, billing sections.
   */
  tabs?: ReactNode;
  /** <MetricStrip> with 2 to 4 <Metric> tiles. */
  stats?: ReactNode;
  /** Usually <FilterPills> (status) above <ListFilters> (search and selects). */
  filters?: ReactNode;
  /** When true, `empty` is shown instead of `children` and pagination. */
  isEmpty?: boolean;
  /** <EmptyState> (use <ListEmpty> for the "no match / nothing yet" pair). */
  empty?: ReactNode;
  /** Results: a <ResponsiveTable>, or cards for board-like lists. */
  children?: ReactNode;
  /** <Pagination>. */
  pagination?: ReactNode;
  /** Show the comfortable / compact switch above the results (data-heavy tables). Default true. */
  density?: boolean;
  /** Small text left of the density switch, e.g. "124 quotations". */
  resultSummary?: ReactNode;
};

/**
 * @example
 * <ListPage
 *   title="Quotations" subtitle="Priced from the latest purchase cost."
 *   tabs={<Tabs basePath="/quotations" params={sp} active={tab} items={[...]} />}
 *   primaryAction={writable && <LinkButton href="/quotations/new"><Plus className="icon-sm" aria-hidden /> New quotation</LinkButton>}
 *   notices={<Flash ok={sp.ok} err={sp.err} />}
 *   stats={<MetricStrip>...</MetricStrip>}
 *   filters={<><FilterPills items={...} /><ListFilters q={sp.q} clearHref="/quotations" activeCount={n}>...selects</ListFilters></>}
 *   isEmpty={rows.length === 0}
 *   empty={<ListEmpty filtered={n > 0} noun="quotations" clearHref="/quotations" action={...} />}
 *   resultSummary={`${total} quotations`}
 *   pagination={<Pagination page={page} pages={pages} total={total} noun="quotations" href={(p) => qs({ page: p })} />}
 * >
 *   <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => r.id} />
 * </ListPage>
 */
export function ListPage({
  title, subtitle, eyebrow, back, primaryAction, secondaryActions, tabs, notices, stats, filters, isEmpty, empty, children, pagination,
  density = true, resultSummary,
}: ListPageProps) {
  const actions = (primaryAction || secondaryActions) ? <>{secondaryActions}{primaryAction}</> : undefined;
  return (
    <div className="space-y-4">
      <PageHeader title={title} subtitle={subtitle} eyebrow={eyebrow} back={back} actions={actions} />
      {tabs && <div className="-mt-2">{tabs}</div>}
      {notices}
      {stats}
      {filters && <div className="space-y-3">{filters}</div>}
      {isEmpty ? empty : (
        <div>
          {(density || resultSummary) && (
            <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
              <p className="text-caption text-ink-soft" aria-live="polite">{resultSummary}</p>
              {density && <DensityToggle className="max-sm:hidden" />}
            </div>
          )}
          {children}
          {pagination}
        </div>
      )}
    </div>
  );
}

/**
 * GET filter bar: search box, any selects / date inputs as children, Apply and Clear.
 * Keep current non-filter params (status pill, tab) with `hidden`.
 * On phones the children fold behind a "Filters (n)" button (open when a filter is active);
 * from 640px they are always shown.
 * @example
 * <ListFilters q={sp.q} placeholder="Search number, customer, project" clearHref="/quotations"
 *   activeCount={countActive} hidden={{ status }}>
 *   <Select name="system" defaultValue={sp.system ?? ""} aria-label="System">...</Select>
 * </ListFilters>
 */
export function ListFilters({ q, placeholder = "Search", children, clearHref, activeCount = 0, hidden, action, searchName = "q" }: {
  q?: string; placeholder?: string; children?: ReactNode; clearHref?: string; activeCount?: number;
  hidden?: Record<string, string | number | null | undefined>; action?: string; searchName?: string | false;
}) {
  return (
    <form method="get" action={action} role="search"
      className={cx(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-2xl border border-line bg-surface p-2 shadow-xs",
        "sm:flex sm:flex-col lg:flex-row lg:flex-wrap lg:items-center",
      )}>
      {hidden && Object.entries(hidden).map(([k, v]) => (v != null && v !== "" ? <input key={k} type="hidden" name={k} value={String(v)} /> : null))}
      {searchName !== false && (
        <label className="relative col-span-2 min-w-0 lg:w-72 lg:flex-none">
          <span className="sr-only">Search</span>
          <Search className="icon-sm pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
          <Input name={searchName} type="search" defaultValue={q} placeholder={placeholder} className="pl-9" />
        </label>
      )}
      {children && (
        <FilterDisclosure activeCount={activeCount} className="max-sm:open:col-span-2 lg:flex-1">
          <div className="grid min-w-0 grid-cols-1 gap-2 max-sm:mt-2 min-[420px]:grid-cols-2 lg:flex lg:flex-wrap lg:[&>*]:w-auto lg:[&>*]:min-w-40">{children}</div>
        </FilterDisclosure>
      )}
      <div className={cx("flex items-center gap-2 lg:ml-auto", children ? "max-sm:col-start-2 max-sm:justify-self-end" : "col-span-2")}>
        <Button variant="secondary" type="submit" className={cx(!children && "max-lg:flex-1", children && "sm:max-lg:flex-1")}>Apply</Button>
        {clearHref && activeCount > 0 && (
          <Link href={clearHref} className="inline-flex h-9.5 items-center gap-1 rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-muted hover:text-ink">
            <X className="icon-sm" aria-hidden /> Clear{activeCount > 1 ? ` (${activeCount})` : ""}
          </Link>
        )}
      </div>
    </form>
  );
}

/** Previous / next pager with a count. Renders nothing for a single page. */
export function Pagination({ page, pages, total, noun = "records", href }: {
  page: number; pages: number; total?: number; noun?: string; href: (page: number) => string;
}) {
  if (pages <= 1) return null;
  const btn = "inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-xs hover:border-line-strong hover:bg-muted";
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-soft">Page {page} of {pages}{total != null ? ` · ${total} ${noun}` : ""}</span>
      <div className="flex gap-2">
        {page > 1 && <Link className={btn} href={href(page - 1)} rel="prev"><ChevronLeft className="icon-sm" aria-hidden /> Previous</Link>}
        {page < pages && <Link className={btn} href={href(page + 1)} rel="next">Next <ChevronRight className="icon-sm" aria-hidden /></Link>}
      </div>
    </nav>
  );
}

/**
 * The two empty states every list needs: nothing matches the filters, or nothing exists yet.
 * @example <ListEmpty filtered={hasFilters} noun="quotations" clearHref="/quotations"
 *   action={writable && <LinkButton href="/quotations/new">Create a quotation</LinkButton>}>
 *   Pick a standard BOQ, enter quantities and prices fill in.</ListEmpty>
 */
export function ListEmpty({ filtered, noun, clearHref, action, title, children }: {
  filtered: boolean; noun: string; clearHref?: string; action?: ReactNode; title?: string; children?: ReactNode;
}) {
  if (filtered) {
    return (
      <EmptyState icon={Search} title={title ?? `No ${noun} match these filters`}
        action={clearHref && <Link href={clearHref} className={cx("text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300")}>Clear all filters</Link>}>
        Try a shorter search or remove a filter.
      </EmptyState>
    );
  }
  return <EmptyState title={title ?? `No ${noun} yet`} action={action}>{children}</EmptyState>;
}
