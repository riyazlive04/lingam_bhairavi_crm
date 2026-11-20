# Business Consultant Guide

Role: understand Linga Bhairavi Enterprise's business, capture and maintain requirements, design processes so that data actually gets entered, and drive adoption.

## 1. Domain primer (what you must know to talk to this client)

| Term | Meaning in this business |
|---|---|
| Turnkey fire-protection project | Supply + installation (erection) + testing + commissioning of a complete system for a factory/building to meet fire authority / National Building Code requirements |
| Hydrant system | Pumps (electric main, diesel standby, jockey), GI/MS pipes, hydrant valves (single/double), hose reels, hose boxes, RRL hoses, branch pipes, fire brigade inlet (2-way/4-way FBI), valves (butterfly, gate, NRV, foot valve, Y-strainer) |
| Sprinkler system | Pipes, pendant / upright / sidewall sprinklers, rosette plates, installation control valve, flow switches |
| FAS | Fire Alarm System — conventional or addressable panel, detectors (heat, smoke, multi, beam, gas), manual call point (MCP), hooter, isolator/control modules, FRLS / fire-survival cables |
| PA / Voice Evacuation | Zone-wise voice evacuation system, amplifiers, horn/ceiling speakers |
| Extinguishers | ABC (2–50 kg), CO2 (2–50 kg), clean agent, foam; makes Chakraa, Safex; refilling and spares |
| NB | Nominal Bore — pipe/valve size in mm (300, 250, 200, 150, 100, 80, 65, 50, 40, 32, 25) |
| BOQ | Bill of Quantities — line list with BOQ Ref, description, qty, UOM, supply rate, erection rate |
| Supply / Erection | Two separate rates per line: material supply, and installation labour |
| UL | UL-listed variant of a product (priced separately) |
| PO / SO / DC | Customer purchase order / our sales order / delivery challan |

## 2. Business process map (to-be)

```
Enquiry / consultant BOQ
   → Quotation from BOQ template (latest purchase rate + markup; erection rate)
   → Follow-ups → Won / Lost
   → Sales order (customer PO lines) → Purchase from vendors (purchase invoices → price history)
   → Deliveries per line (pending / in-transit / partial / delivered; login pop-up)
   → Project costing (materials, purchases, expenses) → Sales invoice → Payment
   → Outstanding & reminders → (Extinguishers) Refill tracker → next refill quotation
```

## 3. Your responsibilities

1. **Meetings** — prepare questions, attend, write notes per [meetings/README.md](../meetings/README.md) within 1 working day.
2. **Requirements** — maintain [REQUIREMENTS.md](../REQUIREMENTS.md): REQ table, user stories, business rules, change log. Every REQ must trace to a meeting timestamp, a client document, or be marked `Sirah` (proposal = assumption).
3. **Clarifications** — own the open questions list (currently Q-01 … Q-19 in the kickoff notes). Highest priority: pipe UOM, purchase-vs-selling price list, markup, erection rate method, GST, Tally relationship, approvals.
4. **Data-entry design** — for each module, define *who* must enter *what*, *when*, with ≤ 6 mandatory fields. Keep [user-guides/](../user-guides/) "What you MUST enter" sections current.
5. **Master data readiness** — work with the client to complete the price list (fire-alarm and extinguisher prices are blank; many hydrant items blank), customer list, vendor list, company header details.
6. **UAT & training** — with the tester, write business scenarios; run role-wise training using the user guides.
7. **Adoption review** — after go-live, review the Data Hygiene "pending entries by person" weekly with the owner.

## 4. Requirement writing standards

- One requirement = one testable statement. Bad: "Price should be updated". Good: "When a purchase invoice line is saved, the item's latest purchase rate becomes that line's rate (REQ-005/006)".
- Use the client's own vocabulary (BOQ, NB, supply/erection, refill), and real examples from their files (e.g. "Pipe GI 200 NB ₹3,750").
- Mark every assumption. Never present an assumption as a client statement.
- MoSCoW: Must = system unusable for the stated pain without it; Should = important, workaround exists; Could = nice-to-have; Won't = explicitly deferred.
- When the transcript translation is ambiguous, quote the timestamp and confirm with the client (e.g. "NPC" probably means NBC).

## 5. Preventing the last CRM's failure — checklist

- [ ] Every report the owner wants is traced back to the entry that feeds it and the role who makes it.
- [ ] Each role has fewer than 5 recurring entry tasks per day.
- [ ] Entries happen at the moment of the event (on site on mobile; at the desk when an invoice arrives), not in batches.
- [ ] The system gives something back immediately (auto price, auto reminders, pop-up), so entering data feels useful.
- [ ] Owner dashboard shows pending entries per person — the owner asks about them in a weekly review.
- [ ] No duplicate entry with Tally: agree which side is master for invoices/outstanding (Q-11).

## 6. Deliverables you own

| Document | Location |
|---|---|
| Meeting notes (per meeting) | `docs/meetings/YYYY-MM-DD-topic.md` |
| BRD | `docs/REQUIREMENTS.md` |
| Agent catalogue (business side) | `docs/AUTOMATION_AGENTS.md` |
| End-user guides | `docs/user-guides/*.md` |
| UAT business scenarios (with tester) | `docs/guides/tester.md` |
