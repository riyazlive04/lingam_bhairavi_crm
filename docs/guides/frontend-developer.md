# Frontend Developer Guide

Scope: the UI in the Next.js 15 App Router app (`app/`), in TypeScript and Tailwind. Read it together with [ui-ux-designer.md](ui-ux-designer.md), [REQUIREMENTS.md](../REQUIREMENTS.md) and [ARCHITECTURE.md](../ARCHITECTURE.md).

## 1. Conventions

- **Server Components by default.** Use Client Components only for interactive parts (the quotation grid, forms, the pop-up, charts), and put `"use client"` at the smallest possible boundary.
- Data changes go through **Server Actions** or route handlers that check the role on the server. The UI only hides what a role can't do.
- Forms: validate with the same schema on client and server (for example zod), and show field-level errors in plain English.
- No secrets or database access in client code. Never import server modules into Client Components.
- Accessibility: semantic HTML (`<table>`, `<label>`, `<button>`), visible focus states, and `aria-live` for toasts and errors.

## 2. Formatting utilities (use them everywhere, never format by hand)

```ts
export const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);
// inr(123456) → "₹1,23,456.00"

export const ddmmyyyy = (d: Date | string) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' })
    .format(new Date(d)).replace(/\//g, '-');
// → "21-11-2026"
```

- Money comes from the server as strings (exact decimals). Convert only for display. Don't total in floating point on the client except for a live preview, because the server recalculates on save.
- BOQ Ref is a string (`"A.11.3"`, `"1.2"`). Never pass it through `Number()`.

## 3. Notes for each screen

| Screen | Notes |
|---|---|
| Quotation grid | Keyboard: Enter moves down, Tab moves right. Sticky header and first columns. Virtualise if there are more than 200 lines. The side panel shows the latest purchase rate with date and vendor, a stale badge, the last sold rate (for this customer and overall) and margin %. Show a red warning when margin is below the minimum (BR-4). |
| BOQ template → quote | Qty inputs only. Show a live count of lines with qty > 0 and of the zero lines left out. Ask for confirmation before creating the quotation. |
| Login pop-up | Fetch pending SO lines once after login. A modal with the list (overdue first) and "Dismiss for this session" (store the flag in sessionStorage, wrapped in try/catch). |
| Mobile expense (engineer) | `inputmode="decimal"` for the amount. `<input type="file" accept="image/*" capture="environment">` for receipts. Compress the image in the browser (under 500 KB) before upload. Recent projects first. A split editor that insists on 100 %. |
| Deliveries (store) | A checklist of pending lines, a qty stepper that defaults to the pending qty, and a big "Save delivery" button. |
| Dashboard | Tiles link to filtered lists. Numbers use `inr()`. Use lakh and crore short forms only with a tooltip showing the full value. |
| Exports | "Export Excel" calls a server route that returns `.xlsx`. "Print" opens a print-styled route (`@media print`, A4, company header). |

## 4. Responsiveness

- Mobile-first Tailwind (`sm:`, `md:` and `lg:` add the desktop features). Test at **360 px**, 768 px and 1366 px.
- Tables: wrap them in an `overflow-x-auto` container. On mobile, prefer card lists for the engineer and store screens.
- Tap targets at least 44 px (`min-h-11`).

## 5. Navigation by role

| Menu | admin | sales | purchase | accounts | engineer | store |
|---|---|---|---|---|---|---|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ (own) | ✓ |
| Items & Prices | ✓ | view | ✓ | view | - | view |
| Vendors | ✓ | - | ✓ | view | - | - |
| Customers | ✓ | ✓ | view | ✓ | view | view |
| BOQ Templates / Quotations | ✓ | ✓ | view | view | - | - |
| Sales Orders / Deliveries | ✓ | ✓ | view | view | view | ✓ |
| Purchase Invoices | ✓ | - | ✓ | ✓ | - | view |
| Stock (Phase 2) | ✓ | view | ✓ | - | - | ✓ |
| Projects | ✓ | view | view | view | own | - |
| Expenses | ✓ | own | own | ✓ approve | own | own |
| Sales Invoices / Payments / Outstanding | ✓ | view | - | ✓ | - | - |
| Refill Tracker | ✓ | ✓ | - | - | ✓ | - |
| Meeting Notes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Agents / Settings / Users | ✓ | - | - | - | - | - |

("-" means no access.) This mirrors the server's role matrix (see [security-engineer.md](security-engineer.md)). The server always has the final say.

## 6. Definition of done (frontend)

- [ ] Meets the REQ acceptance criteria, and uses the INR and date utilities.
- [ ] Works at 360 px, is keyboard accessible, and every input has a label.
- [ ] Loading, empty and error states are designed (for example the empty state "No pending deliveries").
- [ ] No console errors, and Lighthouse accessibility is 90 or above on key screens.
- [ ] What each of the six roles can see has been checked.
