# Engineering conventions: LBE Fire Safety CRM

Please read this before you write any code. Stack: **Next.js 15 App Router · React 19 · TypeScript (strict) · Tailwind v4 · Drizzle ORM · Postgres (Neon) / PGlite (embedded demo) · jose JWT cookies · zod**.

## Ownership (don't edit files you don't own; ask the Manager first)
| Area | Owner |
|---|---|
| `src/db/schema.ts`, `src/db/index.ts`, `src/lib/{auth,session,rbac,format,constants,sequence,audit,email}.ts`, `src/middleware.ts`, `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/components/{ui,submit-button,app-shell}.tsx` | Architect (Manager) |
| `src/db/seed*.ts`, `src/db/seed-data/**` | Backend developer (seed data) |
| Feature folders `src/app/(app)/<module>/**`, `src/lib/<module>.ts` | The developer who owns that module |

If you need a shared helper that doesn't exist yet, create it inside **your** module (`src/lib/<your-module>.ts` or `src/app/(app)/<module>/_components/`). Never change the schema. Get what you need with queries instead.

## Patterns
- **Pages are server components.** The first line is `const user = await requireUser("<module>")` (from `@/lib/auth`). Then `const db = await getDb()` (from `@/db`), and query with Drizzle (`import { items } from "@/db/schema"`).
- In Next 15, `searchParams` and `params` are **Promises**: `({ searchParams }: { searchParams: Promise<{ q?: string }> })` then `const sp = await searchParams`.
- **Mutations are server actions** in `actions.ts` files marked `"use server"`. The first line of every action is `const user = await requireWrite("<module>")`. Validate input with **zod** (`z.coerce.number()` for numeric form fields). On success, call `revalidatePath(...)` then `redirect("...?ok=" + encodeURIComponent("Saved"))`. Write an audit entry with `audit(db, user.id, "create", "quotation", id, {...})`.
- Forms: a plain `<form action={serverAction}>` with `<SubmitButton>` (`@/components/submit-button`). Use `Field`, `Input`, `Select` and `Textarea` from `@/components/ui`. Show `?ok=` and `?err=` with `<Flash ok={sp.ok} err={sp.err} />`. For errors, catch them in the action and `redirect(...?err=...)`. Never leak stack traces. Note that `redirect()` throws internally, so don't wrap it in try/catch (or rethrow with `isRedirectError`). It is simpler to work out the target inside try/catch and call redirect afterwards.
- Interactive pieces (line-item editors, live totals, charts) are small `"use client"` components. They receive plain serialisable props and post to server actions. Hidden inputs holding JSON are fine: `<input type="hidden" name="lines" value={JSON.stringify(lines)} />`, then `z.array(...).parse(JSON.parse(String(form.get("lines"))))`.
- UI kit: `PageHeader`, `Card`, `Stat`, `Table/Th/Td`, `Badge`, `StatusBadge`, `LinkButton`, `Button`, `EmptyState`, `FilterBar`, `DL`, `Flash`. Icons: `lucide-react`. Colours: use the tokens `bg-surface`, `bg-muted`, `border-line`, `text-ink`, `text-ink-soft`, `text-ink-faint` and `brand-50…800`. **Never hard-code white or black backgrounds**, because dark mode must work.
- Money: `money()`, `money0()`, `moneyShort()` (Indian ₹1,23,456.00 format). Numbers: `qty()`. Dates: `fmtDate()` (stored as `'YYYY-MM-DD'` strings). Today: `todayIST()`. Also `addDays`, `addMonths`, `daysBetween`, `round2` and `marginPct`. All of these live in `@/lib/format`.
- Document numbers: `nextNumber(db, "quotation" | "sales_order" | "sales_invoice" | "delivery" | "expense" | "project")` from `@/lib/sequence`.
- Email: `queueEmail(db, {...})` from `@/lib/email`. In the demo it logs to the outbox. Once the SMTP environment variables are set, it sends through Office 365.
- Role checks inside pages: `canWrite(user.role, "<module>")` to hide edit buttons, `canSeeCost(user.role)` to hide buying prices and margins, and `canApproveExpenses(user.role)`.
- Mobile: every page must work at 375px width. Tables scroll inside `<Table>`, and forms use `grid gap-4 sm:grid-cols-2`.
- No `any`. No new npm packages without asking the Manager. Already installed: drizzle-orm, zod, jose, bcryptjs, exceljs, nodemailer, lucide-react, clsx, date-fns, marked, sanitize-html.
- Drizzle tips: `import { eq, and, or, desc, asc, sql, inArray, gte, lte, lt, isNull, ilike, count, sum } from "drizzle-orm"`. Aggregates come back as strings or numbers depending on the driver, so always wrap them in `Number(...)`. Use `sql<number>\`coalesce(sum(${t.col}),0)\`` with `.mapWith(Number)`.

## Shared business rules (the single source of truth)
1. **Latest cost** of an item = `items.lastPurchaseRate` (kept up to date when a purchase invoice is *posted*), falling back to `items.listPrice`.
2. **Suggested supply rate** = `round2(cost × (1 + markupPct/100))`, where markupPct is the quotation markup (default from the setting `pricing.defaultMarkupPct`, otherwise item.markupPct). The erection rate defaults to `items.erectionRate`.
3. **Quotation totals**: supply = Σ qty×supplyRate; erection = Σ qty×erectionRate; discount = (supply+erection)×discountPct/100; tax = (supply+erection−discount)×gstPct/100; grand = supply+erection−discount+tax; cost = Σ qty×costRate. **Lines with qty 0 are never saved or exported.**
4. **Posting a purchase invoice** (draft→posted, only once): for each line, insert `price_history(kind 'purchase')`, upsert `vendor_items(lastRate,lastDate)` and insert `stock_movements(type 'purchase_in', +qty, rate)`. If the invoice has a `projectId`, also insert `stock_movements(type 'issue_project', −qty, rate, projectId)`. Update `items.lastPurchaseRate/Date/VendorId` if this invoice date ≥ the current lastPurchaseDate.
5. **Project actual cost** = Σ |qty|×rate of `stock_movements` of type `issue_project` for the project, minus Σ qty×rate of type `return` for the project, plus Σ `expense_allocations.amount` of **approved** expenses. Margin = contractValue − actual cost.
6. **Issuing a sales invoice** writes `price_history(kind 'sale')` for each line and updates `items.lastSaleRate/Date`. It also increases `sales_order_lines.invoicedQty`. Outstanding = total − paidAmount. The status is paid when paidAmount ≥ total − 0.5.
7. **A delivery** increases `sales_order_lines.deliveredQty`. A line's status becomes `delivered` when deliveredQty ≥ qty, otherwise `partial`. The order status is delivered when all non-cancelled lines are delivered, and partial when any line is delivered.
8. **Refill**: recording a refill sets `lastRefillDate` and `nextDueDate = addMonths(date, refillIntervalMonths)`.
9. Only the automation agents (`src/lib/agents`) create alerts, and they are deduplicated by `dedupeKey`.

## Commands
- Type-check: `npx tsc --noEmit -p .` (ignore errors in files you don't own, since other developers may be working on them at the same time).
- Lint: `npx eslint <your files>`.
- **Don't run `next build` or `next dev`** while several developers are working in parallel. The Manager runs the integration builds.
