# User Guide — Sales / Estimation

For: staff who prepare BOQs and quotations and follow up with customers (system role **sales**).

What changes for you: you **no longer call suppliers for every price**. When you pick an item, the system fills the latest purchase rate (from the last supplier invoice), applies the markup, and shows the last price you quoted/sold to that customer.

## 1. Daily workflow

### Morning (10 min)
1. Log in. Check the pop-up of **undelivered PO lines** for your customers.
2. Dashboard → **Follow-ups due today** — call/visit/e-mail each one and log it (step 4).
3. **Refills due** — extinguisher customers due in the next 10 days; call them and create a refill quotation.

### Making a quotation from a BOQ template
1. Quotations → **New from BOQ template**.
2. Choose customer (create if new: company, contact, phone, e-mail, GSTIN, billing/site address).
3. Choose system: **Hydrant**, **Sprinkler**, **Fire Alarm (FAS)**, **PA / Voice Evacuation**, or **Extinguishers**. You can add more than one system to the same quotation.
4. Enter quantities only on the lines you need, e.g.:
   - Pipe MS 80 NB — 120 (metre)
   - Single Hydrant Valve — 6 (nos)
   - Hose reel drum — 6, RRL Hose with SS — 6, Branch pipe (nozzle) — 6
   - Pendant Sprinkler — 140
   Leave everything else at **0** — zero lines are left out automatically.
5. Click **Create quotation**. Check the message, e.g. "18 lines with quantity, 42 excluded".
6. Review each line: Supply rate (auto = latest purchase rate + markup), Erection rate (from item master). The side panel shows the purchase rate, its date and vendor, and the last rate quoted/sold to this customer.
   - **Amber "stale" badge** = price is old (pipes > 7 days). Ask purchase to confirm.
   - **Red margin warning** = below minimum margin — needs owner approval.
7. Add Remarks, validity (default 30 days), terms. Save.
8. **Export Excel** (your usual format: BOQ Ref | Description | Qty | UOM | Supply Rate/Amount | Erection Rate/Amount | Remarks) or **Print/PDF**. Send to the customer.
9. Click **Mark as Sent** and set the **next follow-up date**.

If the customer/consultant sends their own BOQ, choose the closest template, enter their quantities, and edit BOQ Refs/descriptions to match theirs.

### Logging a follow-up (1 min each)
Quotation → **Add follow-up**: date (today), mode (call / visit / e-mail / WhatsApp), person spoken to, what they said, **next follow-up date**.

### When the customer gives the order
1. Quotation → **Mark as Won** → enter customer **PO number and date**. A **Sales Order** is created with the same lines.
2. Check expected delivery dates on each line.
3. If quantities changed in the PO, edit the sales order lines.

### When you lose
**Mark as Lost** with a reason (price / competitor / project dropped / other). This helps the owner see why.

### Revising a quote
**Revise** creates `LBE/Q/2026-27/0012-R1`; the original stays for reference.

## 2. What the automation agents will remind you about

| Agent | Reminder |
|---|---|
| Follow-up | Follow-up due today; no follow-up logged for 7 days; quotation sent without next follow-up date |
| Quote Expiry | Quotation validity ending in 5 days; expired quotations |
| Refill Due | Customer extinguishers due for refill in 10 days (internal only — the customer is not notified) |
| Pending Delivery | Your customers' PO lines overdue or arriving |
| Stale Price | Lines in your quotations using old prices |
| Margin Guard | Your quotation lines below minimum margin |
| Data Hygiene | Won quotations without a sales order after 3 days |

## 3. What you MUST enter so the system works

| Entry | When | If you skip it… |
|---|---|---|
| Customer with e-mail and GSTIN | Before first quotation | Invoices and payment reminders can't go out |
| Quotation status **Sent** + next follow-up date | The day you send it | Follow-up agent can't remind you; owner sees it as pending |
| Every follow-up | Same day as the call/visit | Quote looks abandoned on the owner's dashboard |
| **Won** with PO no./date (creates sales order) | Same day the PO arrives | Store can't see what to dispatch; delivery tracking fails |
| **Lost** with reason | When you know | Pipeline stays inflated |
| Refill record (type, kg, make, qty, last refill date, 1 yr / 3 yr) | When you sell or refill extinguishers | No refill reminder next year |

Rule of thumb: **if it happened today, it is entered today.**
