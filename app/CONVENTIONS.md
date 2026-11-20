# Engineering conventions — LBE Fire Safety CRM

Read this before writing code. Stack: **Next.js 15 App Router · React 19 · TypeScript (strict) · Tailwind v4 · Drizzle ORM · Postgres (Neon) / PGlite (embedded demo) · jose JWT cookies · zod**.

## Ownership (do not edit files you don't own — ask the Manager)
| Area | Owner |
|---|---|
| `src/db/schema.ts`, `src/db/index.ts`, `src/lib/{auth,session,rbac,format,constants,sequence,audit,email}.ts`, `src/middleware.ts`, `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/components/{ui,submit-button,app-shell}.tsx` | Architect (Manager) |
| `src/db/seed*.ts`, `src/db/seed-data/**` | Data Engineer |
| Feature folders `src/app/(app)/<module>/**`, `src/lib/<module>.ts` | the feature team that owns that module |

If you need a shared helper that doesn't exist, create it inside **your** module (`src/lib/<your-module>.ts` or `src/app/(app)/<module>/_components/`). Never change the schema — derive what you need with queries.

## Patterns
- **Pages are server components.** First line: `const user = await requireUser("<module>")` (from `@/lib/auth`). Then `const db = await getDb()` (from `@/db`) and query with Drizzle (`import { items } from "@/db/schema"`).
- `searchParams`/`params` are **Promises** in Next 15: `({ searchParams }: { searchParams: Promise<{ q?: string }> })` then `const sp = await searchParams`.
- **Mutations = server actions** in `actions.ts` files with `"use server"`. First line of every action: `const user = await requireWrite("<module>")`. Validate input with **zod** (`z.coerce.number()` for numeric form fields). After success: `revalidatePath(...)` then `redirect("...?ok=" + encodeURIComponent("Saved"))`. Write an audit entry with `audit(db, user.id, "create", "quotation", id, {...})`.
- Forms: plain `<form action={serverAction}>` with `<SubmitButton>` (`@/components/submit-button`). Use `Field`, `Input`, `Select`, `Textarea` from `@/components/ui`. Show `?ok=`/`?err=` with `<Flash ok={sp.ok} err={sp.err} />`. For errors, catch in the action and `redirect(...?err=...)` — never leak stack traces. Note: `redirect()` throws internally; don't wrap it in try/catch (or rethrow with `isRedirectError` — simpler to compute the target in try/catch and call redirect after).
- Interactive bits (line-item editors, live totals, charts) = small `"use client"` components that receive plain serialisable props and post to server actions (hidden inputs with JSON are fine: `<input type="hidden" name="lines" value={JSON.stringify(lines)} />`, then `z.array(...).parse(JSON.parse(String(form.get("lines"))))`).
- UI kit: `PageHeader`, `Card`, `Stat`, `Table/Th/Td`, `Badge`, `StatusBadge`, `LinkButton`, `Button`, `EmptyState`, `FilterBar`, `DL`, `Flash`. Icons: `lucide-react`. Colours: use tokens `bg-surface`, `bg-muted`, `border-line`, `text-ink`, `text-ink-soft`, `text-ink-faint`, `brand-50…800` — **never hard-code white/black backgrounds** (dark mode must work).
- Money: `money()`, `money0()`, `moneyShort()` (Indian ₹1,23,456.00 format), numbers `qty()`, dates `fmtDate()` (stored as `'YYYY-MM-DD'` strings), today `todayIST()`, `addDays`, `addMonths`, `daysBetween`, `round2`, `marginPct` — all in `@/lib/format`.
- Document numbers: `nextNumber(db, "quotation" | "sales_order" | "sales_invoice" | "delivery" | "expense" | "project")` from `@/lib/sequence`.
- Email: `queueEmail(db, {...})` from `@/lib/email` (logs to outbox in demo; sends via Office 365 when SMTP env is set).
- Role checks inside pages: `canWrite(user.role, "<module>")` to hide edit buttons; `canSeeCost(user.role)` to hide buying prices/margins; `canApproveExpenses(user.role)`.
- Mobile: every page must work at 375px width — tables scroll inside `<Table>`; forms use `grid gap-4 sm:grid-cols-2`.
- No `any`. No new npm packages (ask the Manager). Installed: drizzle-orm, zod, jose, bcryptjs, exceljs, nodemailer, lucide-react, clsx, date-fns, marked, sanitize-html.
- Drizzle tips: `import { eq, and, or, desc, asc, sql, inArray, gte, lte, lt, isNull, ilike, count, sum } from "drizzle-orm"`. Aggregates come back as strings/numbers depending on driver → always wrap with `Number(...)`. Use `sql<number>\`coalesce(sum(${t.col}),0)\`` with `.mapWith(Number)`.

## Shared business rules (single source of truth)
1. **Latest cost** of an item = `items.lastPurchaseRate` (maintained when a purchase invoice is *posted*), falling back to `items.listPrice`.
2. **Suggested supply rate** = `round2(cost × (1 + markupPct/100))` where markupPct = quotation markup (default from settings `pricing.defaultMarkupPct`, else item.markupPct). Erection rate defaults to `items.erectionRate`.
3. **Quotation totals**: supply = Σ qty×supplyRate; erection = Σ qty×erectionRate; discount = (supply+erection)×discountPct/100; tax = (supply+erection−discount)×gstPct/100; grand = supply+erection−discount+tax; cost = Σ qty×costRate. **Lines with qty 0 are never saved/exported.**
4. **Posting a purchase invoice** (draft→posted, once): for each line → insert `price_history(kind 'purchase')`, upsert `vendor_items(lastRate,lastDate)`, insert `stock_movements(type 'purchase_in', +qty, rate)`; if invoice has `projectId` also insert `stock_movements(type 'issue_project', −qty, rate, projectId)`; update `items.lastPurchaseRate/Date/VendorId` if this invoice date ≥ current lastPurchaseDate.
5. **Project actual cost** = Σ |qty|×rate of `stock_movements` type `issue_project` for the project − Σ qty×rate of type `return` for the project + Σ `expense_allocations.amount` of **approved** expenses. Margin = contractValue − actual cost.
6. **Sales invoice issued** → `price_history(kind 'sale')` per line + `items.lastSaleRate/Date`; increments `sales_order_lines.invoicedQty`. Outstanding = total − paidAmount. Status: paid when paidAmount ≥ total − 0.5.
7. **Delivery** increments `sales_order_lines.deliveredQty`; line status becomes `delivered` when deliveredQty ≥ qty else `partial`; order status = delivered when all non-cancelled lines delivered, partial when any delivered.
8. **Refill**: recording a refill sets `lastRefillDate`, `nextDueDate = addMonths(date, refillIntervalMonths)`.
9. Alerts are created only by the automation agents (`src/lib/agents`), deduplicated by `dedupeKey`.

## Commands
- Type-check: `npx tsc --noEmit -p .` (ignore errors in files you don't own — other teams work in parallel).
- Lint: `npx eslint <your files>`.
- **Do not run `next build` or `next dev`** while teams work in parallel — the Manager runs integration builds.
