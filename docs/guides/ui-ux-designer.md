# UI/UX Designer Guide

Role: design screens that busy Indian SMB staff will actually use every day — the previous CRM failed because data wasn't entered (11-20 [26:15–27:05]). Every design choice should reduce the effort and fear of entering data.

## 1. Users and context

| User | Device | Context | Design implication |
|---|---|---|---|
| Owner / admin | Laptop + phone | Checks status between site visits and calls | Dashboard first; numbers that click through to the list behind them |
| Sales / estimation | Desktop, Excel-heavy | Builds 50–150-line BOQs | Spreadsheet-like quotation grid, keyboard navigation, Excel export |
| Purchase | Desktop | Enters supplier invoices from paper/PDF | Fast line entry, item search by "pipe gi 50", inline item creation |
| Accounts | Desktop | Also uses Tally/Vyapar | Familiar ledger-style tables, ageing buckets |
| Site engineer | **Android phone**, outdoors, patchy 4G | Logs petrol/lodging, confirms deliveries | **Mobile-first**, one-hand use, camera upload, few fields |
| Store / dispatch | Phone or shared PC | Dispatches PO lines | Big checklist of pending lines; "mark delivered" in one tap |

Language: English UI using the client's terms (BOQ, NB, Supply, Erection, PO, DC, Refill). Staff are bilingual Tamil/English; keep labels short and plain. (Tamil UI is out of scope unless requested — Q-18.)

## 2. Design principles

1. **Minimum fields.** ≤ 6 mandatory fields per form; defaults everywhere (today's date, logged-in user, last-used project).
2. **System gives back immediately.** Show the auto-picked latest rate, the last sold rate, the margin, as soon as an item is chosen — the user sees value in entering data.
3. **Pending is visible.** Every list has a "Pending / Overdue" filter; the login pop-up lists undelivered PO lines; "My pending entries" is one tap from the home screen.
4. **No silent omissions.** BOQ → quotation shows "18 lines with quantity, 42 excluded" before creating.
5. **Forgiving.** Draft autosave, undo for status changes, clear errors in plain English ("Invoice 123 from this vendor is already entered — open it?").
6. **Status by colour + text** (never colour alone): Pending (grey), In transit (blue), Partial (amber), Delivered (green), Overdue (red).

## 3. Brand and visual system

| Token | Value | Use |
|---|---|---|
| Brand accent ("fire red") | `#C62828` (hover `#B71C1C`) | Primary buttons, active nav, logo mark — sparingly |
| Danger | `#D32F2F` | Errors, overdue — distinguish from brand by icon + label |
| Warning | `#F59E0B` | Stale price, partial, budget 80 % |
| Success | `#2E7D32` | Delivered, paid, won |
| Info | `#1565C0` | In transit, informational |
| Neutral text | `#1F2937` on `#FFFFFF`; muted `#6B7280` | |
| Font | System UI stack (or Inter) — fast loading, good numerals | |
| Numbers | Tabular figures, right-aligned in tables | |

Dark mode is optional; if provided, keep contrast ≥ 4.5:1.

## 4. Indian formatting rules

- Currency: **₹1,23,456.00** — Indian digit grouping (lakh/crore). Use `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`. Large dashboard figures may use "₹18.4 L" / "₹1.2 Cr" with full value in a tooltip.
- Dates: **DD-MM-YYYY** (21-11-2026); relative hints ("3 days overdue").
- Phone: +91 98xxx xxxxx; GSTIN shown in caps, 15 chars.
- Sizes: "200 NB", "½\"", "M10", "4.5 kg" exactly as in the client's price list.

## 5. Key screens

| Screen | Must-have elements |
|---|---|
| Dashboard | Tiles: Follow-ups today, Undelivered lines, Ready to invoice, Receivables overdue, Payables due, Refills due (10 days), Projects over budget, Pending entries by person; recent agent alerts |
| BOQ → Quotation | System picker (Hydrant / Sprinkler / FAS / PA / Extinguisher); grid with BOQ Ref, description, size, make, qty, UOM; sticky totals; excluded-lines counter |
| Quotation editor | Columns as in client's Excel: BOQ Ref, Description, Qty, UOM, Supply Rate, Amount, Erection Rate, Amount, Remarks + side panel: latest purchase rate (date, vendor, stale badge), last sold to this customer, margin % |
| Sales order | Lines with ordered / delivered / pending qty, status chip, expected date; "Record delivery" |
| Login pop-up | Pending PO lines, overdue first; "View all" and "Dismiss for now" |
| Mobile expense | Amount (numeric keypad), category chips (Petrol, Lodging, Food…), project picker (recent first), photo, "Split" toggle |
| Item page | Two clearly separated histories: **Purchase price history** and **Sales price history** |

## 6. Accessibility

- WCAG 2.1 AA: contrast ≥ 4.5:1, focus visible, all inputs labelled, errors announced.
- Touch targets ≥ 44 × 44 px; no hover-only actions.
- Works at 360 px width without horizontal page scroll (wide tables scroll inside their own container with the first column sticky).
- Respect reduced motion; no auto-playing animation.
- Readable in sunlight: avoid light-grey text on white for key data.

## 7. Deliverables

Wireframes for the key screens above, component specs (buttons, chips, tables, forms, alerts), a token sheet for the frontend, and a usability test with 1 person per role before UAT (task: "create a hydrant quote for 120 m of MS pipe 80 NB and 6 single hydrant valves").
