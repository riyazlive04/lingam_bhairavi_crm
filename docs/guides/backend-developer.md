# Backend Developer Guide

Scope: the database schema (Drizzle), server actions and route handlers, business rules, agents, e-mail and exports. The detailed schema is in [ARCHITECTURE.md](../ARCHITECTURE.md), and the business rules are in [REQUIREMENTS.md §5](../REQUIREMENTS.md#5-business-rules).

**The code-level source of truth is [app/CONVENTIONS.md](../../app/CONVENTIONS.md)**, rules 1 to 20. Where this guide and CONVENTIONS differ, CONVENTIONS is right. Rules 10 to 20 cover version 2 (see §8 below).

## 1. Data layer

- **Drizzle ORM** with the Postgres dialect. It runs on **Neon** (`DATABASE_URL`), or falls back to **PGlite** for the demo when `DATABASE_URL` is not set. Avoid Neon-only extensions.
- Types: as built, money and quantities are `double precision`, rounded to 2 decimals with `round2()` (see ADR-006 in [ARCHITECTURE.md](../ARCHITECTURE.md)). Always round at the same points as the existing code, and recompute totals on the server.
- `boq_ref` and document numbers are `text`.
- Every business table has `id`, `created_at`, `created_by`, `updated_at` and `updated_by`. Documents also have `status` and `cancelled_reason`.
- Migrations only add things. Never drop a column in the same release that stops using it.

## 2. Core business logic

### 2.1 Price resolution (BR-1, REQ-005)
```
latestPurchaseRate(itemId):
  most recent purchase_invoice_line for item (by invoice_date desc, created_at desc)
  else imported price-list rate (source = 'MASTER_PRICE_LIST', e.g. 12-10-2026)
  else null  → line flagged "No price"
supplyRate = round(latestPurchaseRate × (1 + markupPct/100))   // markup: line override > category > global (40)
erectionRate = item.erection_rate
```
Return `{ rate, date, vendor, ageDays, isStale }` so the UI can show the badge.

### 2.2 Saving a purchase invoice (REQ-006), all in one transaction
1. Reject a duplicate (vendor_id, invoice_no).
2. Insert the invoice and its lines (create the item inline if asked).
3. Insert `purchase_price_history` for each line, and upsert `vendor_item` (last_rate, last_date).
4. Create the payable (due = invoice_date + vendor.payment_terms_days).
5. If there is a `project_id` on the line or header, add it to project cost. If it is marked "to store", create a stock movement (Phase 2 flag).

### 2.3 BOQ → quotation (REQ-001/002, BR-3)
- Copy only the template lines with `qty > 0`, keeping their order and `boq_ref`. Return the `{created, excluded}` counts.

### 2.4 Quotation status flow (REQ-013)
`Draft → Sent → Follow-up → Won | Lost | Expired`. `Sent` needs a next follow-up date. `Won` needs the PO number and date, and creates or links a Sales Order. `Lost` needs a reason. Revisions create `-R1` and `-R2` copies linked to the parent.

### 2.5 Sales order line status (BR-14)
Derived, not stored: delivered = Σ delivery_lines.qty. The status is Delivered, Partial, In transit (a manual flag plus an expected date) or Pending.

### 2.6 Numbering (BR-6)
- Work out the financial year from the IST date. If the month is April or later, it is `YYYY-(YY+1)`; otherwise `(YYYY-1)-YY`. So 21-11-2026 gives `2026-27`.
- Keep a sequence for each (doc type, FY) in a `doc_sequences` table. Increment it inside the same transaction with a row lock (`SELECT … FOR UPDATE`) so numbers never repeat: `LBE/Q/2026-27/0001`.

### 2.7 GST (BR-5)
- For each line: taxable = qty × rate (supply and erection separately). The GST % comes from the item (default 18).
- Place of supply = the customer's state. Tamil Nadu means CGST + SGST in equal halves; any other state means IGST.
- Round each line to 2 decimals, then add up the totals. Rounding off to the nearest rupee appears as its own line on the invoice.

### 2.8 Project costing (REQ-018/019/020)
`spend = Σ purchase lines tagged to project + Σ stock issues at cost + Σ approved expense splits`; `margin = contract_value − spend`. Expense splits must add up to the expense amount (check this on the server).

## 3. Agents

- One folder per agent, with a pure function: `run(ctx: { db, settings, today: Date }): Promise<AlertUpsert[]>`.
- Alert key: `${agent}:${entity}:${id}:${rule}`. Upsert the open alert, and close any open alert whose key was not produced in this run.
- Runner: `/api/cron/agents` (cron, with header `Authorization: Bearer ${CRON_SECRET}`) and the admin "Run now" button (session plus admin role). Each run is recorded in `agent_runs`.
- "Today" is calculated in **Asia/Kolkata**. The cron at 02:30 UTC is 08:00 IST.
- Keep each run inside serverless time limits. Filter in SQL (open records only), and send e-mails in batches (for example, at most 30 per run, continuing in the next run).
- Rules and thresholds exactly as in [AUTOMATION_AGENTS.md](../AUTOMATION_AGENTS.md). No AI calls.

## 4. E-mail (Office 365)

- Nodemailer SMTP: host `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `secure: false`, `requireTLS: true`, auth `SMTP_USER`/`SMTP_PASS`, from `SMTP_FROM` (this must be the same mailbox, or one it can send as).
- The client's tenant must allow **SMTP AUTH** for that mailbox (A-04). If it is disabled the send fails. Log it and raise an admin alert, but never crash the agent run.
- Log every e-mail (`email_log`: to, subject, entity, status, error). Send plain text plus simple HTML, with no tracking pixels.
- Customer reminders come only from the Receivables Dunning Agent, and respect `customer.reminders_enabled`.

## 5. Excel export (REQ-011)

- Use a server library (for example ExcelJS). One sheet per system section. Header rows have a merged "SUPPLY" (E:F) and "ERECTION" (G:H), as in the client's sample. Columns: BOQ Ref | Description | Quantity | UOM | Rate | Amount | Rate | Amount | Remarks.
- Write BOQ Ref as text cells, and amounts as numbers with the Indian number format `[>=10000000]##\,##\,##\,##0.00;[>=100000]##\,##\,##0.00;##,##0.00`.
- Put section totals, GST and the grand total at the end. Wrap long descriptions.

## 6. Security essentials

- Check the session and role in **every** server action and route (helpers `requireUser("<module>")` for pages and `requireWrite("<module>")` for actions, from `@/lib/auth`).
- Parameterised queries only (Drizzle). Validate input with schemas, and cap list page sizes.
- Hash passwords with bcrypt or argon2. Sign the JWT with `AUTH_SECRET`, and make it httpOnly, Secure and SameSite=Lax, with a short expiry that refreshes on activity.
- See [security-engineer.md](security-engineer.md).

## 7. Testing (and version 2 tests)

- Unit tests for price resolution, FY numbering (31-03-2027 vs 01-04-2027), the GST split, line status derivation, and each agent with a fixed `today`.
- Seed data: import the client's price list (Pipe GI/MS by NB, valves, pumps) so tests use real items.
- Version 2 added unit suites for quote approval, returns and net outstanding, purchase orders, AMC, reports and BOQ import, and integration suites for returns and advances, purchase orders, AMC and reports. Add to them when you change a rule (see [TEST_REPORT.md](../TEST_REPORT.md)).

## 8. Version 2: rules, tables and numbering

Read rules 10 to 20 in [app/CONVENTIONS.md](../../app/CONVENTIONS.md) before you touch any of these areas. In short:

| Rule | Topic | What to remember |
|---|---|---|
| 10 | Cost snapshot with date | Each quotation line stores `costRate`, `costDate`, `costVendorId` and `costSource` (`purchase`, `list` or `manual`), so the screen can show the price date, supplier and a stale flag |
| 11 | Quotation approval | Setting `pricing.approvalMode`: `off`, `below_margin` (default) or `all`. While approval is needed, Mark sent, Email and Mark won are blocked until an admin approves. Editing an approved quote sends it back to `pending` if it still needs approval |
| 12 | Delivery cost | `delivery_lines.costRate` is the latest cost at the moment of delivery. It is the cost of goods for order P&L |
| 13 | Customer return (credit note) | Posting is once only, in a transaction. It raises `sales_order_lines.returnedQty`, and restocks with a `sales_return` movement when asked. Adjusting against an invoice raises both `sales_invoices.paidAmount` and `sales_returns.adjustedAmount` |
| 14 | Vendor return (debit note) | Posting writes a `purchase_return` movement and cannot make stock negative |
| 15 | Advance payment | A `payments` row with `isAdvance = true`. Applying it writes `payment_allocations` and is capped by both the advance and the invoice outstanding |
| 16 | Vendor PO | Can be raised from a customer order's pending lines. A purchase invoice made from the PO raises `receivedQty` when it is **posted** |
| 17, 18 | Order P&L and monthly P&L | Revenue net of credit notes; cost from delivery snapshots and project issues, less restocked returns. Purchases are not cost until delivered or issued |
| 19 | AMC and service calls | Visits are spread evenly over the contract. A service call is due by raised time + the contract's response hours (48 hours without a contract). Renewal links the new contract with `renewalOf` |
| 20 | Stock movement types | New types `sales_return` (+) and `purchase_return` (−) |

**Customer net outstanding** = Σ invoice (total − paid) − Σ posted credit notes (total − adjusted) − Σ advances (amount − allocated).

**New tables** (migration `app/drizzle/0001_v2_returns_amc_po_approval.sql`, additive only): `purchase_orders`, `purchase_order_lines`, `sales_returns`, `sales_return_lines`, `purchase_returns`, `purchase_return_lines`, `payment_allocations`, `amc_contracts`, `amc_visits`, `service_calls`. New columns include the cost snapshot on `quotation_lines`, the approval fields on `quotations`, `delivery_lines.cost_rate`, `sales_order_lines.returned_qty`, `payments.is_advance / order_id / project_id / allocated_amount`, and the PO links on purchase invoices and their lines.

**New `nextNumber` keys** (`app/src/lib/sequence.ts`): `purchase_order` (LBE/PO), `sales_return` (LBE/CN), `purchase_return` (LBE/DN), `amc` (LBE/AMC), `service_call` (LBE/SC) and `receipt` (LBE/RCPT).

**Upgrade of existing databases:** `upgradeExisting()` in `app/src/db/index.ts` runs once on a database that already has users. It backfills the version 2 columns (guarded by the settings key `migrations.v2_backfill_done`) and, only with `SEED_V2_DEMO=1`, adds demo data (`migrations.v2_demo_seeded`). Backfills must stay idempotent and must only touch rows that were never filled. See the [DevOps guide](devops.md#31-version-2-upgrade-path-existing-databases).

**Schema changes from now on:** edit `app/src/db/schema.ts`, run `npx drizzle-kit generate`, then `node scripts/embed-migrations.mjs`, and commit both. Keep every migration additive.

