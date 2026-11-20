# Fullstack Developer Guide

Role: deliver features end-to-end (schema → server → UI → test) and glue modules together. Read [frontend-developer.md](frontend-developer.md) and [backend-developer.md](backend-developer.md) — this guide covers the workflow and the cross-module flows that are easy to break.

## 1. Local setup

1. Node.js LTS; `cd app && npm install`.
2. Create `app/.env.local` (never commit) — minimum for local demo:
   ```
   AUTH_SECRET=<random 32+ chars>
   # DATABASE_URL omitted → PGlite embedded DB is used for demo
   ```
   For Neon: `DATABASE_URL=postgres://…?sslmode=require`.
3. Run migrations/seed (see `app/README.md` / ARCHITECTURE.md for the exact scripts), then `npm run dev`.
4. Log in with seeded users for each role to verify permissions.

## 2. Feature workflow

1. Pick a backlog item; read its REQ ID, user story and acceptance criteria in [REQUIREMENTS.md](../REQUIREMENTS.md).
2. Schema change (Drizzle) → migration → seed data update.
3. Server action/route with `requireRole` + input validation.
4. UI (mobile check if engineer/store use it).
5. Tests: unit for rules; a manual run-through of the tester's cases for that module.
6. Update docs if behaviour/rules changed (REQUIREMENTS change log via BC; AUTOMATION_AGENTS for agents).
7. Open PR; Vercel preview deployment; tester verifies on preview.

## 3. Cross-module flows (test these end-to-end)

| Flow | Steps | Must hold |
|---|---|---|
| Price flow | Purchase invoice for *Pipe MS 80 NB* at ₹1,650 from Vendor B → new quote using Pipe MS 80 NB | Quote shows latest rate ₹1,650 (not the master list ₹1,600), date, Vendor B; supply rate = 1,650 × 1.40 = ₹2,310 |
| BOQ flow | Hydrant template, qty on 18 of 60 lines | Quote has exactly 18 lines, same BOQ Refs/order; message shows 42 excluded |
| Order flow | Won quote → SO (10 lines) → delivery of 9 lines | Login pop-up shows 1 pending line; Pending Delivery Agent alerts after expected date |
| Invoice flow | Fully delivered SO → invoice → part payment | Outstanding = total − payment; Dunning Agent e-mails on due date |
| Project flow | Project contract ₹10,00,000; purchase ₹4,00,000 tagged; petrol ₹2,000 split 50/50 with another project | Spend ₹4,01,000; margin ₹5,99,000 |
| Refill flow | 10 × CO2 4.5 kg, last refill 01-12-2025, 1 yr | Appears in Refills due from 21-11-2026; "Refilled" rolls to 01-12-2027 (or refill date + 1 yr — confirm rule) |

## 4. Pitfalls specific to this project

- Floats: Excel and JS both corrupt decimals (`1.2000000000000002` in the client sample). Keep BOQ refs as text and money as decimals.
- Time zone: Vercel runs in UTC — always compute "today" and FY in Asia/Kolkata.
- PGlite vs Neon parity: test migrations on both.
- Serverless limits: agents and exports must finish quickly; paginate.
- Don't let purchase and sales rates share a column or history table.
- Indian numbering resets on 1 April — test 31-03 / 01-04 boundaries.
