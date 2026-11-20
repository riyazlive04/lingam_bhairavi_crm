# Test Report — LBE Fire Safety CRM

**Date:** 2026-11-21 · **Tester:** QA / Test Engineer (automated + HTTP smoke) · **Build under test:** production build running at `http://localhost:3100` (embedded PGlite, seeded demo data). Source fixes from this round are **not** in that build yet (rebuild needed).

## 1. Scope

| Level | What was covered |
|---|---|
| Unit (vitest) | `lib/format`, `lib/pricing` (rules 1–3), amount-in-words (quotations + billing), `revisionNumber`, `whatsappLink`, agent rules (`isOverdue`, `bucketAgeing`, reminder schedule, `reconcileExisting`, `budgetUsedPct`), RBAC matrix, refills (rule 8), purchase totals, order/line status (rule 7), invoice status / ageing (rule 6) |
| Integration (vitest + in-memory PGlite, real migrations + `seed()`) | `postPurchaseInvoice` (rule 4) incl. double-post, older-dated invoice, project-tagged invoice → `projectCostSummary`; expense allocations pending / approved / rejected (rule 5); `runAgents` idempotency and auto-resolve; `pendingDeliveryLines` |
| HTTP smoke (vitest, `fetch`) | login per role, 27 admin pages + per-role pages, RBAC redirects, unauthenticated redirects, cron 401, xlsx exports, cross-module link/param contracts |
| Crawler | `node scripts/smoke-crawl.mjs http://localhost:3100 300` (all 6 roles, every reachable in-app GET link) |

Not covered: browser rendering/JS behaviour, mobile layout (MB-1), file upload, SMTP sending, performance of 150-line export (PF-1), server actions through HTTP (they need form action ids; covered at lib level instead).

## 2. Environment & how to run

- Node / Windows 11, Next.js 15.5, vitest 5.1.1 (+ `vite@7` added as devDependency — it is vitest's required peer and was missing, so vitest could not start).
- `app/vitest.config.ts` — node environment, `@` → `./src`, `server-only` → `tests/server-only-stub.ts`, excludes `.next`/`.data`.
- `npm test` → unit + integration (E2E skipped). `E2E_BASE_URL=http://localhost:3100 npx vitest run` → everything.

## 3. Results

| Suite | Files | Tests | Pass | Fail |
|---|---|---|---|---|
| Unit `tests/unit/*` | 6 | 59 | 59 | 0 |
| Integration `tests/integration/*` | 2 | 7 | 7 | 0 |
| HTTP smoke `tests/e2e/smoke.test.ts` | 1 | 66 | 66 | 0 |
| **Total** | **9** | **132** | **132** | **0** |

First run: 1 unit failure (`addMonths` month-end overflow) → fixed in `src/lib/format.ts`, now green.

Crawler (old build): admin 161, sales 100, purchase 89, accounts 122, engineer 63, store 48 pages visited; **41 problems, 0 server errors (5xx), 0 SLOW**: 6× 404 (`/billing/:id`, already corrected to `/billing/invoices/:id` in source) and 35× FORBIDDEN-LINK (all fixed in source, see §5). Re-crawl after rebuild expected to show 0.

## 4. UAT checklist (docs/guides/tester.md)

PASS = verified by automated test or HTTP check; NOT TESTED = needs a browser / manual data entry.

### 4.1 Login & roles
| # | Result | Evidence |
|---|---|---|
| L-1 | PASS | e2e: each role logs in and opens its pages; rbac.test matrix |
| L-2 | PASS | e2e: sales `GET /purchases/1` → `/forbidden` |
| L-3 | **FAIL (running build)** | 7 wrong passwords in a row → all `303 ?err=Invalid email or password` (generic message OK, **no throttling**). Security engineer is working on auth — re-test after rebuild |
| L-4 | PASS (server side) | e2e: unauthenticated `/`, `/billing`, `/quotations/1`, `/items/export` → `/login` |

### 4.2 Item & Price Master
| # | Result | Evidence |
|---|---|---|
| IM-1 | NOT TESTED | import flow not exercised |
| IM-2 | NOT TESTED | |
| IM-3 | PASS | `/items?q=pipe ms 80` → exactly 1 item (Pipe MS 80NB) |
| PM-1 | PASS | integration: posting at higher rate today → `items.lastPurchaseRate`, date, vendor updated; price_history row |
| PM-2 | PASS | integration: older-dated invoice at half the rate → latest rate and vendor_items rate unchanged |
| PM-3 | NOT TESTED | (item page shows separate sales/purchase history — visual check only) |
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
| BQ-1..3 | NOT TESTED | rule 3 zero-qty exclusion verified in `computeQuoteTotals` |
| QT-1 | PASS | pricing.test: 1,650 × 1.40 = 2,310; 120 × 2,310 = 2,77,200 |
| QT-2 | PASS | 120 × 250 = 30,000 |
| QT-3 | PASS | taxable 3,07,200 → GST 55,296 (27,648 + 27,648), total 3,62,496 |
| QT-4 | PASS (math) | IGST = full tax 55,296 |
| QT-5 | PASS (lib) | `linePriceWarning(1800 vs 1650)` → `low_margin` (8.33 %) |
| QT-6 | PASS | `financialYear("2027-04-01")` = `2027-28`; 31-Mar → previous FY |
| QT-7 | PASS (partial) | `/quotations/1/export` → 200, xlsx content-type, valid zip; columns not inspected |
| QT-8..11 | NOT TESTED | |
| QT-12 | PASS (lib) | `revisionNumber` → `-R1`, `-R1` → `-R2` |

### 4.7 Orders & Deliveries
| # | Result | Evidence |
|---|---|---|
| SO-1 | PASS (lib) | `orderStatusFor` 9 delivered + 1 pending → partial |
| SO-2 | NOT TESTED | |
| SO-3 | NOT TESTED | |
| SO-4 | NOT TESTED | |
| SO-5 | PASS (lib) | line delivered → order delivered; pd:line alert auto-resolved on next agent run |

### 4.8 Purchase invoices
| # | Result | Evidence |
|---|---|---|
| PI-1 | PASS (schema) | unique index `pi_vendor_no_uq`; posting twice rejected (`PurchaseError`), no duplicate stock/price rows |
| PI-2 | NOT TESTED | |
| PI-3 | PASS | integration: project-tagged invoice 3 × ₹1,000 → `issue_project` movement, project materials +3,000 (GST excluded), margin −3,000 |
| PI-4 | NOT TESTED | |

### 4.9 Projects & Expenses
| # | Result | Evidence |
|---|---|---|
| PR-1 | PASS (lib) | rule 5 via `projectCostSummary` |
| EX-1 | PASS | pending 50/50 split → not in actual cost, shown as pendingExpenses |
| EX-2 | PASS | after approval each project +₹1,000 exactly; rejected → removed again |
| EX-3 | NOT TESTED | |
| PR-2 | PASS (lib) | `budgetUsedPct(5,60,000 / 7,00,000)` = 80 |

### 4.10 Sales invoices / outstanding
| # | Result | Evidence |
|---|---|---|
| SI-1 | NOT TESTED | |
| SI-2 | PASS (lib) | outstanding 3,62,496 − 1,00,000 = 2,62,496; status partially_paid; paid within ₹0.50 |
| OS-1 | PASS | `ageingBucket(45)` → 31–60 (billing) / `bucketAgeing(45)` → 31-60 (agents) |
| OS-2 | PASS (smoke) | `/billing/payables`, `/billing/export/payables` (xlsx) |

### 4.11 Refill tracker
| # | Result | Evidence |
|---|---|---|
| RF-1 | PASS | next due 01-12-2026; `refillBucket` = due10 on 21-11-2026, due30 on 20-11-2026 |
| RF-2 | PASS | +36 months |
| RF-3 | PASS (lib) | 03-12-2026 → 03-12-2027 |
| RF-4 | NOT TESTED | |

### 4.12 Agents
| # | Result | Evidence |
|---|---|---|
| AG-2 | PASS | integration: second `runAgents` → 0 new alerts, 0 new e-mails, no duplicate dedupe keys |
| AG-3 | PASS (lib) | `severityForLateness(8)` = critical |
| AG-5 / AG-6 | PASS (lib) | `isReminderDue` on due date; no reminder after `maxReminders` |
| AG-12 | PASS (lib) | budgetUsedPct 100 |
| AG-13 | PASS | integration: delivered line → its `pd:line:<id>` alert becomes `done` |
| AG-14 | PASS | e2e: `/api/cron/agents` without / with wrong bearer → 401 |
| AG-1, 4, 7–11 | NOT TESTED | individually (all agents ran without error in integration) |

### 4.13 Dashboard / Meeting notes / Mobile
| # | Result | Evidence |
|---|---|---|
| DB-1 | NOT TESTED | |
| DB-2 | PASS (lib) | Indian format helpers; `moneyShort` L / Cr |
| MN-1 | NOT TESTED | `/meeting-notes` returns 200 |
| MB-1, PF-1 | NOT TESTED | no browser available |

## 5. Bugs found & fixed (source — needs rebuild)

| # | Sev | Bug | Fix |
|---|---|---|---|
| B-1 | Sev-3 | `addMonths` overflowed month ends (31-Jan + 1 → 03-Mar; refill on 29-Feb + 12 months → 01-Mar) — affects refill next-due / HPT due | `app/src/lib/format.ts:46-55` clamps to last day of target month |
| B-2 | Sev-3 | accounts: item page linked to `/stock/:id` (forbidden); also vendor / purchase / customer / quotation / invoice links shown to roles that cannot open them | `app/src/app/(app)/items/[id]/page.tsx:35` (`can` map) and guarded links |
| B-3 | Sev-3 | engineer & store: order page linked to `/quotations/:id` | `app/src/app/(app)/orders/[id]/page.tsx:152` |
| B-4 | Sev-3 | accounts: quotation page linked to `/boq-templates/:id`; project links for roles without projects | `app/src/app/(app)/quotations/[id]/page.tsx:102,111` |
| B-5 | Sev-3 | purchase: “Quote with this” / “New quotation” buttons → `/quotations/new` (purchase cannot write quotations) | `app/src/app/(app)/boq-templates/page.tsx:91`, `boq-templates/[id]/page.tsx:44` |
| B-6 | Sev-3 | store: purchase list linked vendors | `app/src/app/(app)/purchases/page.tsx:116` |
| B-7 | Sev-3 | sales/purchase: project sheet linked purchase invoices, other users' expense vouchers, sales invoices, quotation | `app/src/app/(app)/projects/[id]/page.tsx:30-31` + links; `projects/_lib/sheet.ts:51` now selects `userId` (voucher link only for approvers or the voucher's owner, matching `/expenses/[id]` rule) |
| B-8 | Sev-3 | store: expense list / voucher linked `/projects/:id` | `app/src/app/(app)/expenses/page.tsx:179`, `expenses/[id]/page.tsx:83` |
| B-9 | Sev-3 | link/param contract: `/refills?customer=` (dashboard, startup digest, refill-due agent alerts, customer page) ignored — refill page reads `customerId` | `app/src/app/(app)/refills/page.tsx:28-30` accepts `customer` as alias (stored alert links keep working) |
| B-10 | Sev-3 | `/quotations/new?customer=` from customer page ignored (page reads `customerId`) | `app/src/app/(app)/customers/[id]/page.tsx:115,179` now use `customerId` |
| B-11 | Sev-2 (test infra) | vitest could not start — peer `vite` missing | `vite@^7` devDependency |

Already fixed in source before this round (crawler on old build still shows them): `/billing/:id` 404 links from customer and project pages → now `/billing/invoices/:id`.

Verified: `npx tsc --noEmit -p .` clean; `npx eslint` on all changed files clean.

## 6. Link / param contract check

| Link | Target reads | Status |
|---|---|---|
| `/refills?customer=` | `customerId` (+ alias `customer` now) | fixed (B-9) |
| `/quotations/new?customerId=…&source=refill&assetIds=…` (refill asset table) | `customerId` only | customer pre-selected; **`source`/`assetIds` ignored** — open issue O-2 |
| `/quotations/new?customer=` | — | fixed at source (B-10) |
| `/expenses?status=pending` | `status` | OK |
| `/items?q=` (stale-price alerts) | `q` (code, name, size, group, make) | OK |
| `/quotations?status=sent` | `status` | OK |
| `/purchases/new?vendor=` / `?project=` | `vendor`, `project` | OK |
| `/billing/invoices/new?orderId=` | `orderId` | OK |
| `/expenses/new?projectId=` | `projectId` | OK |
| `/billing/invoices?overdue=1`, `/billing/payments?direction=`, `/billing/payables?vendor=`, `/alerts?agent=`, `/items?view=matrix` | all read | OK |

## 7. Open issues (ranked)

| # | Sev | Issue | Owner |
|---|---|---|---|
| O-1 | Sev-1 (security) | Login is not throttled on the running build (L-3) — 7 consecutive failures all accepted | Security (in progress) — re-test after rebuild |
| O-2 | Sev-3 | Refill → quotation: `source=refill&assetIds=` are ignored by `/quotations/new`; user must add refill lines manually | Quotations team |
| O-3 | Sev-4 | Two ageing conventions: billing `ageingBucket(0)` = “0–30”, agents `bucketAgeing(0)` = “current” — same invoice may sit in different buckets on the billing page vs agent alerts on its due date | Billing / Agents |
| O-4 | Sev-4 | Rebuild required: crawler will keep reporting the 41 old problems until the manager rebuilds; re-run `node scripts/smoke-crawl.mjs http://localhost:3100 300` and expect 0 FORBIDDEN-LINK / 0 404 | Manager |
| O-5 | — | Many UAT items need manual / browser testing (see NOT TESTED rows), incl. mobile 360 px and the 150-line export timing | Tester + client UAT |
