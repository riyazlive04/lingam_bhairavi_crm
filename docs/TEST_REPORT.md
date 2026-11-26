# Test Report: LBE Fire Safety CRM

> **Version 2 update (2026-11-26):** sections 1 to 7 are the version 1 round of 2026-11-21 and are kept as they were. The version 2 and UI rebuild results are in [§8](#8-version-2-and-ui-rebuild-2026-11-26). Current totals: **197 unit and integration tests and 66 of 66 end-to-end checks pass**, and the crawler finds **0 problems** on about 990 pages.

**Date:** 2026-11-21 · **Tester:** QA / Test Engineer, Sirah Digital (automated tests and HTTP smoke checks) · **Build under test:** the production build running at `http://localhost:3100` (embedded PGlite, seeded demo data). The source fixes from this round are **not** in that build yet, so a rebuild is needed.

## 1. Scope

| Level | What we covered |
|---|---|
| Unit (vitest) | `lib/format`, `lib/pricing` (rules 1 to 3), amount in words (quotations and billing), `revisionNumber`, `whatsappLink`, agent rules (`isOverdue`, `bucketAgeing`, reminder schedule, `reconcileExisting`, `budgetUsedPct`), the RBAC matrix, refills (rule 8), purchase totals, order and line status (rule 7), invoice status and ageing (rule 6) |
| Integration (vitest + in-memory PGlite, real migrations + `seed()`) | `postPurchaseInvoice` (rule 4), including double-post, an older-dated invoice, and a project-tagged invoice → `projectCostSummary`; expense allocations pending, approved and rejected (rule 5); `runAgents` idempotency and auto-resolve; `pendingDeliveryLines` |
| HTTP smoke (vitest, `fetch`) | Login per role, 27 admin pages plus per-role pages, RBAC redirects, unauthenticated redirects, cron 401, xlsx exports, cross-module link and parameter contracts |
| Crawler | `node scripts/smoke-crawl.mjs http://localhost:3100 300` (all 6 roles, every reachable in-app GET link) |

Not covered: browser rendering and JS behaviour, mobile layout (MB-1), file upload, SMTP sending, the timing of a 150-line export (PF-1), and server actions over HTTP (they need form action ids, so we covered them at library level instead).

## 2. Environment and how to run

- Node on Windows 11, Next.js 15.5, vitest 5.1.1. We added `vite@7` as a devDependency: vitest needs it as a peer, and without it vitest could not start.
- `app/vitest.config.ts`: node environment, `@` → `./src`, `server-only` → `tests/server-only-stub.ts`, and `.next`/`.data` excluded.
- `npm test` runs unit and integration tests (E2E skipped). `E2E_BASE_URL=http://localhost:3100 npx vitest run` runs everything.

## 3. Results

| Suite | Files | Tests | Pass | Fail |
|---|---|---|---|---|
| Unit `tests/unit/*` | 6 | 59 | 59 | 0 |
| Integration `tests/integration/*` | 2 | 7 | 7 | 0 |
| HTTP smoke `tests/e2e/smoke.test.ts` | 1 | 66 | 66 | 0 |
| **Total** | **9** | **132** | **132** | **0** |

The first run had 1 unit failure (`addMonths` overflowing at month end). We fixed it in `src/lib/format.ts`, and it now passes.

Crawler (old build): admin 161, sales 100, purchase 89, accounts 122, engineer 63 and store 48 pages visited. It found **41 problems, 0 server errors (5xx) and 0 SLOW**: 6 × 404 (`/billing/:id`, already corrected to `/billing/invoices/:id` in source) and 35 × FORBIDDEN-LINK (all fixed in source, see §5). We expect a re-crawl after the rebuild to show 0.

## 4. UAT checklist (docs/guides/tester.md)

PASS means verified by an automated test or HTTP check. NOT TESTED means it needs a browser or manual data entry.

### 4.1 Login and roles
| # | Result | Evidence |
|---|---|---|
| L-1 | PASS | e2e: each role logs in and opens its pages; rbac.test matrix |
| L-2 | PASS | e2e: sales `GET /purchases/1` → `/forbidden` |
| L-3 | **FAIL (running build)** | 7 wrong passwords in a row all return `303 ?err=Invalid email or password`. The generic message is fine, but there is **no throttling**. The security engineer is working on auth, so re-test after the rebuild |
| L-4 | PASS (server side) | e2e: unauthenticated `/`, `/billing`, `/quotations/1`, `/items/export` → `/login` |

### 4.2 Item & Price Master
| # | Result | Evidence |
|---|---|---|
| IM-1 | NOT TESTED | Import flow not exercised |
| IM-2 | NOT TESTED | |
| IM-3 | PASS | `/items?q=pipe ms 80` → exactly 1 item (Pipe MS 80NB) |
| PM-1 | PASS | integration: posting at a higher rate today updates `items.lastPurchaseRate`, date and vendor, and adds a price_history row |
| PM-2 | PASS | integration: an older-dated invoice at half the rate leaves the latest rate and the vendor_items rate unchanged |
| PM-3 | NOT TESTED | The item page shows separate sales and purchase history (visual check only) |
| PM-4 | NOT TESTED | |

### 4.3 Vendors · 4.4 Customers
| # | Result | Evidence |
|---|---|---|
| VN-1 | PASS (lib) | integration: vendor_items upsert with lastRate/lastDate |
| VN-2 | NOT TESTED | |
| CU-1, CU-2 | NOT TESTED | |

### 4.5 BOQ → Quotation · 4.6 Quotations
| # | Result | Evidence |
|---|---|---|
| BQ-1..3 | NOT TESTED | Rule 3 (zero-qty lines left out) verified in `computeQuoteTotals` |
| QT-1 | PASS | pricing.test: 1,650 × 1.40 = 2,310; 120 × 2,310 = 2,77,200 |
| QT-2 | PASS | 120 × 250 = 30,000 |
| QT-3 | PASS | Taxable 3,07,200 → GST 55,296 (27,648 + 27,648), total 3,62,496 |
| QT-4 | PASS (math) | IGST = full tax 55,296 |
| QT-5 | PASS (lib) | `linePriceWarning(1800 vs 1650)` → `low_margin` (8.33 %) |
| QT-6 | PASS | `financialYear("2027-04-01")` = `2027-28`; 31-Mar → previous FY |
| QT-7 | PASS (partial) | `/quotations/1/export` → 200, xlsx content-type, valid zip; columns not inspected |
| QT-8..11 | NOT TESTED | |
| QT-12 | PASS (lib) | `revisionNumber` → `-R1`, `-R1` → `-R2` |

### 4.7 Orders and Deliveries
| # | Result | Evidence |
|---|---|---|
| SO-1 | PASS (lib) | `orderStatusFor` with 9 delivered + 1 pending → partial |
| SO-2 | NOT TESTED | |
| SO-3 | NOT TESTED | |
| SO-4 | NOT TESTED | |
| SO-5 | PASS (lib) | Line delivered → order delivered; the pd:line alert resolves itself on the next agent run |

### 4.8 Purchase invoices
| # | Result | Evidence |
|---|---|---|
| PI-1 | PASS (schema) | Unique index `pi_vendor_no_uq`; posting twice is rejected (`PurchaseError`), with no duplicate stock or price rows |
| PI-2 | NOT TESTED | |
| PI-3 | PASS | integration: a project-tagged invoice of 3 × ₹1,000 → `issue_project` movement, project materials +3,000 (GST excluded), margin −3,000 |
| PI-4 | NOT TESTED | |

### 4.9 Projects and Expenses
| # | Result | Evidence |
|---|---|---|
| PR-1 | PASS (lib) | Rule 5 via `projectCostSummary` |
| EX-1 | PASS | A pending 50/50 split is not in actual cost and shows as pendingExpenses |
| EX-2 | PASS | After approval each project goes up by exactly ₹1,000; after rejection it is removed again |
| EX-3 | NOT TESTED | |
| PR-2 | PASS (lib) | `budgetUsedPct(5,60,000 / 7,00,000)` = 80 |

### 4.10 Sales invoices and outstanding
| # | Result | Evidence |
|---|---|---|
| SI-1 | NOT TESTED | |
| SI-2 | PASS (lib) | Outstanding 3,62,496 − 1,00,000 = 2,62,496; status partially_paid; counted as paid within ₹0.50 |
| OS-1 | PASS | `ageingBucket(45)` (billing) and `bucketAgeing(45)` (agents) both return the 31 to 60 day bucket. Billing labels it with an en dash and agents with a hyphen (`31-60`) |
| OS-2 | PASS (smoke) | `/billing/payables`, `/billing/export/payables` (xlsx) |

### 4.11 Refill tracker
| # | Result | Evidence |
|---|---|---|
| RF-1 | PASS | Next due 01-12-2026; `refillBucket` = due10 on 21-11-2026 and due30 on 20-11-2026 |
| RF-2 | PASS | +36 months |
| RF-3 | PASS (lib) | 03-12-2026 → 03-12-2027 |
| RF-4 | NOT TESTED | |

### 4.12 Agents
| # | Result | Evidence |
|---|---|---|
| AG-2 | PASS | integration: a second `runAgents` → 0 new alerts, 0 new e-mails, no duplicate dedupe keys |
| AG-3 | PASS (lib) | `severityForLateness(8)` = critical |
| AG-5 / AG-6 | PASS (lib) | `isReminderDue` on the due date; no reminder after `maxReminders` |
| AG-12 | PASS (lib) | budgetUsedPct 100 |
| AG-13 | PASS | integration: a delivered line's `pd:line:<id>` alert becomes `done` |
| AG-14 | PASS | e2e: `/api/cron/agents` with no bearer or a wrong one → 401 |
| AG-1, 4, 7 to 11 | NOT TESTED | Not tested one by one (all agents ran without error in integration) |

### 4.13 Dashboard, Meeting notes, Mobile
| # | Result | Evidence |
|---|---|---|
| DB-1 | NOT TESTED | |
| DB-2 | PASS (lib) | Indian format helpers; `moneyShort` L / Cr |
| MN-1 | NOT TESTED | `/meeting-notes` returns 200 |
| MB-1, PF-1 | NOT TESTED | No browser available |

## 5. Bugs found and fixed (in source, rebuild needed)

| # | Sev | Bug | Fix |
|---|---|---|---|
| B-1 | Sev-3 | `addMonths` overflowed at month end (31-Jan + 1 → 03-Mar; a refill on 29-Feb + 12 months → 01-Mar). This affected refill next-due and HPT due dates | `app/src/lib/format.ts:46-55` now clamps to the last day of the target month |
| B-2 | Sev-3 | Accounts: the item page linked to `/stock/:id` (forbidden). Vendor, purchase, customer, quotation and invoice links were also shown to roles that cannot open them | `app/src/app/(app)/items/[id]/page.tsx:35` (`can` map) and guarded links |
| B-3 | Sev-3 | Engineer and store: the order page linked to `/quotations/:id` | `app/src/app/(app)/orders/[id]/page.tsx:152` |
| B-4 | Sev-3 | Accounts: the quotation page linked to `/boq-templates/:id`, and showed project links to roles without projects | `app/src/app/(app)/quotations/[id]/page.tsx:102,111` |
| B-5 | Sev-3 | Purchase: the "Quote with this" and "New quotation" buttons went to `/quotations/new`, but purchase cannot write quotations | `app/src/app/(app)/boq-templates/page.tsx:91`, `boq-templates/[id]/page.tsx:44` |
| B-6 | Sev-3 | Store: the purchase list linked to vendors | `app/src/app/(app)/purchases/page.tsx:116` |
| B-7 | Sev-3 | Sales and purchase: the project sheet linked to purchase invoices, other users' expense vouchers, sales invoices and the quotation | `app/src/app/(app)/projects/[id]/page.tsx:30-31` plus links; `projects/_lib/sheet.ts:51` now selects `userId` (the voucher link shows only for approvers or the voucher's owner, matching the `/expenses/[id]` rule) |
| B-8 | Sev-3 | Store: the expense list and voucher linked to `/projects/:id` | `app/src/app/(app)/expenses/page.tsx:179`, `expenses/[id]/page.tsx:83` |
| B-9 | Sev-3 | Link and parameter contract: `/refills?customer=` (from the dashboard, startup digest, refill-due agent alerts and customer page) was ignored, because the refill page reads `customerId` | `app/src/app/(app)/refills/page.tsx:28-30` now accepts `customer` as an alias (so stored alert links keep working) |
| B-10 | Sev-3 | `/quotations/new?customer=` from the customer page was ignored (the page reads `customerId`) | `app/src/app/(app)/customers/[id]/page.tsx:115,179` now use `customerId` |
| B-11 | Sev-2 (test setup) | vitest could not start because its peer `vite` was missing | `vite@^7` devDependency |

Already fixed in source before this round (the crawler on the old build still shows them): `/billing/:id` 404 links from the customer and project pages now point to `/billing/invoices/:id`.

Verified: `npx tsc --noEmit -p .` is clean, and `npx eslint` on all changed files is clean.

## 6. Link and parameter contract check

| Link | Target reads | Status |
|---|---|---|
| `/refills?customer=` | `customerId` (and now the alias `customer`) | Fixed (B-9) |
| `/quotations/new?customerId=…&source=refill&assetIds=…` (refill asset table) | `customerId` only | The customer is pre-selected, but **`source`/`assetIds` are ignored**. Open issue O-2 |
| `/quotations/new?customer=` | - | Fixed at source (B-10) |
| `/expenses?status=pending` | `status` | OK |
| `/items?q=` (stale-price alerts) | `q` (code, name, size, group, make) | OK |
| `/quotations?status=sent` | `status` | OK |
| `/purchases/new?vendor=` / `?project=` | `vendor`, `project` | OK |
| `/billing/invoices/new?orderId=` | `orderId` | OK |
| `/expenses/new?projectId=` | `projectId` | OK |
| `/billing/invoices?overdue=1`, `/billing/payments?direction=`, `/billing/payables?vendor=`, `/alerts?agent=`, `/items?view=matrix` | All read | OK |

## 7. Open issues (ranked)

| # | Sev | Issue | Owner |
|---|---|---|---|
| O-1 | Sev-1 (security) | Login is not throttled on the running build (L-3): 7 failures in a row were all accepted | Security (in progress). Re-test after the rebuild |
| O-2 | Sev-3 | Refill → quotation: `/quotations/new` ignores `source=refill&assetIds=`, so the user has to add refill lines by hand | Quotations developer |
| O-3 | Sev-4 | Two ageing conventions: billing `ageingBucket(0)` returns "0 to 30" days, while agents `bucketAgeing(0)` returns "current". On its due date, the same invoice can sit in different buckets on the billing page and in agent alerts | Billing / Agents developers |
| O-4 | Sev-4 | Rebuild needed: the crawler will keep reporting the 41 old problems until the Manager rebuilds. Then re-run `node scripts/smoke-crawl.mjs http://localhost:3100 300` and expect 0 FORBIDDEN-LINK and 0 404 | Manager |
| O-5 | N/A | Many UAT items need manual or browser testing (see the NOT TESTED rows), including mobile at 360 px and the 150-line export timing | Tester + client UAT |

---

## 8. Version 2 and UI rebuild (2026-11-26)

**Tester:** QA / Test Engineer, Sirah Digital · **Builds under test:** version 2 (commit `5840a3c`) and the UI rebuild (commit `d86366d`), production build on embedded PGlite with seeded demo data, plus a copy of the version 1 database for the upgrade test.

### 8.1 Results

| Suite | Files | Tests | Pass | Fail |
|---|---|---|---|---|
| Unit `tests/unit/*` | 12 | 175 | 175 | 0 |
| Integration `tests/integration/*` (in-memory PGlite, real migrations + `seed()`) | 6 | 22 | 22 | 0 |
| **Unit + integration (`npm test`)** | **18** | **197** | **197** | **0** |
| HTTP end-to-end `tests/e2e/smoke.test.ts` (live server, `E2E_BASE_URL` set) | 1 | 66 | 66 | 0 |
| **Total** | **19** | **263** | **263** | **0** |

Without `E2E_BASE_URL`, `npm test` reports the 66 end-to-end checks as skipped; that is expected.

### 8.2 What the new suites cover

| File | Tests | Covers |
|---|---|---|
| `unit/quote-approval.test.ts` | 11 | Rule 10: cost snapshot with date and supplier, list price fallback, stale windows (7 days for volatile items, 90 for others). Rule 11: the three approval modes (off, below minimum margin, all), discounts pushing a quote under the minimum, and sending blocked until approved |
| `unit/pricing.test.ts` | 10 | Rules 1 to 3: latest cost, suggested rates, quotation totals and GST, line price warnings, pricing settings (version 1 suite, kept) |
| `unit/boq-import.test.ts` | 50 | Reading all four sheets of the client's sample BOQ (different header layouts, formula refs, sections, continuation lines), size normalisation, item scoring by group, size and make, matching the sample against the item catalogue, and the upload limits and zip bomb checks (V2-02) |
| `unit/purchase-orders.test.ts` | 11 | Rule 16: PO status from received qty, received percentage, ordering only what is still pending on a sales order line, default buying rate and totals |
| `unit/returns-outstanding.test.ts` | 11 | Rules 13 to 15: returnable quantities, note totals, GST split, net delivered and line status, and net outstanding (invoices − credit notes − advances; debit notes reduce payables) |
| `unit/amc.test.ts` | 16 | Rule 19: visit scheduling across the period, contract and renewal dates, billing period amounts, the service call response countdown and breach, and checklists per system |
| `unit/reports.test.ts` | 17 | Financial year helpers, margin maths and rule 18: monthly P&L lines (sales net of credit notes, cost of goods from deliveries and issues less returns) and totals |
| `integration/purchase-orders.test.ts` | 4 | The demo POs and the quote cost-date backfill (both idempotent), and posting a bill raised from a PO (received qty, partial then received) |
| `integration/returns-advances.test.ts` | 4 | The delivery cost backfill, posting a credit note (returned qty, restock at delivery cost, adjustment, no double posting), a debit note, and a part-applied advance matching the ledger |
| `integration/amc.test.ts` | 5 | The AMC demo data (idempotent), contract numbering and visit scheduling, and the AMC & Service agent (visit, renewal and SLA alerts raised once, SLA alert cleared when the call is resolved) |
| `integration/reports.test.ts` | 2 | All report loaders on the seeded database (monthly P&L, orders, projects, customers, items), and project cost with returns, credit notes and advances |

The version 1 suites (`agents-rules`, `domain-status`, `format`, `pricing`, `rbac`, `words-numbering`, `agents-orders`, `purchasing-costing`) still pass. The RBAC suite checks the whole matrix, including the new modules, for rules such as "write implies read" and "admin can do everything".

### 8.3 Crawler

`node scripts/smoke-crawl.mjs <base-url> 300`, signed in as each of the 6 roles, visiting every reachable in-app link: **about 990 pages visited, 0 problems** (no server errors, broken links or forbidden links). This also closes O-4 above: the problems found on the old version 1 build are gone.

### 8.4 Upgrade path

We started the version 2 build on a copy of the version 1 database (created before migration 0001). The upgrade worked as designed (see [ARCHITECTURE.md §9](ARCHITECTURE.md#9-database-lifecycle-and-upgrade-path)):

- migration `0001_v2_returns_amc_po_approval` applied once on top of `0000_init`, adding tables and columns only, so existing records were kept;
- the one-time backfill (quote line cost dates and suppliers, delivery cost rates) is guarded by `migrations.v2_backfill_done`;
- the version 2 demo data is added only with `SEED_V2_DEMO=1`, once, guarded by `migrations.v2_demo_seeded`.

The idempotency of the backfill and the demo seed is also covered by the integration tests above.

### 8.5 Business check on the client's sample BOQ

Importing the client's sample consultant BOQ (150 lines) matched **95 lines automatically**, left **55 lines to check** and **0 unmatched**. Lines to check are shown for a person to confirm or change before the quotation is created.

### 8.6 Not covered yet

- **Visual review, 26 November 2026.** Screenshots of the live and freshly seeded app were reviewed at desktop (1440 px) and phone (390 px) width: home dashboard, morning summary, quotation with approval and price dates, BOQ import, customer order, vendor PO, credit note, item price page, reports and P&L, item margins, project history, AMC contract, service calls, automation agents and the phone bottom tab bar. Two fixes came out of it: negative amounts now read -₹ instead of ₹-, and list filters fold behind a Filters button on phones. Still to do by a person: dark mode, every A4 print in a real print preview, and client UAT.
- Real Office 365 sending (needs the client's mailbox, A-04).
- The new UAT rows in [guides/tester.md](guides/tester.md) that need manual data entry.

Prepared by Sirah Digital · https://sirahdigital.in/
