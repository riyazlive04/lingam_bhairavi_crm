# User Guide — Store / Dispatch

For: staff who dispatch material to customers and sites, and (later) manage stock (system role **store**).

The problem this solves: when a customer PO has 10 lines, 9 get delivered and one is out of stock or in transit — and it gets **forgotten under the pressure of other orders** (kickoff meeting [15:50–16:15]). The system now keeps every undelivered line in front of you until it is delivered.

## 1. Daily workflow

### At login
A **pop-up lists all undelivered PO lines**: customer, PO no., item (e.g. *Pipe MS 65 NB*, *2 way FBI valve*), pending quantity, expected date, days overdue. Overdue lines are on top. Click a line to open the order, or "Dismiss for now" (it comes back next login until delivered).

### Dispatching material
1. Deliveries → **New delivery** (or open the Sales Order → **Record delivery**).
2. Select the sales order. All pending lines are listed with the pending quantity pre-filled.
3. Adjust the quantity actually sent for each line (can be less — partial delivery).
4. Enter date, DC no. (auto: `LBE/DC/2026-27/0001`), vehicle/transporter.
5. **Save**. Print the delivery challan if needed.

Line statuses update automatically: **Pending → Partial → Delivered**.

### Item not available / coming later
On the sales order line, click **Mark in transit / deliver later** and set the **expected date** (and a note, e.g. "Supplier dispatch on Monday"). The system will remind you on that date.

### When everything is delivered
The order moves to **Ready to invoice** for accounts — you don't need to tell anyone.

### Stock (later — after distributorship)
When the company starts holding stock (e.g. fire-alarm panels), you will record goods received, issues to projects, and see **allocations** (how many of 100 panels are reserved for which order). This will be switched on in Phase 2.

## 2. What the automation agents will remind you about

| Agent | Reminder |
|---|---|
| Pending Delivery | Lines past expected date (critical after 7 days); in-transit lines arriving today/tomorrow; orders that are 90 % delivered but the last items are still pending after 3 days |
| Low Stock (Phase 2) | Stock items below reorder level or not enough for allocated orders |

## 3. What you MUST enter so the system works

| Entry | When | If you skip it… |
|---|---|---|
| **Every delivery** with actual quantities per line | When the vehicle leaves | The pop-up keeps showing delivered items, or worse — shows nothing pending when something is |
| In-transit / expected date for items not yet available | As soon as you know | No reminder; the item is forgotten |
| Partial quantities exactly | At dispatch | Invoice quantities will be wrong |

Rule: **nothing leaves the store without a delivery entry.**
