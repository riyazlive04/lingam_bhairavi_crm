# UI/UX Designer Guide

Your role: design screens that busy staff at an Indian SMB will actually use every day. The previous CRM failed because data wasn't entered (11-20 [26:15 to 27:05]). Every design choice should make entering data easier and less intimidating.

**Since the UI rebuild (version 2.1), the live design rules are in [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md)** (tokens, navigation, components, page recipes, copy rules and the page checklist) and the screen-by-screen findings are in [UX_AUDIT.md](../UX_AUDIT.md). Use this guide for the reasoning behind the design; use the design system for what to build. In particular:

- **Navigation is grouped by task** in `app/src/components/nav.ts`: Home, Sell, Deliver, Buy, Money, Projects & site, Service, Automation, Admin.
- A **"New" quick create menu** in the top bar (New quotation, Import BOQ, Record payment, Record advance, New expense, New service call), shown only to roles that can create those things.
- On phones, a **bottom tab bar** with four destinations per role plus More (for example the engineer gets Home, Projects, Expenses, Service calls).
- Shared page patterns for list, detail, form, wizard, board, report, document and settings pages, with **one A4 document layout for every print**.
- **Inline confirms** instead of browser pop-ups, and a **density toggle** (comfortable or compact) on tables.

Where the token values in §3 below differ from DESIGN_SYSTEM.md, the design system is correct.

## 1. Users and context

| User | Device | Context | What it means for design |
|---|---|---|---|
| Owner / admin | Laptop and phone | Checks status between site visits and calls | Dashboard first, with numbers that click through to the list behind them |
| Sales / estimation | Desktop, heavy Excel users | Builds BOQs of 50 to 150 lines | A spreadsheet-like quotation grid, keyboard navigation and Excel export |
| Purchase | Desktop | Enters supplier invoices from paper or PDF | Fast line entry, item search such as "pipe gi 50", and creating items inline |
| Accounts | Desktop | Also uses Tally or Vyapar | Familiar ledger-style tables and ageing buckets |
| Site engineer | **Android phone**, outdoors, patchy 4G | Logs petrol and lodging, confirms deliveries | **Mobile-first**, one-hand use, camera upload, few fields |
| Store / dispatch | Phone or shared PC | Dispatches PO lines | A big checklist of pending lines, with "mark delivered" in one tap |

Language: an English UI using the client's own terms (BOQ, NB, Supply, Erection, PO, DC, Refill). Staff are bilingual in Tamil and English, so keep labels short and plain. (A Tamil UI is out of scope unless they ask for it: Q-18.)

## 2. Design principles

1. **As few fields as possible.** No more than 6 mandatory fields per form, with defaults everywhere (today's date, the logged-in user, the last project used).
2. **Give something back straight away.** As soon as an item is chosen, show the automatically picked latest rate, the last sold rate and the margin. The user sees the value of entering data.
3. **Make pending work visible.** Every list has a "Pending / Overdue" filter, the login pop-up lists undelivered PO lines, and "My pending entries" is one tap from the home screen.
4. **Never drop things silently.** BOQ → quotation shows "18 lines with quantity, 42 excluded" before it creates anything.
5. **Be forgiving.** Autosave drafts, allow undo on status changes, and write clear errors in plain English ("Invoice 123 from this vendor is already entered. Open it?").
6. **Show status with colour and text** (never colour alone): Pending (grey), In transit (blue), Partial (amber), Delivered (green), Overdue (red).

## 3. Brand and visual system

| Token | Value | Use |
|---|---|---|
| Brand accent ("fire red") | `#C62828` (hover `#B71C1C`) | Primary buttons, active nav and the logo mark. Use it sparingly |
| Danger | `#D32F2F` | Errors and overdue. Tell it apart from the brand colour with an icon and label |
| Warning | `#F59E0B` | Stale price, partial, budget at 80 % |
| Success | `#2E7D32` | Delivered, paid, won |
| Info | `#1565C0` | In transit, information |
| Neutral text | `#1F2937` on `#FFFFFF`; muted `#6B7280` | |
| Font | System UI stack (or Inter): loads fast and has good numerals | |
| Numbers | Tabular figures, right-aligned in tables | |

Dark mode is optional. If we provide it, keep contrast at 4.5:1 or better.

## 4. Indian formatting rules

- Currency: **₹1,23,456.00**, with Indian digit grouping (lakh and crore). Use `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`. Large dashboard figures may use "₹18.4 L" or "₹1.2 Cr", with the full value in a tooltip.
- Dates: **DD-MM-YYYY** (21-11-2026), with relative hints such as "3 days overdue".
- Phone: +91 98xxx xxxxx. GSTIN in capitals, 15 characters.
- Sizes: "200 NB", "½\"", "M10", "4.5 kg", exactly as in the client's price list.

## 5. Key screens

| Screen | Must-have elements |
|---|---|
| Dashboard | Tiles: Follow-ups today, Undelivered lines, Ready to invoice, Receivables overdue, Payables due, Refills due (10 days), Projects over budget, Pending entries by person. Recent agent alerts |
| BOQ → Quotation | System picker (Hydrant / Sprinkler / FAS / PA / Extinguisher). A grid with BOQ Ref, description, size, make, qty and UOM. Sticky totals and an excluded-lines counter |
| Quotation editor | Columns as in the client's Excel: BOQ Ref, Description, Qty, UOM, Supply Rate, Amount, Erection Rate, Amount, Remarks. A side panel with the latest purchase rate (date, vendor, stale badge), the last price sold to this customer, and margin % |
| Sales order | Lines with ordered, delivered and pending qty, a status chip and the expected date. "Record delivery" |
| Login pop-up | Pending PO lines, overdue first. "View all" and "Dismiss for now" |
| Mobile expense | Amount (numeric keypad), category chips (Petrol, Lodging, Food…), project picker (recent first), photo and a "Split" toggle |
| Item page | Two clearly separate histories: **Purchase price history** and **Sales price history** |
| Quotation approval (version 2) | A clear "Needs approval / Pending / Approved / Rejected" state with the reason, and the send buttons explained when they are blocked |
| Quote line price freshness (version 2) | Rate, price date and supplier beside each line, with a stale flag the user can't miss |
| Import BOQ (version 2) | Upload, then a review screen that shows which lines matched, which need checking and which did not match, so the user spends time only on the lines that need a decision |
| AMC visit report (version 2) | A checklist per system that works one-handed on a phone at site, then prints as an A4 report |

## 6. Accessibility

- WCAG 2.1 AA: contrast of at least 4.5:1, visible focus, every input labelled, and errors announced.
- Touch targets at least 44 × 44 px, and no actions that only work on hover.
- Works at 360 px width with no horizontal page scroll (wide tables scroll inside their own container, with the first column sticky).
- Respect reduced motion, and no auto-playing animation.
- Readable in sunlight: avoid light-grey text on white for key data.

## 7. Deliverables

For any new screen: pick the page recipe in DESIGN_SYSTEM.md §4, reuse its components, and check it against §7. Propose new components to the design system rather than designing one-off ones. Original deliverables: wireframes for the key screens above, component specs (buttons, chips, tables, forms, alerts), a token sheet for the frontend, and a usability test with 1 person per role before UAT (the task: "create a hydrant quote for 120 m of MS pipe 80 NB and 6 single hydrant valves").
