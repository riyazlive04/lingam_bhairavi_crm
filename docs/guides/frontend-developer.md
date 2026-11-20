# Frontend Developer Guide

Scope: UI in the Next.js 15 App Router app (`app/`), TypeScript + Tailwind. Read with [ui-ux-designer.md](ui-ux-designer.md), [REQUIREMENTS.md](../REQUIREMENTS.md) and [ARCHITECTURE.md](../ARCHITECTURE.md).

## 1. Conventions

- **Server Components by default**; Client Components only for interactive parts (quotation grid, forms, pop-up, charts). Mark with `"use client"` at the smallest boundary.
- Data mutations via **Server Actions** or route handlers that enforce role checks server-side; the UI only hides what a role can't do.
- Forms: validate with the same schema on client and server (e.g. zod); show field-level errors in plain English.
- No secrets or DB access in client code. Never import server modules into Client Components.
- Accessibility: semantic HTML (`<table>`, `<label>`, `<button>`), focus states, `aria-live` for toasts and errors.

## 2. Formatting utilities (use everywhere, never hand-format)

```ts
export const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);
// inr(123456) → "₹1,23,456.00"

export const ddmmyyyy = (d: Date | string) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' })
    .format(new Date(d)).replace(/\//g, '-');
// → "21-11-2026"
```

- Money arrives from the server as strings (exact decimals) — convert only for display. Do not do totals in floating point on the client except for live preview; the server recalculates on save.
- BOQ Ref is a string (`"A.11.3"`, `"1.2"`) — never `Number()` it.

## 3. Screen-specific notes

| Screen | Notes |
|---|---|
| Quotation grid | Keyboard: Enter moves down, Tab moves right; sticky header and first columns; virtualise if > 200 lines. Side panel shows latest purchase rate + date + vendor, stale badge, last sold rate (customer / overall), margin %. Red warning when margin < minimum (BR-4). |
| BOQ template → quote | Qty inputs only; show live count of lines with qty > 0 and excluded zero lines; confirm dialog before creating quotation. |
| Login pop-up | Fetch pending SO lines once after login; modal with list (overdue first), "Dismiss for this session" (store flag in sessionStorage, wrapped in try/catch). |
| Mobile expense (engineer) | `inputmode="decimal"` for amount; `<input type="file" accept="image/*" capture="environment">` for receipts; compress image client-side (< 500 KB) before upload; recent projects first; split editor that enforces 100 %. |
| Deliveries (store) | Checklist of pending lines; qty stepper defaulting to pending qty; big "Save delivery" button. |
| Dashboard | Tiles link to filtered lists; numbers use `inr()`; use lakh/crore abbreviations only with tooltip of full value. |
| Exports | "Export Excel" calls a server route that returns `.xlsx`; "Print" opens a print-styled route (`@media print`, A4, company header). |

## 4. Responsiveness

- Mobile-first Tailwind (`sm:`, `md:`, `lg:` add desktop features). Test at **360 px**, 768 px, 1366 px.
- Tables: wrap in `overflow-x-auto` container; on mobile prefer card lists for engineer/store screens.
- Tap targets ≥ 44 px (`min-h-11`).

## 5. Role-aware navigation

| Menu | admin | sales | purchase | accounts | engineer | store |
|---|---|---|---|---|---|---|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ (own) | ✓ |
| Items & Prices | ✓ | view | ✓ | view | — | view |
| Vendors | ✓ | — | ✓ | view | — | — |
| Customers | ✓ | ✓ | view | ✓ | view | view |
| BOQ Templates / Quotations | ✓ | ✓ | view | view | — | — |
| Sales Orders / Deliveries | ✓ | ✓ | view | view | view | ✓ |
| Purchase Invoices | ✓ | — | ✓ | ✓ | — | view |
| Stock (Phase 2) | ✓ | view | ✓ | — | — | ✓ |
| Projects | ✓ | view | view | view | own | — |
| Expenses | ✓ | own | own | ✓ approve | own | own |
| Sales Invoices / Payments / Outstanding | ✓ | view | — | ✓ | — | — |
| Refill Tracker | ✓ | ✓ | — | — | ✓ | — |
| Meeting Notes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Agents / Settings / Users | ✓ | — | — | — | — | — |

This mirrors the server RBAC matrix (see [security-engineer.md](security-engineer.md)); the server is authoritative.

## 6. Definition of done (frontend)

- [ ] Matches REQ acceptance criteria; INR and date utilities used.
- [ ] Works at 360 px; keyboard accessible; labels on all inputs.
- [ ] Loading, empty and error states designed (e.g. empty state "No pending deliveries").
- [ ] No console errors; Lighthouse accessibility ≥ 90 on key screens.
- [ ] Role visibility checked for all six roles.
