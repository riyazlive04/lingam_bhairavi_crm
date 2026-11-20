# Project Manager Guide

Role: own delivery of the Linga Bhairavi Enterprise CRM — scope, schedule, budget, communication with the client, and the meeting → requirements → build → UAT loop.

Key documents: [REQUIREMENTS.md](../REQUIREMENTS.md) · [meetings/](../meetings/README.md) · [AUTOMATION_AGENTS.md](../AUTOMATION_AGENTS.md) · [ARCHITECTURE.md](../ARCHITECTURE.md) (architect) · [tester.md](tester.md)

## 1. Engagement facts to keep in mind

- **Budget-conscious client** (11-20 [27:55–28:20]) — protect scope; prefer configuration over custom code; free/low tiers for hosting.
- **Previous CRM failed from non-use** (PP-10). Adoption is a delivery deliverable, not an afterthought: training, role-specific user guides, Data Hygiene agent, owner dashboard.
- **Sign-off needs Jagan sir** (D-09). Never mark a scope item "Confirmed" on Karthick's word alone if it affects price or process.
- Client communicates through **WhatsApp**; file every document received into the project folder and note it in the meeting file.

## 2. Delivery plan and milestones

| # | Milestone | Content | Exit criteria | Target (indicative) |
|---|---|---|---|---|
| M0 | Kickoff & BRD | Kickoff meeting, notes, BRD v1.0, guides | Docs published to client | 2026-11-21 ✅ |
| M1 | Demo build | Masters (items, price, vendors, customers), BOQ templates, quotations + Excel export, follow-ups, dashboard; PGlite demo data from the client's price list | Demo-able end-to-end quote | +1 week |
| M2 | Client review meeting 2 | Demo; close Q-01…Q-19; collect 4 sample BOQs + billing format | REQ priorities confirmed; BRD v1.1 | +1.5 weeks |
| M3 | Order-to-cash | Sales orders, deliveries & login pop-up, purchase invoices with price history, sales invoices, payments, outstanding | Tests pass for these modules | +3 weeks |
| M4 | Projects & agents | Projects, expenses (mobile), split; all agents; Office 365 e-mail; refill tracker | Agents verified with fixed test data | +4 weeks |
| M5 | UAT | Client team uses the system on real data for 1–2 weeks | UAT checklist signed, zero open Sev-1/Sev-2 | +5–6 weeks |
| M6 | Go-live | Production on Vercel + Neon, data import, training per role | Users trained; backup verified | +6 weeks |
| M7 | Hypercare | 30 days support; weekly adoption review (Data Hygiene counts per person) | Pending entries trending down | +10 weeks |
| Phase 2 | Distributorship | Stock, allocations, low stock, dealer pricing | Separate estimate | When client is ready |

## 3. RACI

R = Responsible, A = Accountable, C = Consulted, I = Informed.

| Activity | Manager | Business Consultant | Architect | UI/UX | Frontend | Backend | Fullstack | Tester | Security | DevOps | Client (Karthick) | Jagan sir |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Meeting notes & BRD | A | R | C | I | I | I | I | C | I | I | C | I |
| Requirement sign-off | R | C | I | I | I | I | I | I | I | I | R | A |
| Architecture & data model | A | C | R | I | C | C | C | I | C | C | I | I |
| UI design | A | C | C | R | C | I | C | I | I | I | C | I |
| Build modules | A | C | C | C | R | R | R | I | C | I | I | I |
| Automation agents | A | C | C | I | I | R | R | C | I | C | I | I |
| Test & UAT plan | A | C | I | I | I | I | I | R | C | I | C | I |
| UAT execution | A | C | I | I | I | I | I | R | I | I | R | C |
| Security review | A | I | C | I | C | C | C | C | R | C | I | I |
| Deployment & backups | A | I | C | I | I | C | C | I | C | R | I | I |
| Training & user guides | A | R | I | C | I | I | I | C | I | I | C | I |
| Change requests | R | R | C | I | I | I | I | I | I | I | C | A |

## 4. Change control

Any new or changed requirement after BRD v1.0:

1. **Log** it as a change request (CR) — in the meeting file or the CRM Meeting Notes module: what, why, who asked, timestamp/source.
2. **Assess** (BC + Architect, ≤ 2 working days): affected REQ IDs, modules, effort (hours), cost, schedule impact, risk.
3. **Classify**:
   - *Minor* (≤ 4 h, no schedule impact, e.g. a new column in Excel export) — Manager approves.
   - *Major* (> 4 h, or changes pricing logic, numbering, roles or phase scope) — client approval incl. Jagan sir, in writing (e-mail or WhatsApp message saved to the project).
4. **Record** in [REQUIREMENTS.md §9 change log](../REQUIREMENTS.md#9-requirements-change-log) and update the REQ row (status, priority).
5. **Schedule** into the backlog; tester adds/updates test cases.

Budget guardrail: keep a visible "parking lot" of Could/Won't items so the client sees what was deferred, not refused.

## 5. Running the meeting → requirements loop

**Before the meeting (T-2 days)**
- Send agenda (from the previous notes' *Next meeting agenda*), BRD changes, demo link.
- List open action items and questions with owners.

**During**
- Record (with consent); note who attended.
- Demo against the REQ IDs; ask open questions in priority order; confirm each decision aloud ("So we agree markup default is 40 %?").
- Agree action items with owner and date before closing.

**After (T+1 day)**
1. Transcribe: `python -I scripts/transcribe_meeting.py "<video.mp4>" "<topic>"` (see [meetings/README.md](../meetings/README.md)).
2. BC writes `docs/meetings/YYYY-MM-DD-topic.md`, updates REQUIREMENTS.md and earlier action items.
3. Manager runs change control for anything new; updates the plan.
4. Send the client a short WhatsApp/e-mail summary: decisions, their action items, next date.

## 6. Status reporting

Weekly (Friday) one-page update to the client: milestone status (RAG), done this week, next week, decisions needed, client actions pending (currently A-01 to A-07 — sample BOQs, billing format, website, Office 365 details, Jagan sir confirmation, price-list completion, company details).

## 7. Key risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Staff don't enter data (repeat of past failure) | High | High | Minimal mandatory fields, mobile entry, Data Hygiene agent, owner dashboard per person, training per role, owner sponsorship |
| Price list incomplete (fire alarm & extinguishers blank) | High | Medium | Action A-06; Stale/No-price alerts; purchase invoices fill prices over time |
| Pricing rules unclear (UOM, markup, erection) | Medium | High | Close Q-01…Q-04 at meeting 2 before building pricing |
| Scope creep vs budget | Medium | High | Change control; Phase 2 parking lot |
| Office 365 SMTP AUTH disabled in client tenant | Medium | Medium | Ask early (A-04); fallback to manual "copy reminder" button |
| Approver (Jagan sir) unavailable | Medium | Medium | Book sign-off slots in advance |
