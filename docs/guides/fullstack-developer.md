# Fullstack Developer Guide

Your role: deliver features from end to end (schema → server → UI → test) and tie the modules together. Read [frontend-developer.md](frontend-developer.md) and [backend-developer.md](backend-developer.md) first. This guide covers the workflow and the cross-module flows that are easy to break.

## 1. Local setup

1. Install Node.js LTS, then `cd app && npm install`.
2. Create `app/.env.local` (never commit it). The minimum for a local demo is:
   ```
   AUTH_SECRET=<random 32+ chars>
   # DATABASE_URL omitted → PGlite embedded DB is used for demo
   ```
   For Neon, add `DATABASE_URL=postgres://…?sslmode=require`.
3. Run the migrations and seed (see `app/README.md` or ARCHITECTURE.md for the exact scripts), then `npm run dev`.
4. Log in with the seeded user for each role to check permissions.

## 2. Feature workflow

1. Pick a backlog item, and read its REQ ID, user story and acceptance criteria in [REQUIREMENTS.md](../REQUIREMENTS.md).
2. Schema change (Drizzle) → migration → seed data update.
3. Server action or route with `requireWrite("<module>")` (pages use `requireUser`) and zod input validation.
4. UI (check it on mobile if engineers or store staff use it).
5. Tests: unit tests for the rules, plus a manual run through the tester's cases for that module.
6. Update the docs if behaviour or rules changed (the REQUIREMENTS change log through the Business Consultant, and AUTOMATION_AGENTS for agents).
7. Open a PR. Vercel creates a preview deployment, and the tester checks it there.

## 3. Cross-module flows (test these from end to end)

| Flow | Steps | What must be true |
|---|---|---|
| Price flow | Purchase invoice for *Pipe MS 80 NB* at ₹1,650 from Vendor B → new quote using Pipe MS 80 NB | The quote shows the latest rate ₹1,650 (not the master list ₹1,600), with its date and Vendor B. Supply rate = 1,650 × 1.40 = ₹2,310 |
| BOQ flow | Hydrant template, qty on 18 of 60 lines | The quote has exactly 18 lines, with the same BOQ Refs and order. The message shows 42 excluded |
| Order flow | Won quote → SO (10 lines) → delivery of 9 lines | The login pop-up shows 1 pending line. The Pending Delivery Agent raises an alert after the expected date |
| Invoice flow | Fully delivered SO → invoice → part payment | Outstanding = total − payment. The Dunning Agent sends an e-mail on the due date |
| Project flow | Project contract ₹10,00,000; purchase of ₹4,00,000 tagged; petrol ₹2,000 split 50/50 with another project | Spend ₹4,01,000; margin ₹5,99,000 |
| Refill flow | 10 × CO2 4.5 kg, last refill 01-12-2025, 1 yr | Shows in Refills due from 21-11-2026. "Refilled" moves the due date to 01-12-2027 (or refill date + 1 yr; confirm the rule) |

### Version 2 flows (test these too)

| Flow | Steps | What must be true |
|---|---|---|
| Approval flow | Quote with a line below minimum margin, approval mode "below minimum margin" | Cannot be sent until an admin approves; a price edit after approval sends it back to pending (CONVENTIONS rule 11) |
| BOQ import flow | Import the client's sample consultant BOQ (150 lines) | 95 auto-matched, 55 to check, 0 unmatched; the quote passes the same approval gate |
| Buy-to-order flow | Customer order → vendor PO from pending lines → purchase invoice from the PO → post | Order lines become Ordered; PO received qty and status update on posting only (rule 16) |
| Return flow | Delivered order → customer return with restock → post → adjust against an invoice | Returned qty, stock and project cost update once; invoice outstanding and credit note balance fall together (rule 13) |
| Advance flow | Advance for a customer → apply to an invoice | Capped by both balances; net outstanding = invoices − credit notes − advances (rule 15) |
| AMC flow | New AMC → visits scheduled → record a visit → renew | Visits evenly spread; renewal links the old contract and clears the renewal alert (rule 19) |
| Profit flow | Month with invoices, a credit note, deliveries and expenses | The monthly P&L and order P&L match rules 17 and 18 |

## 4. Pitfalls in this project

- Floats: Excel and JS both corrupt decimals (`1.2000000000000002` in the client's sample). Keep BOQ refs as text and money as decimals.
- Time zone: Vercel runs in UTC, so always work out "today" and the FY in Asia/Kolkata.
- PGlite and Neon must behave the same, so test migrations on both.
- Serverless limits: agents and exports must finish quickly, so paginate.
- Never let purchase and sales rates share a column or a history table.
- Indian numbering resets on 1 April, so test the 31-03 / 01-04 boundary.
- Business rules live in [app/CONVENTIONS.md](../../app/CONVENTIONS.md), rules 1 to 20 (10 to 20 are version 2). Read them before touching money, stock or status code.
- UI: build pages from the patterns in [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) (see the [frontend guide](frontend-developer.md)). Add or rename pages only in `src/components/nav.ts`.
- Schema: migrations must stay additive, and any one-time data fix for existing databases belongs in a guarded, idempotent step like `upgradeExisting()` in `src/db/index.ts` (see the [DevOps guide](devops.md)).
