# LBE CRM design system (version 2)

This is the single reference for how every screen in the LBE Fire Safety CRM looks and behaves. The code lives in:

- `app/src/app/globals.css`: tokens, density, responsive table, line grid and document CSS
- `app/src/components/ui.tsx`: primitives such as Button, Field, Input, Badge, Card and Table
- `app/src/components/patterns/`: page scaffolds and blocks. Always import them from `@/components/patterns`.
- `app/src/components/nav.ts`: information architecture, quick create and the phone tab bar

There are three reference pages. When in doubt, copy them:

| Page type | Reference file |
|---|---|
| List | `src/app/(app)/quotations/(list)/page.tsx` |
| Detail | `src/app/(app)/orders/[id]/page.tsx` |
| Document | `src/app/(app)/returns/[id]/print/page.tsx` |

## 1. Tokens

### Colour

Never hard-code `white`, `black` or raw palette colours for meaning. Use these tokens.

| Purpose | Classes |
|---|---|
| Page and surfaces | `bg-bg`, `bg-surface`, `bg-surface-2`, `bg-muted` |
| Lines | `border-line`, `border-line-strong` |
| Text | `text-ink` (primary), `text-ink-soft` (secondary), `text-ink-faint` (hints, never body copy) |
| Brand | `brand-50` to `brand-950`. 600 is the primary button. 700 is links in light mode, 300 in dark. |
| Accent | `accent-50` to `accent-600`. Avatar and highlights only. |
| Success | `text-success`, `bg-success-soft`, `border-success-line` |
| Warning | `text-warning`, `bg-warning-soft`, `border-warning-line` |
| Danger | `text-danger`, `bg-danger-soft`, `border-danger-line` |
| Info | `text-info`, `bg-info-soft`, `border-info-line` |

The semantic tokens switch automatically in dark mode. Replace `text-red-600 dark:text-red-400` with `text-danger`, `bg-amber-50 ... dark:bg-amber-950` with `bg-warning-soft`, and so on.

### Chart colours

The chart colours come from a palette validated for colour-blind separation in both themes.

- **Categorical series:** `--chart-1` to `--chart-8`, also available as `fill-chart-1`, `stroke-chart-1` and `bg-chart-1`. Assign them in fixed order. Never cycle back to the start, and never pick by rank. A ninth series goes into "Other".
- **Status in charts:** `chart-good`, `chart-warning`, `chart-serious` and `chart-critical`. They are reserved for status and never used as "series 4". Always pair them with a label or an icon.
- **Grid and axes:** `stroke-chart-grid` and `stroke-chart-axis`.
- **Rules for every chart:**
  - One y axis only.
  - Show a legend whenever there are 2 or more series.
  - Direct labels on at most a few points.
  - A table view of the same numbers under every chart (the P&L chart already does this).

### Typography

Display headings use Plus Jakarta Sans (`font-display`). Everything else uses Inter. Both are self-hosted by next/font. The CSP allows only self, so never add an external font link.

| Token | Size / line | Use |
|---|---|---|
| `text-display` | 30 / 36, bold | Home hero only |
| `text-title` | 24 / 32, bold, with `font-display` | Page and record titles (PageHeader, DetailPage) |
| `text-heading` | 17 / 24, semibold | Big numbers inside cards, money totals |
| `text-subheading` | 15 / 22, semibold | Card and section titles |
| `text-body` / `text-sm` | 14 / 22 | Body text, table cells, inputs |
| `text-caption` | 12 / 18 | Hints, secondary lines under a cell, meta |
| `text-overline` with `uppercase` | 11 / 16, semibold, tracked | Eyebrows, sidebar group labels, table headers |

### Spacing rhythm (4px grid)

| Gap | Where |
|---|---|
| `space-y-4` (16px) | Between blocks on a page: header, notices, stats, filters, results. ListPage and DetailPage already do this. |
| `gap-3` (12px) | Between stat tiles |
| `gap-4` | Between cards in a grid |
| `p-4 sm:p-5` | Card padding (SectionCard and Card) |
| `gap-4` | Inside a FormSection grid |
| `gap-2` | Between buttons |

### Icons

- Use lucide-react with the size utilities `icon-xs` (14px), `icon-sm` (16px, buttons and inline), `icon-md` (18px, sidebar) and `icon-lg` (20px, tab bar and top bar).
- Always add `aria-hidden` on decorative icons.

### Radius and elevation

| Element | Radius | Shadow |
|---|---|---|
| Cards, tables, filter bars | `rounded-2xl` | `shadow-sm` |
| Inputs and buttons | `rounded-lg` | |
| Chips and pills | `rounded-full` | |
| Menus | | `shadow-lg` |
| Hovered link cards | | `shadow-md` |

### Focus

- Every link, button and summary gets a 2px ring in `--ring` on keyboard focus.
- Inputs use the brand focus ring.
- Never remove an outline without replacing it.

### Density

- `<DensityToggle />` switches every `.ui-table` between comfortable and compact.
- The choice is stored in this browser under `localStorage["lbe-density"]` and applied before paint by the root layout.
- ListPage shows the toggle by default (`density={false}` hides it).

### Dark mode

- Every token has a dark value, so test each page in both themes.
- Print always resets to black on white.

## 2. Navigation (information architecture)

`nav.ts` is the only place to add or rename a page. The sidebar, phone tab bar, breadcrumb and command palette all read from it.

| Group | Items |
|---|---|
| Home | Home |
| Sell | Quotations, Import BOQ, Follow-ups, Customers, BOQ templates |
| Deliver | Orders & delivery, Returns |
| Buy | Purchase orders, Purchase invoices, Vendors, Item & price master, Stock |
| Money | Billing & outstanding, Advances, Reports & profit, Email outbox |
| Projects & site | Projects, Expenses |
| Service | AMC, Service calls, Refills |
| Automation | Alerts, Automation agents |
| Admin | Meeting notes, Settings & users, Help |

How navigation behaves:

- **Permissions:** every item keeps its RBAC module. Groups with no readable item are hidden.
- **Collapsing:** sidebar groups collapse when the header is clicked. The state is remembered in `localStorage["lbe-nav-collapsed"]`. The group holding the current page always opens.
- **Quick create** ("New" in the top bar, also listed in Ctrl K): New quotation, Import BOQ, Record payment, Record advance, New expense, New service call. Each appears only when `canWrite` allows it. Add more in `QUICK_CREATE`.
- **Phone tab bar** (below 1024px): four destinations per role from `MOBILE_PREF`, plus More, which opens the drawer.

| Role | Tab bar destinations |
|---|---|
| Admin | Home, Quotations, Orders, Billing |
| Sales | Home, Quotations, Follow-ups, Orders |
| Purchase | Home, Purchase orders, Purchase invoices, Stock |
| Accounts | Home, Billing, Expenses, Reports |
| Engineer | Home, Projects, Expenses, Service calls |
| Store | Home, Orders, Stock, Returns |

- **Bottom offset:** anything fixed or sticky at the bottom must use `bottom-nav-offset`, not `bottom-0`, so it clears the tab bar and the safe area. `main` already has `pb-nav` padding.

## 3. Components

All of these come from `@/components/patterns` unless noted. Everything is server-safe except ConfirmButton, ActionMenu, DensityToggle and PrintButton. Those four are client components, but you can render them from server pages.

### ListPage

```tsx
<ListPage
  title="Vendors" subtitle="Suppliers and their latest rates."
  primaryAction={writable && <LinkButton href="/vendors/new"><Plus className="icon-sm" aria-hidden /> New vendor</LinkButton>}
  secondaryActions={<LinkButton variant="secondary" href="/vendors/export">Download Excel</LinkButton>}
  notices={<Flash ok={sp.ok} err={sp.err} />}
  stats={<MetricStrip><Metric label="Vendors" value={n} /></MetricStrip>}
  filters={<>
    <FilterPills label="Filter by status" items={pills} />
    <ListFilters q={sp.q} placeholder="Search name, GSTIN, city" clearHref="/vendors" activeCount={active} hidden={{ status }}>
      <Select name="city" aria-label="City">...</Select>
    </ListFilters>
  </>}
  isEmpty={rows.length === 0}
  empty={<ListEmpty filtered={active > 0} noun="vendors" clearHref="/vendors" action={writable && <LinkButton href="/vendors/new">Add the first vendor</LinkButton>}>Vendors appear here once you add one or post a purchase invoice.</ListEmpty>}
  resultSummary={`${total} vendors`}
  pagination={<Pagination page={page} pages={pages} total={total} noun="vendors" href={(p) => qs({ page: p })} />}
>
  <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="Vendors" />
</ListPage>
```

### ResponsiveTable

```ts
type Column<T> = {
  key: string; header: ReactNode; label?: string; cell: (row: T, i: number) => ReactNode;
  align?: "left" | "right" | "center"; priority?: 1 | 2 | 3;
  card?: "title" | "subtitle" | "badge" | "amount" | "field" | "actions" | "hidden";
  className?: string; headerClassName?: string; nowrap?: boolean;
};
<ResponsiveTable rows columns rowKey rowClassName? rowId? footer? caption? tall? flush? className? />
```

Layout by screen width:

- **640px and wider:** a normal table.
- **Below 640px:** each row becomes a card.
  - `title` sits top left and `badge` top right.
  - `subtitle` sits under the title and `amount` on the right of that line.
  - `field` columns stack as label and value rows.
  - `actions` sits at the bottom.
  - `hidden` columns are dropped.

Column priority:

- `priority: 3` hides the column between 640px and 1023px, where the table is cramped.
- Put the main link's class `rt-stretch` on it so a tap anywhere on the card opens the record.
- Right-aligned columns get tabular numbers automatically.
- Inside a SectionCard, pass `flush`.

### DetailPage

```ts
<DetailPage back eyebrow title status meta primaryAction secondaryActions moreActions notices tabs aside>{children}</DetailPage>
<MetaChip label="Customer" href?>{name}</MetaChip>
```

Action rules:

| Slot | What goes in it |
|---|---|
| `primaryAction` | Exactly one action: the most likely next step. On the order page that is "Create invoice" when delivered goods are not billed, otherwise "Record delivery". |
| `secondaryActions` | Two to four common actions. On phones they move into More automatically. |
| `moreActions` | Close, cancel, reopen, delete, duplicate. Destructive ones use `ConfirmButton` with `variant="ghost"`, `stacked`, and `confirmVariant="danger"` for really destructive cases. |

Layout:

- The title row sticks under the top bar from 640px.
- On phones the action bar is fixed above the tab bar.
- Never place a `fixed` element inside a parent with `transform` or `backdrop-filter`.
- `aside` holds the summary card, related records and activity. It sits on the right from 1024px and stacks below on smaller screens.

### Tabs

```tsx
const tab = activeTab(sp.tab, ["lines", "deliveries", "billing"] as const);
<Tabs basePath={`/orders/${id}`} params={{ tab: sp.tab }} active={tab} items={[{ id: "lines", label: "Lines", count: 4, alert: overdue > 0 }]} />
```

- Tabs are link based, using `?tab=`. The first tab is the default and has no parameter.
- `tabHref(base, params, id, defaultId)` builds links, for example the "Show lines" button in a Callout.
- Use Tabs for section tabs on settings, billing, returns, reports, projects and customers. They replace LinkTabs, BillingNav, SettingsNav and the inline navs. For tabs that are separate routes, pass `href` per item.

### FormPage, FormSection, FormFooter

```tsx
<FormPage title="New service call" back={{ href: "/service-calls", label: "Service calls" }} width="default">
  <form action={createCall} className="space-y-4">
    <FormSection title="Customer and site" description="Who called and where the problem is.">
      <Field label="Customer" required><Select name="customerId" required>...</Select></Field>
      <Field label="Site" className="sm:col-span-2"><Input name="site" /></Field>
    </FormSection>
    <FormFooter cancelHref="/service-calls" note="The response time is set from the AMC contract.">
      <SubmitButton pendingText="Saving…">Log service call</SubmitButton>
    </FormFooter>
  </form>
</FormPage>
```

- Widths: `narrow` for up to 6 fields, `default` for most forms, `wide` for forms with a line grid.
- The footer is sticky, sits above the phone tab bar, and makes buttons full width on phones.

### LineItemsTable and the `li` classes

```tsx
<LineItemsTable minWidth={960} caption="Quotation lines">
  <thead><tr><th>#</th><th>Item</th><th className={li.num}>Qty</th><th className={li.num}>Rate</th></tr></thead>
  <tbody><tr><td>1</td><td>...</td><td><input className={li.numInput} inputMode="decimal" /></td><td>...</td></tr></tbody>
  <tfoot><tr><td colSpan={3}>Total</td><td className={li.num}>{money(t)}</td></tr></tfoot>
</LineItemsTable>
```

- The cell inputs look like a spreadsheet: borderless until hover or focus.
- The focused row is tinted.
- Use these in quote-editor, template-editor, order-line-editor, invoice-line-editor, return-line-editor, po-form and purchase-form.

### MoneySummary

```tsx
<MoneySummary subtotal={sub} discount={disc} taxable={taxable} cgst={c} sgst={s} total={grand} totalLabel="Grand total" words={amountInWords(grand)} />
```

- Pass `igst` instead of `cgst` and `sgst` for inter-state supply.
- Pass `tax` when there is no split, and `rows` for extras such as supply and erection.

### SectionCard, Callout, KeyValueGrid, SummaryRows

```tsx
<SectionCard title="Deliveries" count={n} icon={Truck} flush actions={<CardLink href="...">View all</CardLink>}
  empty={n === 0 && "No deliveries yet. Record a challan when material leaves for the site."}>...</SectionCard>
<Callout tone="warning" title="Waiting for approval" action={<LinkButton size="sm" ...>Review</LinkButton>}>Sending is blocked until the owner approves.</Callout>
<KeyValueGrid columns={2} items={[{ label: "Customer", value: name }, ["Order date", fmtDate(d)]]} />
<SummaryRows rows={[["Pending lines", 3], ["Overdue", 1]]} />
```

- Callout tones are `info`, `warning`, `danger` and `success`. They replace every hand-made amber or red banner.
- Danger uses `role="alert"`. Info uses `role="note"`.

### Metric and MetricStrip

```tsx
<MetricStrip>
  <Metric label="Sales this month" value={moneyShort(s)} trend={{ value: 12.5, goodWhen: "up", label: "vs last month" }} href="/reports" />
</MetricStrip>
```

- Use 2 to 4 tiles per strip.
- `tone` can be `good`, `warn` or `bad`, for values that are themselves a judgement.
- `Stat` from ui.tsx still works, but new code uses `Metric`.

### StatusPill and the status vocabulary

```tsx
<StatusPill status={o.status} />                       // colour and label from status-tones.ts
<StatusPill status="late" label="Late" />              // derived state
<StatusPill semantic="warning" label="Awaiting approval" noDot />
```

| Meaning | Colour | Statuses |
|---|---|---|
| neutral | grey | draft, not required, closed, expired, cancelled, retired, snoozed, planning, released |
| info | blue | sent, open, issued, ordered, scheduled, active, reserved |
| progress | violet | in transit, in progress, assigned, renewed, logged |
| warning | amber | pending, pending approval, awaiting approval, partial, part paid, negotiation, on hold, due soon, queued |
| success | green | approved, won, delivered, received, posted, paid, completed, done, resolved, adjusted |
| danger | red | rejected, lost, overdue, missed, breached, failed, error, critical, late |

`StatusBadge` from ui.tsx now uses the same map, so old call sites already agree. To add a status, add it to `STATUS_SEMANTIC` and, if needed, `STATUS_LABEL` in `patterns/status-tones.ts`. Never colour a status by hand.

### FilterPills

```tsx
<FilterPills label="Filter by status" items={[{ label: "All", href, active, count }, { label: "Awaiting approval", href, active, count, attention: true }]} />
```

Use FilterPills for status and segment filters on every list. It replaces the five pill styles.

### StatusTimeline and ActivityFeed

```tsx
<StatusTimeline items={events.map((e) => ({ id: e.id, title: e.label, at: fmtDate(e.date), by: e.user, status: e.status, icon: e.icon, body: e.note }))} />
<ActivityFeed items={audit.map((a) => ({ id: a.id, title: a.summary, at: fmtDate(a.at), by: a.user }))} />
```

| Component | Use it for |
|---|---|
| StatusTimeline | Approval history, PO and return lifecycle, AMC visits, project history |
| ActivityFeed | The compact version for asides |

### ConfirmButton

```tsx
<form action={deleteVoucher}>
  <input type="hidden" name="id" value={v.id} />
  <ConfirmButton variant="danger" confirm="Delete this voucher? This cannot be undone." confirmLabel="Yes, delete voucher" pendingText="Deleting…">Delete voucher</ConfirmButton>
</form>
```

- The first click shows the question in place. The second click submits.
- Escape or "Keep" backs out.
- `name` and `value` props go on the real submit button.
- `SubmitButton confirm="..."` now renders this automatically.

### ActionMenu and MenuLink

```tsx
<ActionMenu label="More actions" iconOnly>
  <MenuLink href={`/quotations/${id}/print`} icon={Printer}>Print</MenuLink>
  <MenuSeparator />
  <form action={cancel}><ConfirmButton variant="ghost" stacked confirm="Cancel?">Cancel</ConfirmButton></form>
</ActionMenu>
```

### DocumentSheet

```ts
<DocumentSheet company title numberLabel number date meta party secondParty facts watermark toolbar>{children}</DocumentSheet>
<DocTable>thead/tbody with th, td and td.num</DocTable>
<GstSummaryTable rows={gstSummary(lines, intra)} intra={intra} />
<DocTotals taxable cgst sgst igst rows total totalLabel words note />
<DocNotes title="Terms">...</DocNotes>
<DocSignature company={company.name} left="Received by (name and signature)" />
```

How the sheet behaves:

- On screen it is an A4 sheet. In print it runs edge to edge in black and white, at A4 size with 12mm margins.
- Table headers repeat on every printed page, and rows never split across pages.
- `toolbar` adds the back link and the shared PrintButton.
- `watermark="Cancelled"` adds the banner and a faint diagonal mark.

Data and naming rules:

- Get company details from `getCompany(db)` (lib/billing).
- Document titles are sentence case: "Tax invoice", "Credit note", "Debit note", "Purchase order", "Delivery challan", "Payment receipt", "Quotation", "AMC contract", "Visit report".

### Kit additions (absorbed from the module teams)

These pieces started as local copies in the modules and now live in the kit. Use them instead of writing your own. The local copies (ReceivedBar, DeliveredBar, BudgetBar, LineProgress, LinkTabs, Pager, SettingsTabs, the orders PrintButton, the two chart files and the BOQ ClientPills) are deleted.

#### ProgressBar

```tsx
<ProgressBar value={o.deliveredPct} label="Delivered" />
<ProgressBar size="sm" value={pct} label="Received" />
<ProgressBar value={done} max={total} label={`${done} of ${total} lines delivered`} caption={`${done}/${total} lines`} />
{c.budget ? <ProgressBar mode="budget" value={c.budgetUsedPct} label="Budget used" /> : <span className="text-caption text-ink-faint">No budget set</span>}
```

Props: `value`, `max` (default 100), `tone` (`auto`, `info`, `success`, `warning`, `danger`), `mode` (`progress` or `budget`), `label` (the accessible name), `showValue` (default true), `caption` (text above the bar, turns on the stacked layout), `size` (`sm` or `md`).

| Mode | Auto tone |
|---|---|
| `progress` | Grey at 0, blue while under way, green at 100% |
| `budget` | Green below 80%, amber from 80% to 100%, red past 100% (the percentage turns red too) |

The tone logic is `progressTone(value, max, mode)` in `patterns/progress-tone.ts`, covered by unit tests.

#### ListPage `tabs`

```tsx
<ListPage title="Stock" tabs={<Tabs label="Stock views" active={view} items={[...]} />} notices={...} stats={...} filters={...}>
```

- Section and view tabs go in `tabs`, which renders right under the header and before notices, stats and filters. Do not hide them in `filters` or `notices`.
- Billing sections use `tabs={<BillingTabs active="invoices" />}`. Reports, returns, items, orders and stock use the slot too.

#### ListFilters on phones

- Below 640px the selects fold behind a "Filters (n)" button under the search box, so the results stay on the first screen. It opens by itself when a filter is active.
- From 640px the selects are always shown. Nothing changes in how you call ListFilters.

#### ResponsiveTable footers, plain grids and groups

```tsx
<ResponsiveTable rows={months} columns={cols} rowKey={(m) => m.month}
  footerRows={[{ label: "Total", cells: { sales: money0(t.sales), net: { value: money0(t.net), className: "text-danger" } } }]} />

// Bill style totals: the label spans up to the first value and sits on the right
footerRows={[
  { key: "sub", label: "Subtotal", labelAlign: "right", className: "", labelClassName: "text-ink-soft", cells: { amount: money(sub) } },
  { key: "total", label: "Total", labelAlign: "right", className: "", labelClassName: "font-semibold", cells: { amount: money(total) } },
]}
```

- `footerRows: { key?, label, cells, labelAlign?, labelClassName?, className? }[]`. `cells` is keyed by column key, so values line up with their columns and take each column's label on the phone card. A cell is a value, or `{ value, className?, slot? }`.
- On phones a footer row reads as a totals card. A row with one value reads "Label ..... value" on one line.
- The default row style is `bg-muted font-semibold`. Pass `className: ""` for a plain row.
- `footer` (raw `<tfoot>` content) still works as an escape hatch. Never hand-write `data-slot` or `data-label` again.
- `cards={false}` keeps a plain table that scrolls sideways on phones. Use it only for grids that are read across, such as the price matrix. Add `stickyFirst` to pin the first column.
- `groupBy={(r) => r.group}` with an optional `groupHeader={(key, rows) => ...}` adds a header row above each group. Rows must already be sorted by group.

#### DetailPage with many secondary actions

When `secondaryActions` holds more than three actions, the first two stay in view and the rest move into More below 1280px. Fragments are flattened, so `<>{a}{b}{c}{d}</>` counts as four. Keep the most used actions first.

#### RouteTabs (client)

```tsx
// app/(app)/settings/layout.tsx
<RouteTabs label="Settings sections" className="mb-4" items={[
  { label: "Company and pricing", href: "/settings" },
  { label: "Users", href: "/settings/users" },
]} />
```

- For sections that are separate routes and share a layout. It reads the pathname, and the longest matching `href` wins.
- The settings layout owns the settings tabs. Pages no longer render their own tabs.

#### ClientPills and ClientTabs (client)

```tsx
<ClientPills label="Show rows" items={[{ id: "all", label: "All rows", count: 40 }]} active={filter} onChange={setFilter} />
<ClientTabs label="Sheets in this BOQ" idPrefix={id} panelId={`${id}-panel`} active={tab} onChange={setTab}
  items={sheets.map((s, i) => ({ id: i, label: s.name, count: counts[i] }))} />
<div id={`${id}-panel`} role="tabpanel" aria-labelledby={clientTabId(id, tab)}>...</div>
```

- Use these only for state that lives in the page (the BOQ review). Anything that should survive a reload or be shared uses FilterPills and Tabs with the URL.
- ClientPills are toggle buttons with `aria-pressed`. ClientTabs are a `role="tablist"` with arrow key, Home and End support.

#### ConfirmButton with a client callback

```tsx
<ConfirmButton variant="ghost" confirm={`Re-price every item line at ${markup}%? Hand-typed rates are replaced.`}
  confirmLabel="Yes, re-price all" onConfirm={() => applyMarkup(markup, true)}>Re-apply markup to all</ConfirmButton>
```

With `onConfirm` the second click runs the callback instead of submitting a form, then the button disarms.

#### FormFooter `sticky` and `stackOnMobile`

- `sticky` (default true) keeps the footer above the phone tab bar.
- Pass `sticky={false}` when the form sits inside a DetailPage, whose action bar already owns the bottom of the phone screen (expense edit, refill asset edit).
- `stackOnMobile` stacks the buttons full width on phones, with the submit button on top.

#### BarChart

```tsx
<BarChart data={months} title="Monthly sales, cost of goods, expenses and net profit" description="The table below has the same numbers."
  category={(m) => monthLabel(m.month, true)} categoryLong={(m) => monthLabel(m.month)}
  series={[{ key: "sales", label: "Sales", value: (m) => m.sales }, { key: "cogs", label: "Cost of goods", value: (m) => m.cogs }]}
  line={{ key: "net", label: "Net profit", value: (m) => m.netProfit }}
  tooltipExtra={(m) => [["Gross profit", money0(m.grossProfit)]]} />
```

- Server component, inline SVG, one y axis. Negative values draw below the zero line.
- Bars take `chart-1`, `chart-2` and so on in the order given. The optional `line` takes the next colour. Pass `color` only to keep an entity's colour the same across charts.
- It has a legend for 2 or more series, an SVG `<title>` and `<desc>`, and a native tooltip per category.
- `format` is `money` (the default: axis in moneyShort, tooltips in money0) or `number`.
- `table` adds the "Show the numbers as a table" disclosure. Leave it off when a full table already follows the chart, as on the P&L report.
- `shortLabel` on a series shortens it in tooltips and the table ("Sales" for "Sales (invoiced)").

#### Prose

```tsx
<Prose as="article" html={renderMarkdown(guide.markdown)} className="max-w-3xl" />   // help guides
<Prose size="sm" html={renderMarkdown(note.summary)} />                              // inside a card
```

Every rendered markdown block uses `.prose-app` from globals.css, with `size="sm"` for a compact scale inside cards. Do not write local `[&_h2]:...` prose styles. Only pass sanitised HTML.

#### DocumentSheet `company.tagline`, `company.website` and `screenControls`

- `company.tagline` prints under the company name and `company.website` after phone and email. Do not fold them into the address.
- `screenControls` sits above the toolbar and is never printed. Use it for period filters and Callouts about the document, as on the customer statement.

#### Query-string helpers (`@/lib/url`)

```ts
qs({ q: "pipe", page: 2 })                 // "?q=pipe&page=2"
qs(base, { page: undefined })              // base without page
withParams("/stock", { low: 1 })           // "/stock?low=1"
searchString({ tab, fy, flagged: true })   // "tab=pnl&fy=2026-27&flagged=1"
```

- Empty values (undefined, null, "" and false) are dropped. `true` becomes "1".
- `overrides` replace keys in place, and an empty override removes the key.
- Use these instead of building URLSearchParams by hand.

### Loading skeletons (`@/components/page-skeleton`)

| Skeleton | Use for |
|---|---|
| `ListSkeleton({ tiles })` | Lists |
| `DetailSkeleton({ aside })` | Detail pages |
| `FormSkeleton()` | Forms |
| `DocumentSkeleton()` | Documents |
| `DashboardSkeleton()` | Home |

Add a `loading.tsx` next to every heavy page.

### Unchanged primitives (`@/components/ui`)

These keep their APIs: `Button`, `LinkButton`, `buttonClass`, `Field`, `Input`, `Select`, `Textarea`, `Badge`, `Card`, `CardLink`, `Table/Th/Td`, `EmptyState`, `Flash`, `DL`, `Skeleton`, `PageHeader` and `FilterBar`.

- `FilterBar` still works. New code uses `ListFilters`.
- `DL` still works. New code uses `KeyValueGrid`.

## 4. Page recipes

### List

ListPage contains, in order:

1. `notices`: Flash and Callouts
2. `stats`: an optional MetricStrip
3. `filters`: FilterPills, then ListFilters
4. Results: a ResponsiveTable, or cards for boards
5. Pagination
6. ListEmpty, which tells "no match" apart from "nothing yet"

Rules:

- There is one primary action ("New ...") and at most two secondary actions.
- The search box name is `q`. Every filter is a GET param, so the URL can be shared.

### Detail

DetailPage contains, in order:

1. A back link to the list
2. An eyebrow with the record type
3. A title: the document number or name, plus a StatusPill
4. MetaChips with 3 to 5 key facts
5. Actions in three tiers
6. Notices, using Callout for blocked states such as "awaiting approval" or "overdue"
7. Tabs, when there are more than three sections
8. A main column of SectionCards
9. An aside with a summary and related records

Every destructive action goes in More behind a ConfirmButton.

### Form

1. FormPage
2. FormSections of 3 to 8 fields each, titled by what the user is doing ("Customer and site", "Lines", "Terms")
3. A FormFooter with Cancel and a submit button that names the action

Field rules:

- Required fields use `required` on Field and on the input.
- Numbers use `inputMode="decimal"` and right alignment.

### Wizard

- Use a single FormPage and `eyebrow="Step 1 of 2"`.
- Each step is a form with a FormFooter: "Back" is a ghost link and "Next: enter quantities" is the submit button.
- Do not render two PageHeaders.

### Board

- Use ListPage with the board in `children`.
- Each column is a SectionCard with a `count` and an `empty` message ("No open calls").
- Columns scroll sideways on phones (`grid auto-cols-[85%] grid-flow-col overflow-x-auto sm:grid-flow-row sm:grid-cols-2 xl:grid-cols-4`).

### Report

- Use ListPage without a primary action, plus `Tabs` for report sections and ListFilters for the period.
- Each chart sits in a SectionCard with a legend and a table below it.
- Excel export is a secondary action labelled "Download Excel".

### Document

- The print route is `.../print`.
- Use DocumentSheet, add a `loading.tsx` with DocumentSkeleton, and do not wrap it in PageHeader.

### Settings

- The settings layout uses Tabs with `href` per route.
- Each page is FormSections plus a FormFooter.

## 5. Do and don't

| Do | Don't |
|---|---|
| Use `text-danger`, `bg-warning-soft` and the other semantic tokens | Write `text-red-600 dark:text-red-400` by hand |
| Use one primary button per screen | Show three red or brand buttons side by side |
| Put close, cancel and delete in More behind a ConfirmButton | Use `window.confirm` or `confirm()` |
| Use `StatusPill` for every state | Make a custom coloured span for a status |
| Use `ResponsiveTable` with card slots | Hide important columns on phones or force sideways scrolling for key data |
| Use `Callout` for blocked or warning states | Hand-build amber or red banners |
| Use `bottom-nav-offset` on fixed or sticky bottom bars | Use `fixed bottom-0`, which sits under the tab bar |
| Hide buttons the user cannot use (`canWrite`, `canSeeCost`) | Show a button that errors on click |
| Use Tabs with `?tab=` | Build your own tab nav |
| Use `DocumentSheet` for every print | Copy letterhead markup |
| Import from `@/components/patterns` | Import components from another module's `_components` |
| Use `icon-sm` on button icons | Mix `h-4 w-4`, `h-[18px]` and `h-5` for the same job |

## 6. Copy rules

- Write plain, friendly English for a busy contractor's office. Keep sentences short.
- Never use em dashes or en dashes. Use a comma, a full stop, the word "to" ("10 to 20"), or a middle dot (·) between meta items.
- Use sentence case everywhere: titles, buttons, tabs, menu items and document titles. Write "Create invoice", not "Create Invoice". Proper nouns and abbreviations stay as they are (BOQ, GST, AMC, PO).
- Buttons say what happens:
  - "Record delivery", "Send for approval", "Close order", "Download Excel".
  - Not "Submit", "OK", "Yes" or "Go".
  - Confirm buttons repeat the verb: "Yes, cancel order".
- Pending text uses a present participle and an ellipsis: "Saving…", "Posting…".
- Empty states:
  - Use a title that says what is missing ("No deliveries yet").
  - Add one sentence on how to get one.
  - Add an action if the user can do it.
  - For filtered lists say "No vendors match these filters" and offer "Clear all filters".
- Use one word per concept:
  - "Download Excel" (not "Export Excel")
  - "Reopen" (not "Re-open")
  - "Save draft"
  - "Log a call"
  - "New ..." for create buttons ("New vendor", "New PO")
  - "Mark resolved"
  - "Apply" for filters
- Do not use arrow glyphs inside labels ("← Back", "Next →"). Use a lucide icon.
- Write dates with `fmtDate`, money with `money`, `money0` or `moneyShort`, and quantities with `qty`. Never format them by hand.

## 7. Page checklist (every page must pass)

1. **Header.** Uses ListPage, DetailPage, FormPage, DocumentSheet or PageHeader. Has exactly one h1, and a back link on detail, form and print pages.
2. **Actions.** One primary action and at most three secondary actions in view. Destructive actions sit in More behind a ConfirmButton. Labels are verbs in sentence case.
3. **RBAC.** Every action is hidden when `canWrite` is false. Buying prices and margins are hidden when `canSeeCost` is false. Server actions still check `requireWrite`. The design layer never replaces that check.
4. **Empty state.** Every list, table and card has one. Filtered and genuinely empty states are different.
5. **Loading.** A `loading.tsx` with the matching skeleton exists for any page that queries more than a couple of tables.
6. **Mobile at 375px.**
   - No horizontal page scroll.
   - Key columns are visible as cards.
   - Fixed bars clear the tab bar.
   - Tap targets are at least 36px.
   - Forms are one column.
7. **Keyboard.**
   - Everything can be reached with Tab and shows a visible focus ring.
   - Menus close with Escape.
   - ConfirmButton backs out with Escape.
   - Inputs have labels: Field, or `aria-label` for inputs that have no visible label.
8. **Dark mode.** No `bg-white`, `text-black` or raw palette colour without a token. Check the page in both themes.
9. **Status.** Every state is shown with StatusPill or StatusBadge, using the shared vocabulary.
10. **Copy.** No em or en dashes, sentence case, and no arrow glyphs.
11. **Feedback.** `<Flash ok err />` appears on every page whose actions redirect with `?ok=` or `?err=`.
12. **Print.** Documents use DocumentSheet and look right in print preview from dark mode.

## 8. Instructions for the three module teams

Ground rules:

- Change presentation only.
- Keep every query, server action, zod schema, redirect, RBAC check and audit call exactly as it is.
- Do not edit `schema.ts`, `lib/*`, `ui.tsx`, `nav.ts`, `app-shell.tsx`, `globals.css` or `patterns/*`. If you need something new in the kit, ask the design lead. Do not fork a pattern into your module.

### Team split

| Team | Modules |
|---|---|
| Team A: Sell and Deliver | quotations (detail, new, edit, print, approval panel, editor), boq-import, follow-ups, customers, boq-templates, orders (list, new, challan), returns (list, new, detail, edit) |
| Team B: Buy and Money | purchase-orders, purchases, vendors, items, stock, billing (all routes including invoice print and receipt), reports, emails |
| Team C: Projects, Service, Admin | home dashboard, projects (including history), expenses, amc (including prints and visits), service-calls, refills, alerts, agents, meeting-notes, settings (layout and pages), help |

### Steps for each page

1. Pick the page type from the table in `docs/UX_AUDIT.md`. Open the matching reference page side by side.
2. Rebuild the markup with the scaffold:
   - Lists go on ListPage with ResponsiveTable.
   - Details go on DetailPage, with tabs when there are more than three sections.
   - Forms go on FormPage with FormSection and FormFooter.
   - Prints go on DocumentSheet.
3. Replace each of these:

   | Replace | With |
   |---|---|
   | `StatusBadge` and custom chips | `StatusPill` |
   | Hand-made banners | `Callout` |
   | Local pill and tab components | `FilterPills` and `Tabs` |
   | GET filter forms | `ListFilters` |
   | `Pager` | `Pagination` |
   | `DL` | `KeyValueGrid` |
   | Ad hoc "No ..." text | SectionCard `empty` or `ListEmpty` |
   | Raw colour classes | Semantic tokens |
   | Local print buttons and letterheads | `DocumentSheet` and `PrintButton` |
   | `h-4 w-4` on icons | `icon-sm` |

4. Move destructive actions into `moreActions` with `ConfirmButton`. Keep the same form, hidden inputs and server action.
5. Put the editable grids on `LineItemsTable` and the `li` classes, with `MoneySummary` for totals. Keep the hidden JSON input and the state logic as they are.
6. Add the right `loading.tsx` skeleton.
7. Fix copy to the rules in section 6.
8. Delete the module's now-unused local components:
   - LinkTabs, Pager, BillingNav and SettingsNav, once all their users have moved
   - the three PrintButton copies
   - the AMC Letterhead
   - the remaining NotePrint callers
9. Run `npx tsc --noEmit -p .`, `npx eslint <your files>` and `npx vitest run`. All three must be clean.
10. Check the page against the checklist in section 7 at 375px and 1280px, in light and dark mode, signed in as a role that can write and as one that can only read.

When two teams touch a shared component (for example `purchase-orders/_components/create-po-button.tsx`, which the orders page uses), the owning team changes it and keeps its props the same.
