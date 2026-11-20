# Backend Developer Guide

Scope: the database schema (Drizzle), server actions and route handlers, business rules, agents, e-mail and exports. The detailed schema is in [ARCHITECTURE.md](../ARCHITECTURE.md), and the business rules are in [REQUIREMENTS.md §5](../REQUIREMENTS.md#5-business-rules).

## 1. Data layer

- **Drizzle ORM** with the Postgres dialect. It runs on **Neon** (`DATABASE_URL`), or falls back to **PGlite** for the demo when `DATABASE_URL` is not set. Avoid Neon-only extensions.
- Types: money `numeric(14,2)`, quantity `numeric(12,3)`, percentages `numeric(5,2)`. For arithmetic, parse into a decimal library or integer paise. **No JS float maths for money.**
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
- Runner: `POST /api/agents/run` (cron, with header `Authorization: Bearer ${CRON_SECRET}`) and the admin "Run now" button (session plus admin role). Each run is recorded in `agent_runs`.
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

- Check the session and role in **every** server action and route (helper `requireRole(['admin','sales'])`).
- Parameterised queries only (Drizzle). Validate input with schemas, and cap list page sizes.
- Hash passwords with bcrypt or argon2. Sign the JWT with `AUTH_SECRET`, and make it httpOnly, Secure and SameSite=Lax, with a short expiry that refreshes on activity.
- See [security-engineer.md](security-engineer.md).

## 7. Testing

- Unit tests for price resolution, FY numbering (31-03-2027 vs 01-04-2027), the GST split, line status derivation, and each agent with a fixed `today`.
- Seed data: import the client's price list (Pipe GI/MS by NB, valves, pumps) so tests use real items.
