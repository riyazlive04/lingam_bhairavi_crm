# Architect Guide (high level)

> The **detailed** architecture — schema, API routes, folder structure, decisions — is maintained by the architect in [docs/ARCHITECTURE.md](../ARCHITECTURE.md). This guide gives the high-level shape and the principles every design decision must respect.

## 1. Stack

| Layer | Choice | Reason |
|---|---|---|
| App | **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS** | One codebase for UI and server; fast to build; free hosting tier |
| Hosting | **Vercel** | Zero-ops, preview deployments per branch, built-in cron |
| Database | **Postgres on Neon** via **Drizzle ORM**; **PGlite** (embedded Postgres) fallback for demo/offline | Serverless Postgres free tier, branching, point-in-time restore; PGlite lets the demo run without a DB server |
| Auth | Credentials login, **JWT in httpOnly cookie**, roles: admin, sales, purchase, accounts, engineer, store | Simple, no paid identity provider |
| E-mail | **Office 365 SMTP** (`smtp.office365.com:587`, STARTTLS) using the client's mailbox | Client already uses Office 365 (11-20 [29:35]) |
| Scheduling | **Vercel Cron** → protected agents endpoint, daily | No extra infrastructure |
| Exports | Excel (`.xlsx`) generated server-side in the client's BOQ format; print-friendly HTML → PDF via browser | Matches their current quotation sheets |

## 2. Logical modules

```
Masters:   Items ─ Price history (purchase) ─ Sales price history ─ Vendors ─ Customers ─ BOQ Templates
Sales:     Quotations (+ lines, follow-ups, revisions) → Sales Orders (+ lines) → Deliveries
Purchase:  Purchase Invoices (+ lines) → price history, payables, project cost, stock (Phase 2)
Projects:  Projects ← costs (purchase lines, stock issues, expenses, expense splits)
Finance:   Sales Invoices → Payments → Receivables;  Purchase Invoices → Vendor payments → Payables
Service:   Extinguisher refill records
Platform:  Users/Roles, Settings, Alerts, Agent runs, Email log, Meeting Notes, Audit fields
```

## 3. Design principles

1. **Single source of truth per fact.** Purchase rate comes only from purchase invoice lines (or the initial import); sales rate history only from quotation/invoice lines. Never store "current price" in two places — derive or cache with a clear refresh rule.
2. **Buy and sell separated** (BR-10). Different tables/columns; selling price never overwrites buying price.
3. **Derive statuses, don't type them.** SO line delivery status, invoice outstanding, project spend, refill next due date are computed from transactions, so they cannot drift.
4. **Deterministic agents.** Each agent is a pure function `(data, settings, today) → alerts`, idempotent with alert keys; no AI/LLM calls (see [AUTOMATION_AGENTS.md](../AUTOMATION_AGENTS.md)).
5. **Money and quantities as exact decimals** (`numeric(14,2)` for money, `numeric(12,3)` for qty); never floats. BOQ Ref is **text** (the sample Excel shows float corruption like `1.2000000000000002`).
6. **Indian context**: INR, GST (CGST/SGST vs IGST by place of supply), financial year April–March numbering (`LBE/Q/2026-27/0001`), IST time zone for cron and "today".
7. **Soft-cancel, audit everything.** created_by/updated_by/timestamps; referenced documents are cancelled, not deleted.
8. **Server-side authorization** on every route/action by role; UI hiding is not security.
9. **Budget**: stay within free tiers; avoid paid services; keep serverless functions short (agents batch per run).
10. **Phase 2 ready**: stock tables (on hand, allocations) designed now but feature-flagged.

## 4. Key data relationships (summary)

- Item 1—* PurchasePriceHistory *—1 Vendor (created from PurchaseInvoiceLine).
- Item 1—* SalesPriceHistory *—1 Customer (from Quotation/Invoice lines).
- BOQTemplate 1—* TemplateLine *—1 Item.
- Quotation 1—* QuotationLine, 1—* FollowUp; Quotation 0..1—1 SalesOrder.
- SalesOrder 1—* SOLine 1—* DeliveryLine.
- Project 1—* (PurchaseInvoiceLine | ExpenseSplit | StockIssue).
- SalesInvoice 1—* PaymentAllocation *—1 Payment.

## 5. Architecture review checklist (per feature)

- [ ] Traces to REQ IDs; business rules (BR-x) implemented server-side.
- [ ] Role access defined for read/create/update/approve.
- [ ] Numeric types and rounding defined; INR formatting at the UI only.
- [ ] Works on PGlite and Neon (no Neon-only features without fallback).
- [ ] Migration is additive; rollback path noted.
- [ ] Mobile layout considered if engineer/store use it.
- [ ] Agent impacts considered (new statuses, new dates).
- [ ] ARCHITECTURE.md updated.
