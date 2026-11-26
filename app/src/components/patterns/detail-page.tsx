/**
 * Detail page scaffold: back link, title row (document number, status, meta chips), sticky action
 * bar, optional tabs, main column plus right sidebar. On phones the actions move to a bar fixed
 * above the bottom tab bar: the primary action stays visible and everything else goes in "More".
 * Server-safe. Maintainer: Sirah Digital.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cx } from "../ui";
import { ActionMenu, MenuSeparator } from "./action-menu";

export type DetailPageProps = {
  back?: { href: string; label: string };
  /** Small label above the title, e.g. "Customer order" or "Credit note". */
  eyebrow?: ReactNode;
  /** Usually the document number ("SO-2026-0042") or the record name. */
  title: ReactNode;
  /** <StatusPill status=... /> and any extra state chips. */
  status?: ReactNode;
  /** Key facts under the title: customer, PO number, dates. Use <MetaChip>. */
  meta?: ReactNode;
  /** The one thing people most often do next. Hide it when the user cannot do it (RBAC). */
  primaryAction?: ReactNode;
  /** Two or three common actions. On phones they move into the More menu. */
  secondaryActions?: ReactNode;
  /** Rare or destructive actions (close, cancel, delete, reopen). Use ConfirmButton for anything destructive. */
  moreActions?: ReactNode;
  /** <Flash /> and <Callout> messages. */
  notices?: ReactNode;
  /** <Tabs /> */
  tabs?: ReactNode;
  /** Right column: summary card, related records, activity. Stacks under the main column below 1024px. */
  aside?: ReactNode;
  children: ReactNode;
};

/**
 * @example
 * <DetailPage
 *   back={{ href: "/orders", label: "Orders" }} eyebrow="Customer order" title={o.number}
 *   status={<StatusPill status={o.status} />}
 *   meta={<><MetaChip label="Customer">{name}</MetaChip><MetaChip label="PO">{po}</MetaChip></>}
 *   primaryAction={canBill && <LinkButton href=...>Create invoice</LinkButton>}
 *   secondaryActions={<LinkButton variant="secondary" href=...>Record advance</LinkButton>}
 *   moreActions={write && <form action={changeOrderStatus}>...<ConfirmButton variant="ghost" confirm="Close this order?">Close order</ConfirmButton></form>}
 *   notices={<Flash ok={sp.ok} err={sp.err} />}
 *   tabs={<Tabs ... />}
 *   aside={<SectionCard title="Summary">...</SectionCard>}
 * >
 *   ...tab content
 * </DetailPage>
 */
export function DetailPage({ back, eyebrow, title, status, meta, primaryAction, secondaryActions, moreActions, notices, tabs, aside, children }: DetailPageProps) {
  const hasActions = !!(primaryAction || secondaryActions || moreActions);
  return (
    <div>
      {back && (
        <Link href={back.href} className="no-print mb-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-ink-soft hover:text-brand-700 dark:hover:text-brand-300">
          <ArrowLeft className="icon-sm" aria-hidden /> {back.label}
        </Link>
      )}

      {/* Title row. No transform or backdrop filter on phones, or the fixed action bar would be trapped. Sticks under the top bar from 640px so actions stay in reach on long pages. */}
      <div className="z-10 mb-2 py-2 sm:sticky sm:top-16 sm:-mx-6 sm:bg-bg/90 sm:px-6 sm:backdrop-blur-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {eyebrow && <p className="text-overline uppercase text-brand-700 dark:text-brand-300">{eyebrow}</p>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 break-words font-display text-title text-ink">{title}</h1>
              {status && <div className="flex flex-wrap items-center gap-1.5">{status}</div>}
            </div>
          </div>

          {hasActions && (
            <div
              className={cx(
                "no-print flex items-center gap-2",
                // Phones: fixed bar above the bottom tab bar.
                "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-nav-offset max-sm:z-30 max-sm:border-t max-sm:border-line max-sm:bg-surface/95 max-sm:px-4 max-sm:py-2.5 max-sm:shadow-lg max-sm:backdrop-blur-md",
              )}
              aria-label="Actions"
              role="toolbar"
            >
              {secondaryActions && <div className="flex items-center gap-2 max-sm:hidden">{secondaryActions}</div>}
              {primaryAction && <div className="flex items-center gap-2 max-sm:min-w-0 max-sm:flex-1 max-sm:[&>*]:w-full max-sm:[&>form>button]:w-full">{primaryAction}</div>}
              {(secondaryActions || moreActions) && (
                <ActionMenu
                  label="More actions"
                  iconOnly
                  side="bottom"
                  className={cx(!moreActions && "sm:hidden", !primaryAction && "max-sm:ml-auto")}
                  menuClassName="max-sm:bottom-full max-sm:top-auto max-sm:mb-2 max-sm:mt-0"
                >
                  {secondaryActions && <div className="flex flex-col gap-1 sm:hidden [&>*]:w-full [&>*]:justify-start [&_form>button]:w-full [&_form>button]:justify-start">{secondaryActions}</div>}
                  {secondaryActions && moreActions && <div className="sm:hidden"><MenuSeparator /></div>}
                  {moreActions && <div className="flex flex-col gap-1 [&>*]:w-full [&>*]:justify-start [&_form>button]:w-full [&_form>button]:justify-start">{moreActions}</div>}
                </ActionMenu>
              )}
            </div>
          )}
        </div>
      </div>

      {meta && <div className="mb-5 flex flex-wrap items-center gap-2">{meta}</div>}
      {notices && <div className="mb-4 space-y-3">{notices}</div>}
      {tabs && <div className="mb-4">{tabs}</div>}

      <div className={cx("grid gap-4", aside && "lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]")}>
        <div className="min-w-0 space-y-4">{children}</div>
        {aside && <aside className="min-w-0 space-y-4 lg:sticky lg:top-36 lg:self-start" aria-label="Summary">{aside}</aside>}
      </div>

      {/* Room for the fixed phone action bar. */}
      {hasActions && <div className="h-16 sm:hidden" aria-hidden />}
    </div>
  );
}

/**
 * Key fact chip for the detail header.
 * @example <MetaChip label="Customer" href={`/customers/${id}`}>{name}</MetaChip>
 */
export function MetaChip({ label, children, href, icon: Icon }: { label?: string; children: ReactNode; href?: string; icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> }) {
  const inner = (
    <>
      {Icon && <Icon className="icon-xs text-ink-faint" aria-hidden />}
      {label && <span className="text-ink-faint">{label}</span>}
      <span className="truncate font-medium text-ink">{children}</span>
    </>
  );
  const cls = "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-[13px] shadow-xs";
  return href
    ? <Link href={href} className={cx(cls, "hover:border-line-strong hover:bg-muted")}>{inner}</Link>
    : <span className={cls}>{inner}</span>;
}
