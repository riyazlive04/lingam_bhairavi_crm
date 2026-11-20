# Security Review: LBE Fire Safety CRM

| | |
|---|---|
| **Date** | 2026-11-21 |
| **Reviewer** | Security Engineer, Sirah Digital (https://sirahdigital.in/) |
| **Build reviewed** | `app/` source as of this date (Next.js 15.5.29, React 19.1, Drizzle 0.45, jose 6, zod 4) |
| **Status** | All High/Medium findings fixed in code. The server on :3100 runs the **previous build**: fixes marked *verify after rebuild* must be re-checked once the Manager rebuilds. |

## 1. Scope

- Everything under `app/src/`: middleware, auth/session, 18 server-action files (74 actions), 69 pages and layouts, 8 route handlers (login, logout, cron, 7 exports), and the shared libraries (`rbac`, `email`, `markdown`, `billing`, `agents/*`).
- Config: `next.config.ts`, `vercel.json`, `.gitignore`, `.vercelignore`, `.env.local` files (variable names only).
- Dependencies: `npm audit --omit=dev`.
- Out of scope: the Vercel/Neon account setup, Office 365 tenant, and the offline transcription script (only checked for secret handling).

## 2. Method

1. **Manual code review** of every authN/authZ path, every `"use server"` export, every route handler, and every HTML/markdown sink.
2. **Automated sweeps:**
   - grep for `sql.raw`, `dangerouslySetInnerHTML`, `srcDoc`, `JSON.parse`, `redirect(` targets and `e.message` pass-through;
   - a check of zod `.max()` limits against `varchar(N)` column lengths;
   - a scripted check that each exported action calls its guard first.
3. **Black-box HTTP checks** against `http://localhost:3100` using the demo accounts:
   - cookie flags and security headers;
   - cron without a token and with a bad token;
   - `GET` logout;
   - every export route as engineer, store, sales and purchase;
   - anonymous access;
   - the `next` open redirect;
   - a cross-origin login POST.
4. **Static checks:** `npx tsc --noEmit -p .` and `npx eslint <changed files>`, both clean. The only remaining tsc errors are in `items/[id]/page.tsx`, which QA is editing at the same time.

## 3. Findings

Severity: **H** high, **M** medium, **L** low, **I** informational.

| ID | Sev | Area | Description | File:line | Status |
|---|---|---|---|---|---|
| S-01 | M | AuthN / session | A deactivated user, or a user whose role was changed, kept the old access for up to 12 h, because the JWT was trusted on its own. **Fix:** `getSession()` now re-reads the user row (`active`, `role`, `name`) once per request, using React `cache()`. Deactivation takes effect on the next request, and so does a role change. The middleware is unchanged: it stays edge-safe and checks only the signature. | `src/lib/auth.ts:19-34` | **Fixed** (verify after rebuild) |
| S-02 | M | Open redirect | The login `next` parameter accepted `"/<TAB>/evil.com"`, because WHATWG URL parsing strips tab, CR and LF, so the server redirected to `http://evil.com/`. This was reproduced on :3100. **Fix:** reject backslashes and control characters, resolve the URL against the request, and require the same origin. | `src/app/api/auth/login/route.ts:24-36` | **Fixed** (verify after rebuild) |
| S-03 | M | Secrets / AuthN | If `AUTH_SECRET` was missing, a **preview** deployment fell back to a hard-coded secret that is visible in the source, so anyone could forge an admin session token. Only production failed closed. **Fix:** fail closed on both `production` and `preview`. **Action:** set `AUTH_SECRET` in Vercel Preview as well. | `src/lib/session.ts:14` | **Fixed** |
| S-04 | M | Headers | There was no Content-Security-Policy. `X-Frame-Options` was set only by the middleware, so `/login` and `/forbidden` could be framed (clickjacking). **Fix:** CSP and `X-Frame-Options: DENY` are now set in `next.config.ts` for every path (policy in §6). | `next.config.ts:9-35` | **Fixed** (verify after rebuild) |
| S-05 | M | AuthZ (over-privilege) | `orders:write` includes `store`, which is needed for deliveries and line status. As a side effect, Store could also **create, close, cancel and reopen** sales orders, which the RBAC design reserves for Sales and the Owner. **Fix:** `createOrder` and `changeOrderStatus` now also require the `admin` or `sales` role. | `src/app/(app)/orders/actions.ts:29,59,207` | **Fixed** |
| S-06 | M | Info disclosure | Many actions put `e.message` for **any** error into the `?err=` flash. With Drizzle that message is `Failed query: <SQL> params: …`, and Postgres messages name tables and constraints. Triggers included: invalid calendar dates, ids above int4, duplicate-key races, and JSON syntax errors. **Fix:** new `publicError()` helper. It shows zod messages, deliberate `new Error("…")` messages and the module's own error classes. Everything else is logged on the server, and the user sees a generic message. Applied to agents, alerts, boq-templates, customers, follow-ups, items, purchases, quotations, stock and vendors. | `src/lib/errors.ts`; the listed `actions.ts` files | **Fixed** |
| S-07 | L | Reliability | Two values built on the server could exceed their varchar column length and break the action: the reminder e-mail subject (company name up to 200 + text > `varchar(250)`), and the fallback project name on "mark won" (customer name + quote number > `varchar(200)`). **Fix:** both are now truncated (`.slice`). | `src/lib/billing.ts:400`; `src/app/(app)/quotations/actions.ts:328` | **Fixed** |
| S-08 | L | Logging (A09) | Failed logins were not audited. **Fix:** an `audit(…, "login_failed", …)` entry records the IP, the e-mail entered and the reason. | `src/app/api/auth/login/route.ts:73` | **Fixed** |
| S-09 | L | CSRF (login) | A cross-site form could POST to `/api/auth/login` (login CSRF, which signs the victim in to the attacker's account). **Fix:** if an `Origin` header is present, its host must match the request host. | `src/app/api/auth/login/route.ts:38-48` | **Fixed** (verify after rebuild) |
| S-10 | L | DoS | The login throttle map grew without limit, one entry per IP + e-mail. **Fix:** expired entries are pruned once the map reaches 5,000 keys. | `src/app/api/auth/login/route.ts:50-53` | **Fixed** |
| S-11 | L | Rate limiting | The throttle (8 failures per 15 min per IP + e-mail) lives in memory **per serverless instance**, so a distributed attack is only partly slowed. It does not lock accounts, which is deliberate to avoid locking out real users. | `src/app/api/auth/login/route.ts:14` | Accepted. Optional: move to Upstash/Vercel KV, or Vercel Firewall rate limiting on `/api/auth/login`. |
| S-12 | L | Secrets hygiene | `app/.gitignore` and the root `.gitignore` did not exclude `.data/` (the PGlite database, which holds customer data). `.vercelignore` did not exclude `.env*`. **Fix:** all three now exclude them. | `app/.gitignore`, `.gitignore`, `app/.vercelignore` | **Fixed** |
| S-13 | L | Input validation | Date fields are checked only against `YYYY-MM-DD`, so `2026-02-30` passes zod and Postgres then rejects it. Since S-06 the user sees a generic message and nothing leaks. Ids have no int4 upper bound (same effect). Bound action arguments (`updateItem(id, …)`, `issueToProject(itemId, …)`, …) are not zod-checked, but Drizzle parameterises them and there is no per-record ownership on those modules, so there is no IDOR. | `projects/_lib/forms.ts:9` and the per-module `dateStr` | Accepted (low). Nice-to-have: add a round-trip `.refine` to the date schemas. |
| S-14 | L | Excel formula injection | Exports use ExcelJS with typed string cells, so `=…` text is stored as a **string** and is not evaluated when the file is opened. It would become a formula only if a user edits the cell, or saves the file as CSV and reopens it. There are no CSV exports. Prefixing `'` would put a visible apostrophe on client-facing BOQ lines (many descriptions start with `-`). | `items/export`, `quotations/[id]/export`, `projects/[id]/export`, `billing/export/*` | Accepted |
| S-15 | L | Cost confidentiality | Engineer and Store cannot see buying prices. However, they **can** see "Suggested sell", which is cost × (1 + markup), so cost can be worked out. The assigned engineer also sees material *value* per issue, so the rate can be worked out as value ÷ qty. This follows the agreed project-visibility rules. | `items/*`, `projects/[id]/page.tsx` | Accepted; client to confirm (open point below) |
| S-16 | L | Business logic (A04) | A below-margin or below-cost quotation is only flagged with a warning. Sales can still send it or mark it won, without the Owner approval that the security guide calls for. | `quotations/[id]/page.tsx:60` | **Open** (product decision, raised with the Manager) |
| S-17 | L | Dependencies | `npm audit --omit=dev`: 1 high (`postcss` ≤ 8.5.22, bundled inside `next`; build-time CSS processing of our own files, not reachable at runtime). 3 moderate: `uuid` < 11.1.1 via `exceljs` (we never pass a `buf` argument), plus the two parent entries. The only fixes are `next@16` and `exceljs@3.4` (a downgrade), both breaking. | `package.json` | Accepted. Re-check when Next 15.5.x ships a patched postcss. |
| S-18 | I | Session | The cookie is `HttpOnly; Secure` (when `NODE_ENV=production`), `SameSite=Lax`, `Path=/`, 12 h. Logout is POST-only (GET → 405, verified). Logout clears the cookie, but a stolen token stays valid until it expires. S-01 means deactivating the user kills it. | `login/route.ts`, `logout/route.ts` | OK |
| S-19 | I | Cron | `/api/cron/agents` uses `timingSafeEqual` on `Bearer ${CRON_SECRET}`, returns 401 when the secret is unset, and is excluded from the middleware. Verified: no header → 401, bad header → 401. | `src/app/api/cron/agents/route.ts:14-20` | OK |
| S-20 | I | XSS | `dangerouslySetInnerHTML` is used only for meeting-note markdown: `marked` then `sanitize-html` with a tag allowlist, http/https/mailto/tel schemes only, links forced to `rel=noopener noreferrer nofollow`, and only disabled checkboxes allowed as inputs. E-mail previews use `<iframe sandbox="" srcDoc>`, which runs no scripts, has no same-origin access and is now also under the CSP. Every HTML e-mail builder escapes the data it interpolates (quotation e-mail, billing reminder and statement, agent templates). There is no `sql.raw` and no SQL built by string concatenation; `sql\`\`` templates are parameterised. | `lib/markdown.ts`, `emails/[id]/page.tsx:64`, `quotations/_lib/email-html.ts`, `lib/billing.ts`, `lib/agents/templates.ts` | OK |
| S-21 | I | E-mail header injection | Recipients are zod `.email()` validated (quotation `to`/`cc`, customer master). Subjects are built on the server. nodemailer encodes header values, so CR/LF cannot inject headers. | `lib/email.ts:38` | OK |
| S-22 | I | Content-Disposition | Export filenames are built from document numbers or slugs, filtered to `[A-Za-z0-9._-]` (quotation, project), a lower-case slug (meeting notes) or fixed text. No header injection is possible. | export routes | OK |

## 4. RBAC matrix as implemented (`src/lib/rbac.ts`)

R = read, W = write (create/update). Record-level rules are listed under the table.

| Module | admin | sales | purchase | accounts | engineer | store |
|---|---|---|---|---|---|---|
| Dashboard | RW | R | R | R | R | R |
| Quotations | RW | RW | R | R | - | - |
| Follow-ups | RW | RW | - | - | - | - |
| BOQ templates | RW | RW | R | - | - | - |
| Sales orders | RW | RW | R | R | R | RW¹ |
| Projects | RW | R | R | R | RW² | - |
| Expenses | RW + approve | RW own³ | RW own³ | RW own + approve³ | RW own³ | RW own³ |
| Purchases | RW | - | RW | RW | - | R |
| Items | RW | R | RW | R | R⁴ | R⁴ |
| Vendors | RW | - | RW | R | - | - |
| Customers | RW | RW | - | RW | R | - |
| Stock | RW | R | R | - | R⁴ | RW |
| Refills | RW | RW | - | R | RW | - |
| Billing (invoices, payments, outstanding) | RW | - | - | RW | - | - |
| Agents / alerts | RW | R⁵ | R⁵ | R⁵ | R⁵ | R⁵ |
| E-mail outbox | RW | - | - | RW | - | - |
| Meeting notes | RW | R | - | - | - | - |
| Settings, users, audit log | RW | - | - | - | - | - |

1. Store has write access only for deliveries and line status. Creating, closing, cancelling and reopening orders is limited to admin and sales (S-05).
2. Engineers edit only projects assigned to them. They cannot re-assign a project or change contract value or budget. Contract value and margin are hidden, and the costing export returns 403 (verified).
3. Non-approvers list and view only their own vouchers; the page redirects to `/forbidden` and the list is filtered by `userId`. They can edit or delete their own vouchers only while pending. Approvers (admin, accounts) cannot approve their own voucher unless they are admin. Admin may delete any voucher that is not yet approved.
4. `canSeeCost` is false for engineer and store: buying prices, history, margins and stock value are hidden on pages and in the item export (verified: the engineer's export has no cost columns). See S-15.
5. Alerts: everyone can act on alerts scoped to their role, assigned to them, or unassigned (`alertScope`). Only admin can run agents or change agent parameters.

**Users:** an admin cannot change their own role or deactivate themselves. The last active admin cannot be demoted or deactivated. Passwords are bcrypt with cost 10, at least 8 characters, and must contain letters and digits.

## 5. Server-action guard table (74 actions, no inline actions)

Every exported function in a `"use server"` file calls its guard on its **first line**; this was checked by script. `requireWrite(m)` checks the signed JWT **and** the live DB user (active, current role) **and** `canWrite(role, m)`.

| File | Actions | Guard | Extra checks inside |
|---|---|---|---|
| agents | runAllAgentsAction, runAgentAction, toggleAgentAction, saveAgentParamsAction | `requireWrite("agents")`, which is admin only | agent key allowlist; params checked by each agent's zod schema |
| alerts | markAlertDoneAction, snoozeAlertAction, reopenAlertAction, bulkDoneAction | `actor()`: signed in + `canRead("agents")` | every update `WHERE alertScope(user)`; `back` limited to `/alerts…` |
| billing | createInvoice, recordPayment, sendReminderNow, cancelInvoice, emailStatement, recordVendorPayment | `requireWrite("billing")` | `safeBack` regex restricted to `/billing…` |
| boq-templates | saveTemplate, duplicateTemplate, deleteTemplate, toggleTemplateActive | `requireWrite("boq")` | |
| customers | createCustomer, updateCustomer | `requireWrite("customers")` | |
| emails | sendQueuedNow, retryEmails | `requireWrite("emails")` | |
| expenses | saveExpense, reviewExpenses, deleteExpense | `requireWrite("expenses")` | must own the voucher to edit (admin exempt); `canApproveExpenses` + not own voucher for review; owner/pending rule for delete |
| follow-ups | logFollowUp | `requireWrite("followups")` | `safeBack` |
| items | createItem, updateItem, updateListPrice | `requireWrite("items")` | |
| meeting-notes | createNote, updateNote, toggleActionItem | `requireWrite("meetings")`, which is admin only | optimistic version check |
| orders | createOrder, updateOrderLine, recordDelivery, changeOrderStatus | `requireWrite("orders")` | `assertCommercial` (admin/sales) on create and status change; line must belong to the order |
| projects | saveProject, setProjectStatus, addProjectNote | `requireWrite("projects")` | `projectAccess().edit` (admin, or the assigned engineer); financial fields only if `canSeeCost` |
| purchases | createPurchase, updatePurchase, postPurchase, cancelPurchase, recordPayment | `requireWrite("purchases")` | |
| quotations | startQuotation, saveQuotation, markSent, markNegotiation, markLost, markWon, reviseQuotation, duplicateQuotation, deleteDraft, refreshPrices, emailQuotation | `requireWrite("quotations")` | cost rate always taken on the server for item lines; free-text cost only if `canSeeCost`; `safeBack` |
| refills | saveAsset, bulkAddAssets, setAssetStatus, recordRefill | `requireWrite("refills")` | `back` limited to `/refills…` |
| settings | saveCompany, savePricing, createUser, changeUserRole, setUserActive, resetPassword | `requireWrite("settings")`, which is admin only | protections for self and for the last admin |
| stock | issueToProject, returnFromProject, adjustStock, allocateStock, releaseAllocation | `requireWrite("stock")` | on-hand and availability checked inside a transaction |
| vendors | createVendor, updateVendor, linkVendorItem, unlinkVendorItem | `requireWrite("vendors")` | |

**Route handlers:**

| Route | Guard |
|---|---|
| `/api/auth/login` | public, throttled, Origin check |
| `/api/auth/logout` | POST only |
| `/api/cron/agents` | Bearer `CRON_SECRET`, compared in constant time |
| `/items/export` | session + `canRead(items)`; cost columns only if `canSeeCost` |
| `/quotations/[id]/export` | session + `canRead(quotations)` (all readers can see cost) |
| `/projects/[id]/export` | session + `canRead(projects)` + `projectAccess().full` |
| `/meeting-notes/[id]/export` | session + `canRead(meetings)` |
| `/billing/export/{receivables,payables}` | `requireUser("billing")` |

The middleware also redirects anonymous users to `/login` for every path except login, forbidden, `api/auth`, `api/cron` and static files. Anonymous export requests return a 307 to `/login` (verified).

**Pages:** all 67 `(app)` pages call `requireUser(<module>)`, and the `(app)` layout calls `requireUser()`.

## 6. Headers and CSP (`next.config.ts`, applied to `/:path*`)

```
default-src 'self'; script-src 'self' 'unsafe-inline' ['unsafe-eval' in next dev only]; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none';
base-uri 'self'; form-action 'self'; object-src 'none'
```

The other headers on every path are:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `poweredByHeader: false`

The app loads nothing from external origins:
- `next/font/google` self-hosts Inter at build time.
- There are no external scripts, images or fetches.
- `wa.me` links are plain navigations.

`script-src 'unsafe-inline'` is needed because App Router injects inline bootstrap scripts and the app does not use nonces. Moving to nonce-based CSP in the middleware is a possible later hardening step.

## 7. Secrets handling

| Secret | Where it lives | Finding |
|---|---|---|
| `AUTH_SECRET` | Vercel env (Production **and** Preview, a different value for each) | Required on both since S-03. |
| `CRON_SECRET` | Vercel env | Endpoint returns 401 when it is unset. |
| `DATABASE_URL` | Vercel env | Not found anywhere in the repo. |
| `SMTP_*` | Vercel env (Production only) | Not set yet. In demo mode the outbox only logs. |
| `SARVAM_API_KEY` | Project-root `.env.local` only, read by `scripts/transcribe_meeting.py` and `work/scripts/transcribe.py` | Grep of the whole tree (node_modules excluded) found the key **only** in the root `.env.local`. It is not in `app/`, not in docs, not in the `.next` build output, and not in git. |
| `VERCEL_OIDC_TOKEN` | `app/.env.local` (created by the Vercel CLI) | This is the only variable in that file. It is short-lived. Git-ignored and now excluded by `.vercelignore`. |

No secret is logged:
- The audit log records IP, e-mail and reason.
- E-mail errors are truncated to 500 characters.

The password reset flash message does not echo the new password.

## 8. Data protection: India DPDP Act 2023

**Personal data stored:**
- Customer and vendor contact persons: name, phone, e-mail, address, GSTIN (GSTIN identifies the business, but for a sole proprietor it can identify a person).
- Staff: user name, e-mail, phone, last login.
- Expense vouchers: payee, amount, description.
- Meeting transcripts.
- Audit-log IP addresses.
- The e-mail outbox: full message bodies and recipient addresses.

**Controls in place:**
- RBAC with need-to-know rules (§4).
- TLS on Vercel and Neon.
- bcrypt passwords.
- An append-only audit log covering logins (success and failure), creates, updates, approvals and e-mails.
- Customer reminder opt-out (`autoReminders`).
- No third-party processors at runtime except Vercel, Neon and Office 365.

**Recommendations:**
1. **Retention:**
   - Keep GST and accounting records for the statutory period (at least 8 years under CGST s.36 and the Companies Act; the auditor should confirm).
   - Purge `email_outbox` bodies older than 12 months.
   - Purge `audit_log` IPs older than 2 years.
   - Delete inactive leads (customers with no quotation, order or invoice) after 3 years, or when they ask.
2. **Erasure requests:** handle them by hand through an admin, with an anonymisation SQL procedure (to be written before go-live). Invoices must not be deleted; anonymise the contact person instead.
3. **Breach procedure:** name a contact at the client and at Sirah Digital. Notify the Data Protection Board and the affected people as the DPDP Rules require. Neon point-in-time restore (PITR) and the audit log support investigation.
4. **Processor agreement:** a clause between the client (Data Fiduciary) and Sirah Digital (processor) covering access, sub-processors (Vercel, Neon, Microsoft) and data location. The deployment region is `bom1`; the Neon region should also be India or Singapore.
5. **Meeting transcripts:** these are recorded and sent to Sarvam AI for transcription. Participants should be told and agree.

This is a practical summary, not legal advice.

## 9. Go-live security checklist

- [ ] **Rotate the Sarvam API key**. It was shared in chat. Put the new key only in the project-root `.env.local` on the team machine.
- [ ] Rotate or replace all demo passwords (`*@lbe.demo` / `Demo@123`). Delete or deactivate the demo users. Create real users with strong temporary passwords and share them out of band.
- [ ] Remove `SHOW_DEMO_LOGINS` from the Vercel env. Confirm `DATABASE_URL` is set: when it is missing, the login page shows the demo credentials.
- [ ] Set `AUTH_SECRET` (32+ random bytes) separately for **Production and Preview**, and `CRON_SECRET` in Production. Redeploy.
- [ ] Set the `SMTP_HOST/PORT/USER/PASS/FROM` env vars (Production only) for a **dedicated** Office 365 mailbox. Enable SMTP AUTH for that mailbox only, and turn on MFA for the human admin accounts.
- [ ] Neon: enable **PITR** at a retention the plan allows; give preview its own branch; use `sslmode=require` in `DATABASE_URL`. Schedule an encrypted weekly `pg_dump` with a monthly restore test.
- [ ] Vercel: restrict team access to named people with 2FA; deploy only from a protected `main` branch; turn on Deployment Protection for previews.
- [ ] Rebuild, then re-verify S-01, S-02, S-04 and S-09:
  - `curl -I /login` shows CSP and XFO;
  - a login with ``next=/%09/evil.com`` lands on `/`;
  - a deactivated user is bounced on the next click;
  - a POST with `Origin: https://evil.example` gets 403.
- [ ] Run the QA RBAC suite for all 6 roles.
- [ ] `npm audit --omit=dev` shows no new high or critical issues (see S-17).
- [ ] Optional: Vercel Firewall rate limit on `POST /api/auth/login` (S-11).
- [ ] Client decisions:
  - an Owner approval gate for below-margin quotes (S-16);
  - whether Sales should see raw purchase rates;
  - whether Engineer/Store may see "Suggested sell" (S-15).

## 10. Files changed in this review

- `app/src/lib/auth.ts`: DB-backed session revalidation (S-01)
- `app/src/lib/session.ts`: fail closed on preview (S-03)
- `app/src/lib/errors.ts` (**new**): the `publicError()` helper (S-06)
- `app/src/app/api/auth/login/route.ts`: `safeNext`, Origin check, map pruning, failed-login audit (S-02, S-08, S-09, S-10)
- `app/next.config.ts`: CSP and X-Frame-Options (S-04)
- `app/src/app/(app)/orders/actions.ts`: `assertCommercial` (S-05)
- `app/src/app/(app)/{agents,alerts,boq-templates,customers,follow-ups,items,purchases,quotations,stock,vendors}/actions.ts`: use `publicError` (S-06)
- `app/src/app/(app)/quotations/actions.ts:328`, `app/src/lib/billing.ts:400`: length clamps (S-07)
- `app/src/app/(app)/settings/actions.ts`: the role-change message now says "applies immediately" (follows from S-01)
- `app/.gitignore`, `.gitignore`, `app/.vercelignore`: exclude `.data/` and `.env*` (S-12)
