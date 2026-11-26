# Business Consultant Guide

Your role: understand Linga Bhairavi Enterprise's business, capture and maintain the requirements, design processes so that staff actually enter data, and drive adoption.

## 1. Domain primer (what you need to know to talk to this client)

| Term | What it means in this business |
|---|---|
| Turnkey fire-protection project | Supply, installation (erection), testing and commissioning of a complete system for a factory or building, to meet fire authority and National Building Code requirements |
| Hydrant system | Pumps (electric main, diesel standby, jockey), GI/MS pipes, hydrant valves (single or double), hose reels, hose boxes, RRL hoses, branch pipes, fire brigade inlet (2-way or 4-way FBI), and valves (butterfly, gate, NRV, foot valve, Y-strainer) |
| Sprinkler system | Pipes, pendant, upright and sidewall sprinklers, rosette plates, installation control valve, flow switches |
| FAS | Fire Alarm System: a conventional or addressable panel, detectors (heat, smoke, multi, beam, gas), manual call point (MCP), hooter, isolator and control modules, FRLS or fire-survival cables |
| PA / Voice Evacuation | Zone-wise voice evacuation system, amplifiers, horn and ceiling speakers |
| Extinguishers | ABC (2 to 50 kg), CO2 (2 to 50 kg), clean agent and foam. Makes include Chakraa and Safex. Also refilling and spares |
| NB | Nominal Bore: the pipe or valve size in mm (300, 250, 200, 150, 100, 80, 65, 50, 40, 32, 25) |
| BOQ | Bill of Quantities: a list of lines with BOQ Ref, description, qty, UOM, supply rate and erection rate |
| Supply / Erection | Two separate rates on each line: one for the material supplied, one for installation labour |
| UL | The UL-listed version of a product (priced separately) |
| PO / SO / DC | Customer purchase order / our sales order / delivery challan |

## 2. Business process map (how it will work)

```
Enquiry / consultant BOQ
   → Quotation from BOQ template (latest purchase rate + markup; erection rate)
   → Follow-ups → Won / Lost
   → Sales order (customer PO lines) → Purchase from vendors (purchase invoices → price history)
   → Deliveries per line (pending / in-transit / partial / delivered; login pop-up)
   → Project costing (materials, purchases, expenses) → Sales invoice → Payment
   → Outstanding & reminders → (Extinguishers) Refill tracker → next refill quotation
```

**Added in version 2 (after the client follow-up on 2026-11-26):**

```
Consultant BOQ Excel → Import BOQ (automatic item matching) → quotation
Quotation below minimum margin (or all, per setting) → owner approval → sent
Customer PO lines → vendor purchase orders → received through purchase invoices
Advance from customer → receipt → applied to invoices
Customer return → GST credit note → adjusted against invoices;  return to vendor → debit note
Net outstanding = invoices − credit notes − advances
Installed site → AMC contract → scheduled visits (checklist per system) → renewal;  breakdown → service call (response deadline)
Monthly P&L; order, project, customer and item profit (buy vs sell); project history timeline
```

On the client's sample consultant BOQ, the import matched 95 of 150 lines automatically and left 55 to check, with 0 unmatched. Use that figure when you explain the feature: it saves typing, but someone still checks the flagged lines.

## 3. Your responsibilities

1. **Meetings.** Prepare questions, attend, and write the notes following [meetings/README.md](../meetings/README.md) within 1 working day.
2. **Requirements.** Maintain [REQUIREMENTS.md](../REQUIREMENTS.md): the REQ table, user stories, business rules and change log. Every REQ must trace to a meeting timestamp or a client document, or be marked `Sirah` (our proposal, which counts as an assumption).
3. **Clarifications.** You own the open questions list (currently Q-01 to Q-19 in the kickoff notes). The most urgent ones: pipe UOM, purchase vs selling price list, markup, how erection rates are worked out, GST, the link with Tally, and approvals.
4. **Data-entry design.** For each module, decide *who* enters *what*, and *when*, with no more than 6 mandatory fields. Keep the "What you MUST enter" sections in [user-guides/](../user-guides/) up to date.
5. **Master data readiness.** Work with the client to complete the price list (fire-alarm and extinguisher prices are blank, and many hydrant items are too), the customer list, the vendor list and the company header details.
6. **UAT and training.** Write business scenarios with the tester, and run training for each role using the user guides.
7. **Adoption review.** After go-live, go through the Data Hygiene "pending entries by person" list with the owner every week.
8. **Change requests.** Since version 2, new asks are handled by written change request (see the [Manager guide](manager.md)). Record each one in the REQUIREMENTS.md change log. The version 2 asks from the 2026-11-26 follow-up are REQ-045 onward.
9. **Next meeting.** The owner's spouse has asked for a clarification meeting on **Friday 2026-11-28**. Prepare a short walk-through of the version 2 screens (approval, BOQ import, returns, advances, AMC, reports) and the open questions, and write the notes in `docs/meetings/` afterwards.

## 4. How to write requirements

- One requirement is one testable statement. Bad: "Price should be updated". Good: "When a purchase invoice line is saved, the item's latest purchase rate becomes that line's rate (REQ-005/006)".
- Use the client's own words (BOQ, NB, supply/erection, refill) and real examples from their files (for example "Pipe GI 200 NB ₹3,750").
- Mark every assumption. Never present an assumption as something the client said.
- MoSCoW: Must means the system can't fix the stated pain without it. Should means important, but a workaround exists. Could means nice to have. Won't means we have deliberately deferred it.
- When the transcript translation is unclear, quote the timestamp and confirm with the client (for example, "NPC" probably means NBC).

## 5. Checklist: avoiding the last CRM's failure

- [ ] Every report the owner wants is traced back to the entry that feeds it, and to the role that makes that entry.
- [ ] Each role has fewer than 5 recurring entry tasks a day.
- [ ] Entries happen when the event happens (on site on the phone, at the desk when an invoice arrives), not in batches later.
- [ ] The system gives something back straight away (automatic prices, reminders, the pop-up), so entering data feels worth it.
- [ ] The owner's dashboard shows pending entries for each person, and the owner asks about them in a weekly review.
- [ ] No double entry with Tally: agree which side is the master for invoices and outstanding (Q-11).

## 6. Documents you own

| Document | Location |
|---|---|
| Meeting notes (one per meeting) | `docs/meetings/YYYY-MM-DD-topic.md` |
| BRD | `docs/REQUIREMENTS.md` |
| Agent catalogue (business side) | `docs/AUTOMATION_AGENTS.md` |
| End-user guides | `docs/user-guides/*.md` |
| UAT business scenarios (with the tester) | `docs/guides/tester.md` |
