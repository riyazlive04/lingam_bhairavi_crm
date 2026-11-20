# Backend Developer Guide

Scope: database schema (Drizzle), server actions / route handlers, business rules, agents, e-mail, exports. Detailed schema lives in [ARCHITECTURE.md](../ARCHITECTURE.md); business rules in [REQUIREMENTS.md §5](../REQUIREMENTS.md#5-business-rules).

## 1. Data layer

- **Drizzle ORM** with Postgres dialect; runs on **Neon** (`DATABASE_URL`) or **PGlite** fallback for demo when `DATABASE_URL` is absent. Avoid Neon-only extensions.
- Types: money `numeric(14,2)`, quantity `numeric(12,3)`, percentages `numeric(5,2)`; parse to a decimal library or integer paise for arithmetic — **no JS float maths for money**.
- `boq_ref` and document numbers are `text`.
- Every business table: `id`, `created_at`, `created_by`, `updated_at`, `updated_by`; documents also `status`, `cancelled_reason`.
- Migrations are additive; never drop columns in the same release that stops using them.

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

### 2.2 Purchase invoice save (REQ-006) — one transaction
1. Reject duplicate (vendor_id, invoice_no).
2. Insert invoice + lines (create item inline if requested).
3. Insert `purchase_price_history` per line; upsert `vendor_item` (last_rate, last_date).
4. Create payable (due = invoice_date + vendor.payment_terms_days).
5. If `project_id` on line/header → project cost; if "to store" → stock movement (Phase 2 flag).

### 2.3 BOQ → quotation (REQ-001/002, BR-3)
- Copy template lines with `qty > 0` only, preserving order and `boq_ref`; return `{created, excluded}` counts.

### 2.4 Quotation status machine (REQ-013)
`Draft → Sent → Follow-up → Won | Lost | Expired`; `Sent` requires next follow-up date; `Won` requires PO no./date and creates/links a Sales Order; `Lost` requires reason; revisions create `-R1`, `-R2` copies with link to parent.

### 2.5 Sales order line status (BR-14)
Derived: delivered = Σ delivery_lines.qty; status Delivered/Partial/In transit (manual flag + expected date)/Pending.

### 2.6 Numbering (BR-6)
- Financial year from IST date: month ≥ April → `YYYY-(YY+1)`; else `(YYYY-1)-YY`. 21-11-2026 → `2026-27`.
- Sequence per (doc type, FY) in a `doc_sequences` table, incremented inside the same transaction with row lock (`SELECT … FOR UPDATE`) to avoid duplicates: `LBE/Q/2026-27/0001`.

### 2.7 GST (BR-5)
- Per line: taxable = qty × rate (supply and erection separately); GST % from item (default 18).
- Place of supply = customer state; Tamil Nadu → CGST + SGST halves; else IGST.
- Round per line to 2 decimals, totals summed; round-off to nearest rupee shown as separate line on invoice.

### 2.8 Project costing (REQ-018/019/020)
`spend = Σ purchase lines tagged to project + Σ stock issues at cost + Σ approved expense splits`; `margin = contract_value − spend`. Expense splits must sum to the expense amount (validate server-side).

## 3. Agents

- Folder per agent with a pure function: `run(ctx: { db, settings, today: Date }): Promise<AlertUpsert[]>`.
- Alert key: `${agent}:${entity}:${id}:${rule}`; upsert open alert; auto-resolve open alerts whose key was not produced this run.
- Runner: `POST /api/agents/run` (cron, header `Authorization: Bearer ${CRON_SECRET}`) and admin "Run now" (session + admin role). Records `agent_runs`.
- "Today" is computed in **Asia/Kolkata**; cron 01:30 UTC = 07:00 IST.
- Keep each run within serverless time limits: query with SQL filters (only open records), batch e-mails (e.g. ≤ 30 per run, continue next run).
- Rules and thresholds exactly as [AUTOMATION_AGENTS.md](../AUTOMATION_AGENTS.md). No AI/LLM calls.

## 4. E-mail (Office 365)

- Nodemailer SMTP: host `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `secure: false`, `requireTLS: true`, auth `SMTP_USER`/`SMTP_PASS`, from `SMTP_FROM` (must be the same mailbox or one it can send as).
- Client tenant must allow **SMTP AUTH** for that mailbox (A-04). If disabled, the send fails — log it, raise an admin alert, never crash the agent run.
- Log every e-mail (`email_log`: to, subject, entity, status, error). Plain-text + simple HTML; no tracking pixels.
- Customer reminders only from the Receivables Dunning Agent, honouring `customer.reminders_enabled`.

## 5. Excel export (REQ-011)

- Use a server library (e.g. ExcelJS). Sheet per system section, header rows: merged "SUPPLY" (E:F) and "ERECTION" (G:H) as in the client sample; columns BOQ Ref | Description | Quantity | UOM | Rate | Amount | Rate | Amount | Remarks.
- Write BOQ Ref as text cells; amounts as numbers with Indian number format `[>=10000000]##\,##\,##\,##0.00;[>=100000]##\,##\,##0.00;##,##0.00`.
- Section totals, GST and grand total at the end. Wrap long descriptions.

## 6. Security essentials

- Check session and role in **every** server action/route (helper `requireRole(['admin','sales'])`).
- Parameterised queries only (Drizzle). Validate input with schemas; cap list page sizes.
- Hash passwords with bcrypt/argon2; JWT signed with `AUTH_SECRET`, httpOnly, Secure, SameSite=Lax, short expiry + refresh on activity.
- See [security-engineer.md](security-engineer.md).

## 7. Testing

- Unit tests for: price resolution, FY numbering (31-03-2027 vs 01-04-2027), GST split, line status derivation, each agent with fixed `today`.
- Seed: import the client price list (Pipe GI/MS by NB, valves, pumps) so tests use real items.
