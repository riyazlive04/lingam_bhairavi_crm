# Architect Guide (high level)

> The **detailed** architecture (schema, API routes, folder structure and decisions) is kept by the architect in [docs/ARCHITECTURE.md](../ARCHITECTURE.md). This guide gives the overall shape and the principles every design decision must respect.

## 1. Stack

| Layer | Choice | Reason |
|---|---|---|
| App | **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS** | One codebase for UI and server, quick to build, free hosting tier |
| Hosting | **Vercel** | No servers to manage, preview deployments for each branch, built-in cron |
| Database | **Postgres on Neon** through **Drizzle ORM**, with **PGlite** (embedded Postgres) as the fallback for demo and offline use | Serverless Postgres free tier, branching and point-in-time restore. PGlite lets the demo run without a database server |
| Auth | Credentials login, **JWT in an httpOnly cookie**. Roles: admin, sales, purchase, accounts, engineer, store | Simple, and no paid identity provider |
| E-mail | **Office 365 SMTP** (`smtp.office365.com:587`, STARTTLS) using the client's mailbox | The client already uses Office 365 (11-20 [29:35]) |
| Scheduling | **Vercel Cron** → protected agents endpoint, once a day | No extra infrastructure |
| Exports | Excel (`.xlsx`) built on the server in the client's BOQ format. Print-friendly HTML → PDF through the browser | Matches their current quotation sheets |

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

1. **One source of truth for each fact.** The purchase rate comes only from purchase invoice lines (or the initial import). Sales rate history comes only from quotation and invoice lines. Never store "current price" in two places. Derive it, or cache it with a clear refresh rule.
2. **Keep buying and selling apart** (BR-10). They use different tables and columns, and a selling price never overwrites a buying price.
3. **Derive statuses, don't type them in.** SO line delivery status, invoice outstanding, project spend and the next refill due date are all calculated from transactions, so they cannot drift.
4. **Predictable agents.** Each agent is a pure function `(data, settings, today) → alerts`, safe to run repeatedly thanks to alert keys. No AI calls (see [AUTOMATION_AGENTS.md](../AUTOMATION_AGENTS.md)).
5. **Money and quantities are exact decimals** (`numeric(14,2)` for money, `numeric(12,3)` for qty), never floats. BOQ Ref is **text**, because the sample Excel shows float corruption such as `1.2000000000000002`.
6. **Indian context**: INR, GST (CGST/SGST or IGST, by place of supply), numbering by financial year from April to March (`LBE/Q/2026-27/0001`), and the IST time zone for cron and for "today".
7. **Cancel softly and audit everything.** Keep created_by, updated_by and timestamps. Documents that others refer to are cancelled, not deleted.
8. **Check permissions on the server** for every route and action, by role. Hiding something in the UI is not security.
9. **Budget**: stay within free tiers, avoid paid services and keep serverless functions short (agents work in batches each run).
10. **Ready for Phase 2**: the stock tables (on hand, allocations) are designed now but sit behind a feature flag.

## 4. Key data relationships (summary)

- Item (one) to PurchasePriceHistory (many), each linked to one Vendor (created from PurchaseInvoiceLine).
- Item (one) to SalesPriceHistory (many), each linked to one Customer (from quotation and invoice lines).
- BOQTemplate (one) to TemplateLine (many), each linked to one Item.
- Quotation (one) to QuotationLine (many) and FollowUp (many). A Quotation has zero or one SalesOrder.
- SalesOrder (one) to SOLine (many), and each SOLine to DeliveryLine (many).
- Project (one) to many PurchaseInvoiceLine, ExpenseSplit and StockIssue records.
- SalesInvoice (one) to PaymentAllocation (many), each linked to one Payment.

## 5. Architecture review checklist (for each feature)

- [ ] Traces to REQ IDs, and business rules (BR-x) are enforced on the server.
- [ ] Role access is defined for read, create, update and approve.
- [ ] Numeric types and rounding are defined. INR formatting happens in the UI only.
- [ ] Works on both PGlite and Neon (no Neon-only features without a fallback).
- [ ] The migration only adds things, and the rollback path is noted.
- [ ] Mobile layout considered if engineers or store staff use it.
- [ ] Impact on agents considered (new statuses, new dates).
- [ ] ARCHITECTURE.md updated.
