# UX audit: LBE Fire Safety CRM (version 2)

Prepared by Sirah Digital, November 2026. This audit covers all 94 page routes under `app/src/app/(app)`. It was written after five developers built about 12 new modules in parallel. Each module works. The problem is that they do not feel like one product: headers, actions, filters, tables, chips and print layouts differ from screen to screen. This document lists what we found and the target pattern for every page type. The fixes are in `docs/DESIGN_SYSTEM.md` and `app/src/components/patterns`.

## 1. Route inventory

Page types:

- **List**: a searchable, filterable list of records.
- **Detail**: one record with its actions.
- **Form**: create or edit a record.
- **Wizard**: a step-by-step create flow.
- **Board**: records in status columns or buckets.
- **Document**: a printable A4 document.
- **Report**: numbers and charts.
- **Settings**: configuration screens.
- **Dashboard**: a hub page with KPIs.

A route marked "ref" has already been rebuilt on the new patterns as the reference page.

### Home and automation

| Route | Type | Notes |
|---|---|---|
| `/` | Dashboard | Custom hero instead of PageHeader. Hard-coded `bg-white` buttons on the hero. 15 stat tiles. Has a loading skeleton. |
| `/alerts` | List | Shows cards instead of a table. Custom GET form with a fixed width select. |
| `/agents` | Dashboard | Ad hoc `h2 text-lg` heading. No filters. |

### Sell

| Route | Type | Notes |
|---|---|---|
| `/quotations` | List (ref) | Its own pill component plus a separate amber "awaiting approval" pill, and a 6-column GET grid. |
| `/quotations/new` | Wizard | Two or three PageHeaders depending on the step. Uses a raw `window.confirm` in the editor. |
| `/quotations/[id]` | Detail | 4 native confirms. 4 details/summary disclosures for won, lost, email and follow-up. 8 hard-coded colours. Several amber banners. |
| `/quotations/[id]/edit` | Form | Fixed bottom save bar. Editable grid is a raw table 1080px wide. |
| `/quotations/[id]/print` | Document | Centred uppercase title. Uses `getCompanySettings`, not `getCompany`. |
| `/boq-import` | Wizard | Hand-made amber chips. Fixed `lg:w-80` panel. |
| `/follow-ups` | Board | Ad hoc section headings with dot colours. Filter form sits at the bottom of the page. "Mark lost" has no confirm, unlike the same action on the quotation page. |
| `/customers` | List | FilterBar, Table, EmptyState, Pager. |
| `/customers/new`, `/customers/[id]/edit` | Form | Buttons inline at the end. Not sticky. |
| `/customers/[id]` | Detail | Uses LinkTabs. 6 tables. 9 stat tiles. Ad hoc "Nothing outstanding." text. |
| `/boq-templates` | List | FilterBar and Table. |
| `/boq-templates/new`, `/boq-templates/[id]/edit` | Form | Raw table 900px wide. Not sticky. |
| `/boq-templates/[id]` | Detail | Delete is a danger button with a conditional confirm. |

### Deliver

| Route | Type | Notes |
|---|---|---|
| `/orders` | List | The only page with a phone card fallback, built by hand with duplicated markup. |
| `/orders/new` | Form | GET picker, then a line editor. Not sticky. |
| `/orders/[id]` | Detail (ref) | 7 header buttons in one row. Hand-made red alert banner. Fixed `w-64` popover for line updates. 2 native confirms. |
| `/orders/[id]/challan/[deliveryId]` | Document | Copy of the letterhead markup. Raw table. Not under a `/print` path. |
| `/returns` | List | Copy of BillingNav markup for its tabs. FilterBar classes copied by hand. Two PageHeaders. |
| `/returns/new`, `/returns/vendor/new` | Wizard | Two or three PageHeaders. Mix of EmptyState and ad hoc empty text. |
| `/returns/[id]/edit`, `/returns/vendor/[id]/edit` | Form | Native confirm on post. |
| `/returns/[id]`, `/returns/vendor/[id]` | Detail | Amber draft banner. Native confirm for both delete and post. |
| `/returns/[id]/print` | Document (ref) | Was NotePrint. |
| `/returns/vendor/[id]/print` | Document | Was NotePrint. Now uses DocumentSheet through NotePrint. |

### Buy

| Route | Type | Notes |
|---|---|---|
| `/purchase-orders` | List | Duplicate of the quotation pill component. GET grid. |
| `/purchase-orders/new`, `/purchase-orders/[id]/edit` | Form | Sticky bottom footer. This is the good pattern. |
| `/purchase-orders/[id]` | Detail | Close and Cancel each use details/summary and a native confirm, so two layers of friction. 6 stat tiles. |
| `/purchase-orders/[id]/print` | Document | Quotation style title. PrintButton imported from the quotations module. |
| `/purchases` | List | GET grid and Pager. |
| `/purchases/new`, `/purchases/[id]/edit` | Form | Sticky footer. Hand-made amber chip. |
| `/purchases/[id]` | Detail | No EmptyState. Ad hoc "No payments recorded." text. |
| `/vendors` | List | FilterBar and Table. |
| `/vendors/new`, `/vendors/[id]/edit` | Form | Buttons inline at the end. |
| `/vendors/[id]` | Detail | Ad hoc empty text. |
| `/items` | List | LinkTabs. Sticky first column. Has a loading skeleton. |
| `/items/new`, `/items/[id]/edit` | Form | 14 fields, inline buttons. |
| `/items/[id]` | Detail | 6 tables. Price chart. Ad hoc empty text. |
| `/stock` | List | LinkTabs. Two GET forms, one with a fixed `w-48` and no breakpoint. Red tinted low stock rows. |
| `/stock/[itemId]` | Detail | 17 fields inline. 3 ad hoc empty texts. |

### Money

| Route | Type | Notes |
|---|---|---|
| `/billing` | Dashboard | BillingNav tabs, 8 stat tiles, ageing table. |
| `/billing/invoices` | List | GET grid with a "Filter" button. Every other list says "Apply". |
| `/billing/invoices/new` | Form | Line editor. Native confirm on issue. Not sticky. |
| `/billing/invoices/[id]` | Detail | 2 native confirms. 7 fields inline. |
| `/billing/invoices/[id]/print` | Document | Copy of the letterhead markup. 2 raw tables. |
| `/billing/receipts/[paymentId]` | Document | Ad hoc letterhead. No toolbar pattern. |
| `/billing/receivables` | List | Ageing table. |
| `/billing/receivables/[customerId]` | Detail | Statement view. GET form inside a card. Native confirm on "send statement". |
| `/billing/payables` | List | "Pay" opens a fixed `w-60` popover. |
| `/billing/payments` | List and form | Form and list on one page. Ad hoc empty text. |
| `/billing/advances` | List and form | Inline form. DL. |
| `/reports` | Report | Its own inline tab nav. 2 GET forms copying FilterBar. 13 hard-coded colours, the most of any page. Title is "Profit & Reports", in title case. No Flash. |
| `/emails` | List | Rounded-full pills that use `aria-current="true"` instead of `"page"`. Errors shown in `text-red-600`. |
| `/emails/[id]` | Detail | `bg-white` iframe. |

### Projects and site

| Route | Type | Notes |
|---|---|---|
| `/projects` | List | FilterBar and budget bar. |
| `/projects/new`, `/projects/[id]/edit` | Form | Buttons inline. |
| `/projects/[id]` | Detail and report | Local `TabLink` component. 8 kit tables plus 2 raw tables. 11 stat tiles. 454 lines. No loading skeleton. |
| `/projects/[id]/history` | Report | Its own history feed and a third PrintButton. |
| `/expenses` | List | GET form with fixed width selects. Raw totals table. Bulk reject uses a native confirm. |
| `/expenses/new` | Form | Voucher form. |
| `/expenses/[id]` | Detail | "Delete voucher" is a secondary button, not danger. |

### Service

| Route | Type | Notes |
|---|---|---|
| `/amc` | List | FilterBar, Table, EmptyState. |
| `/amc/new` | Form | 13 fields, inline buttons. |
| `/amc/[id]` | Detail | 9 link buttons. 3 ad hoc empty texts. Native confirm on cancel. |
| `/amc/[id]/print`, `/amc/[id]/visits/[visitId]/print` | Document | AMC Letterhead component. Raw tables. |
| `/amc/[id]/visits/[visitId]` | Detail and form | Sticky top progress bar. Native confirm for "missed". |
| `/service-calls` | Board | 4 status columns. FilterBar plus a separate "Clear filters" text link. |
| `/service-calls/new` | Form | Call form. |
| `/service-calls/[id]` | Detail | No confirm and no empty states. |
| `/refills` | Board | Bucket cards act as filters, with their own colour map. |
| `/refills/new` | Form | Asset form plus bulk add. |
| `/refills/[id]` | Detail | Native confirm on retire. Ad hoc empty text. |

### Admin

| Route | Type | Notes |
|---|---|---|
| `/meeting-notes` | List | FilterBar and Table. |
| `/meeting-notes/new`, `/meeting-notes/[id]/edit` | Form | Fields inside a Card. |
| `/meeting-notes/[id]` | Detail | Cards only. Transcript in a details disclosure. |
| `/meeting-notes/[id]/revisions/[revId]` | Detail | Hand-made amber `role="note"` banner. No Flash. |
| `/settings` | Settings | The settings layout supplies the header and SettingsNav. 18 fields. |
| `/settings/users` | Settings | Fixed `w-72` popover for password reset. Native confirm on deactivate. |
| `/settings/system` | Settings | DL only. No Flash. |
| `/settings/audit` | Report | GET form. JSON in a disclosure. |
| `/help` | Settings | Guide pills in a solid brand colour, a fourth pill style. |

## 2. Inconsistencies found

### Headers

- 80 of 94 pages use `PageHeader`. The other 14 build their own: the home hero, 9 document pages and the 4 settings routes, which get their header from the layout.
- Back navigation comes in two forms. Most pages use the `back` prop. Print pages use a ghost button with an arrow glyph: "← Back to quotation", "← Back to PO", "← Back".
- Status is sometimes inside the title, sometimes in the subtitle, and sometimes only in a card.
- Three pages render two or three PageHeaders depending on the step: `/returns/new`, `/reports` and `/quotations/new`.
- Section headings use 9 different class strings across 18 places.

### Action placement

- Detail pages put every action in one header row. `/orders/[id]` had 7 buttons, `/amc/[id]` had 9 link buttons and `/quotations/[id]` had 4 disclosures. On a 375px phone these wrap into three or four lines above the content.
- Destructive and rare actions (close, cancel, reopen, delete) sit next to the main action, at the same visual weight.
- 35 destructive buttons across 24 files use the browser's `window.confirm`. Browsers style that popup themselves, it cannot be translated, and Playwright has to accept it specially.
- Two PO actions wrap a native confirm inside a details disclosure.
- "Reject with note" is red but has no confirm. "Delete voucher" is grey.
- There was no "create" shortcut. Creating an expense or a service call meant first finding the module in a 25 item sidebar.

### Filters

- Only 7 pages use `FilterBar`. 17 pages hand-build a `<form method="get">`, and 2 of those copy FilterBar's classes by hand.
- The submit label varies: "Filter" (13 times), "Apply" and "Apply filters".
- Reset varies too: a "Clear" button, a "Reset" ghost button, or a "Clear filters" text link.
- There are 5 different status pill implementations: quotations, purchase orders (a copy of quotations), emails (rounded-full, wrong `aria-current`), help (solid brand) and refills (cards as toggles).

### Tables and mobile

- 42 pages use the Table kit. Raw `<table>` appears in 13 files: 9 print templates, 3 editable grids and 2 project tables.
- Only `/orders` has a phone card view, and it is built by duplicating the markup.
- Every other wide table scrolls sideways on a phone. For site engineers and store staff on phones, the most important columns (status, pending quantity) end up off screen.
- Three editable grids set their own minimum width (900px, 960px and 1080px) with their own input styles.

### Empty states

- 46 pages have no `EmptyState`. About 26 of them are forms or prints, where that is fine.
- About 35 ad hoc "No ..." texts in about 20 pages mix `text-ink-soft` and `text-ink-faint`.
- Wording drifts ("yet." vs "recorded." vs no full stop).
- Filtered lists and genuinely empty lists often show the same message, so people cannot tell whether a filter is hiding records.

### Status chips

- `StatusBadge` capitalised every word with CSS ("Partially Paid") instead of using sentence case.
- `cancelled` was red on some screens and grey on others. That made a normal outcome look like an error.
- Hand-made chips exist in cost-meta, purchase-form, boq-review, SlaChip and SystemChips, plus dot colours on follow-ups.
- There are 513 raw palette classes (`text-red-600`, `bg-amber-50` and others) in 69 files outside the kit. Dark mode works only where someone remembered to add the `dark:` variant.

### Tabs

There were 6 tab implementations:

- `LinkTabs` in items
- `BillingNav`
- `SettingsNav`
- an inline list in returns
- an inline nav in reports
- a local `TabLink` in projects

They look alike but differ in hover, markup and accessibility.

### Spacing and typography

- Pages use `mb-4`, `mb-6` and `space-y-4` inconsistently between header, stats, filters and tables.
- Card titles, section headings and stat values use different font sizes on different pages.
- Icon sizes vary: `h-4 w-4`, `h-[18px] w-[18px]` and `h-5 w-5` all appear for the same purpose.

### Forms

- All forms use `Field`, which is good.
- Only 3 forms have a persistent footer. The rest put Save at the very end of a long page, so phone users must scroll to the bottom to save.
- Fixed width popover forms (`w-60`, `w-64`, `w-72`) are cramped on phones.

### Print documents

- There are five different letterhead patterns: the AMC Letterhead, NotePrint, three copies of the letterhead markup, and the quotation-style centred title used by quotation and PO.
- There are three PrintButton components, imported across modules.
- Printing in dark mode would have printed light grey text, because the colour tokens were not reset for print.

### Navigation

- The sidebar had 25 entries in 8 groups organised by data type. "Returns" sat under Sales, "Refill tracker" under Sales, and "Alerts" under Overview.
- No group could be collapsed.
- On phones the only way to move between modules was the hamburger drawer.

### Loading states and flash messages

- Only 5 of 94 routes have a `loading.tsx`. Heavy detail pages such as `/projects/[id]` and `/orders/[id]` show a blank page while they load.
- `Flash` is missing on several pages that run actions: reports, settings/system, settings/audit, meeting note revisions and project history.

## 3. Target pattern per page type

Every page type maps to one scaffold in `@/components/patterns`. The reference pages show the exact usage.

| Page type | Scaffold | Reference |
|---|---|---|
| List | `ListPage` with `MetricStrip`, `FilterPills`, `ListFilters`, `ResponsiveTable`, `Pagination`, `ListEmpty` | `quotations/(list)/page.tsx` |
| Detail | `DetailPage` with `MetaChip`, primary, secondary and more actions, `ConfirmButton`, `Callout`, `Tabs`, `SectionCard`, aside | `orders/[id]/page.tsx` |
| Form | `FormPage`, `FormSection`, `FormFooter`, `LineItemsTable` and `li` classes, `MoneySummary` | Spec in DESIGN_SYSTEM.md |
| Wizard | `FormPage` with a step label in `eyebrow` ("Step 1 of 2") and one PageHeader whose title changes per step. Each step ends in a `FormFooter` with Back and Next. | Spec in DESIGN_SYSTEM.md |
| Board | `ListPage` with the board as `children`. Columns are `SectionCard`s with a `count` and an `empty` message. Filters use `FilterPills` and `ListFilters`. | Spec in DESIGN_SYSTEM.md |
| Document | `DocumentSheet` with `DocTable`, `GstSummaryTable`, `DocTotals`, `DocNotes` and `DocSignature`, plus a `DocumentSkeleton` loading state | `returns/[id]/print/page.tsx` |
| Report | `ListPage` without a primary action. `Tabs` for report sections, `MetricStrip`, `SectionCard`s holding charts that use the chart colour tokens, and a table view under every chart. | Spec in DESIGN_SYSTEM.md |
| Settings | Settings layout with `Tabs` (replacing SettingsNav), `FormSection`s and `FormFooter` | Spec in DESIGN_SYSTEM.md |
| Dashboard | `MetricStrip` rows and `SectionCard`s. The hero stays on home only, and its buttons use tokens rather than `bg-white`. | Home |

## 4. What was already fixed globally (no module change needed)

- **Navigation.**
  - The sidebar has 9 task-based groups that can be collapsed, and each item still checks its module permission.
  - There is a "New" quick create menu in the top bar, filtered by write access.
  - Phones and tablets get a bottom tab bar with four destinations chosen per role, plus More.
  - The command palette lists the same create actions.
- **Every `SubmitButton confirm="..."`** now asks with an inline two-step confirm instead of the browser popup. This covers all 35 existing uses, with no code change in the modules.
- **`StatusBadge`** now uses the shared status vocabulary, so colours agree across modules. Labels are now sentence case.
- **Sticky and fixed bottom bars** in quote-editor, po-form and purchase-form now sit above the phone tab bar.
- **Print** always uses black text on white paper, even from dark mode.
