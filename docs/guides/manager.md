# Project Manager Guide

Your role: own delivery of the Linga Bhairavi Enterprise CRM. That means scope, schedule, budget, communication with the client, and the loop from meeting to requirements to build to UAT.

Key documents: [REQUIREMENTS.md](../REQUIREMENTS.md) · [meetings/](../meetings/README.md) · [AUTOMATION_AGENTS.md](../AUTOMATION_AGENTS.md) · [ARCHITECTURE.md](../ARCHITECTURE.md) (architect) · [tester.md](tester.md)

## 1. Facts about this engagement to keep in mind

- **The client watches the budget closely** (11-20 [27:55 to 28:20]). Protect the scope, prefer configuration over custom code, and use free or low-cost hosting tiers.
- **Their previous CRM failed because nobody used it** (PP-10). Adoption is part of what we deliver, not an afterthought: training, user guides for each role, the Data Hygiene agent and the owner dashboard.
- **Sign-off needs Jagan sir** (D-09). Never mark a scope item "Confirmed" on Karthick's word alone if it affects price or process.
- The client communicates on **WhatsApp**. Save every document they send into the project folder and note it in the meeting file.

## 2. Delivery plan and milestones

| # | Milestone | Content | Exit criteria | Target (indicative) |
|---|---|---|---|---|
| M0 | Kickoff & BRD | Kickoff meeting, notes, BRD v1.0, guides | Docs shared with the client | 2026-11-21 (done) |
| M1 | Demo build | Masters (items, price, vendors, customers), BOQ templates, quotations with Excel export, follow-ups, dashboard. PGlite demo data from the client's price list | A quote can be demoed from start to finish | +1 week |
| M2 | Client review meeting 2 | Demo. Close Q-01 to Q-19. Collect the 4 sample BOQs and the billing format | REQ priorities confirmed; BRD v1.1 | +1.5 weeks |
| M3 | Order to cash | Sales orders, deliveries and the login pop-up, purchase invoices with price history, sales invoices, payments, outstanding | Tests pass for these modules | +3 weeks |
| M4 | Projects & agents | Projects, expenses (mobile) and splits. All agents. Office 365 e-mail. Refill tracker | Agents checked against fixed test data | +4 weeks |
| M5 | UAT | The client's team uses the system on real data for 1 to 2 weeks | UAT checklist signed, no open Sev-1 or Sev-2 | +5 to 6 weeks |
| M6 | Go-live | Production on Vercel + Neon, data import, training for each role | Users trained, backup verified | +6 weeks |
| M7 | Hypercare | 30 days of support. Weekly adoption review (Data Hygiene counts per person) | Pending entries trending down | +10 weeks |
| Phase 2 | Distributorship | Stock, allocations, low stock, dealer pricing | Estimated separately | When the client is ready |

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

For any new or changed requirement after BRD v1.0:

1. **Log** it as a change request (CR) in the meeting file or the CRM's Meeting Notes module: what, why, who asked, and the timestamp or source.
2. **Assess** it (Business Consultant and Architect, within 2 working days): affected REQ IDs, modules, effort in hours, cost, schedule impact and risk.
3. **Classify** it:
   - *Minor* (up to 4 hours, no schedule impact, for example a new column in the Excel export). The Manager approves.
   - *Major* (over 4 hours, or it changes pricing logic, numbering, roles or phase scope). The client approves in writing, including Jagan sir (an e-mail, or a WhatsApp message saved to the project).
4. **Record** it in the [REQUIREMENTS.md §9 change log](../REQUIREMENTS.md#9-requirements-change-log) and update the REQ row (status, priority).
5. **Schedule** it into the backlog. The tester adds or updates test cases.

Budget guardrail: keep a visible "parking lot" of Could and Won't items, so the client sees what was deferred rather than refused.

## 5. Running the loop from meeting to requirements

**Before the meeting (2 days ahead)**
- Send the agenda (from the *Next meeting agenda* in the previous notes), the BRD changes and the demo link.
- List the open action items and questions, with owners.

**During the meeting**
- Record it (with consent) and note who attended.
- Demo against the REQ IDs. Ask the open questions in priority order, and confirm each decision out loud ("So we agree the default markup is 40 %?").
- Agree action items, each with an owner and a date, before closing.

**After the meeting (within 1 day)**
1. Transcribe: `python -I scripts/transcribe_meeting.py "<video.mp4>" "<topic>"` (see [meetings/README.md](../meetings/README.md)).
2. The Business Consultant writes `docs/meetings/YYYY-MM-DD-topic.md` and updates REQUIREMENTS.md and the earlier action items.
3. The Manager runs change control for anything new and updates the plan.
4. Send the client a short WhatsApp or e-mail summary: decisions, their action items and the next date.

## 6. Status reporting

Every Friday, send the client a one-page update: milestone status (RAG), what was done this week, what's next week, decisions needed, and client actions pending. These are currently A-01 to A-07: sample BOQs, billing format, website, Office 365 details, Jagan sir's confirmation, completing the price list, and company details.

## 7. Key risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Staff don't enter data (a repeat of the past failure) | High | High | Very few mandatory fields, entry from the phone, the Data Hygiene agent, an owner dashboard per person, training for each role, and the owner's backing |
| Price list incomplete (fire alarm and extinguishers blank) | High | Medium | Action A-06. Stale and No-price alerts. Purchase invoices fill in prices over time |
| Pricing rules unclear (UOM, markup, erection) | Medium | High | Close Q-01 to Q-04 at meeting 2, before building pricing |
| Scope creep against budget | Medium | High | Change control and the Phase 2 parking lot |
| Office 365 SMTP AUTH disabled in the client's tenant | Medium | Medium | Ask early (A-04). Fall back to a manual "copy reminder" button |
| Approver (Jagan sir) unavailable | Medium | Medium | Book sign-off slots in advance |
