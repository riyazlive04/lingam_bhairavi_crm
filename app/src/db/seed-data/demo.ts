/**
 * Hand-written demo master data for the seed. All companies, people, phone numbers and GSTINs are
 * FICTIONAL (GSTINs are well-formed but not real; 33 = Tamil Nadu, 29 = Karnataka). E-mails use example.com.
 */

export interface DemoCustomer {
  name: string; contactPerson: string; phone: string; email: string; gstin: string; address: string;
  city: string; state: string; type: "customer" | "consultant" | "builder"; paymentTermsDays: number; creditLimit: number; notes?: string;
}

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  { name: "Sri Murugan Auto Components Pvt Ltd", contactPerson: "R. Saravanan (Maintenance Head)", phone: "+91 9443012345", email: "saravanan@srimuruganauto.example.com", gstin: "33AAGCS4821K1Z3", address: "Plot 42, SIPCOT Industrial Complex Phase I, Hosur", city: "Hosur", state: "Tamil Nadu", type: "customer", paymentTermsDays: 30, creditLimit: 1500000, notes: "Tier-2 auto supplier. Annual extinguisher refill contract." },
  { name: "Hosur Precision Castings Pvt Ltd", contactPerson: "K. Venkatesh (Plant Manager)", phone: "+91 9842156789", email: "venkatesh@hosurcastings.example.com", gstin: "33AABCH7314M1Z8", address: "B-17, SIPCOT Phase II, Mornapalli, Hosur", city: "Hosur", state: "Tamil Nadu", type: "customer", paymentTermsDays: 30, creditLimit: 2000000 },
  { name: "Krishnagiri Agro Foods Pvt Ltd", contactPerson: "S. Meenakshi (Admin Manager)", phone: "+91 9787034512", email: "admin@kgiriagro.example.com", gstin: "33AAFCK2290P1Z1", address: "NH 44, Kundarapalli Village, Krishnagiri", city: "Krishnagiri", state: "Tamil Nadu", type: "customer", paymentTermsDays: 30, creditLimit: 800000 },
  { name: "Annapoorna Textiles Pvt Ltd", contactPerson: "P. Gopinath (Director)", phone: "+91 9600478213", email: "gopinath@annapoornatex.example.com", gstin: "33AACCA5567R1Z6", address: "Survey No. 211, Shoolagiri Industrial Area, Shoolagiri", city: "Shoolagiri", state: "Tamil Nadu", type: "customer", paymentTermsDays: 30, creditLimit: 500000 },
  { name: "Bengaluru Logistics Park LLP", contactPerson: "Naveen Gowda (Projects)", phone: "+91 9845067321", email: "naveen.g@blrlogipark.example.com", gstin: "29AAQFB6612L1Z2", address: "Survey 88, Attibele-Sarjapur Road, Attibele, Bengaluru Urban", city: "Attibele", state: "Karnataka", type: "customer", paymentTermsDays: 30, creditLimit: 2500000 },
  { name: "Sunrise Tech Parks Pvt Ltd", contactPerson: "Deepa Raghunath (Facility Head)", phone: "+91 9886523410", email: "deepa.r@sunrisetechparks.example.com", gstin: "29AAICS8834H1Z9", address: "Phase II, Electronic City, Hosur Road, Bengaluru", city: "Bengaluru", state: "Karnataka", type: "customer", paymentTermsDays: 15, creditLimit: 3000000 },
  { name: "Velan Multispeciality Hospital", contactPerson: "Dr. A. Kumaresan (Administrator)", phone: "+91 9944781230", email: "admin@velanhospital.example.com", gstin: "33AAJFV3378N1Z4", address: "Denkanikottai Road, Hosur", city: "Hosur", state: "Tamil Nadu", type: "customer", paymentTermsDays: 30, creditLimit: 600000, notes: "Fire NOC renewal every year. Keep extinguisher records ready." },
  { name: "Green Valley Apartments Owners Association", contactPerson: "M. Rajasekar (Secretary)", phone: "+91 9790345678", email: "secretary@greenvalleyhosur.example.com", gstin: "33AAAAG4410D1ZQ", address: "Bagalur Road, Hosur", city: "Hosur", state: "Tamil Nadu", type: "customer", paymentTermsDays: 30, creditLimit: 200000 },
  { name: "Shree Ganesh Polymers", contactPerson: "Hitesh Jain (Partner)", phone: "+91 9363012987", email: "hitesh@sgpolymers.example.com", gstin: "33AAPFS9021C1Z7", address: "Kelamangalam Road, Zuzuvadi, Hosur", city: "Hosur", state: "Tamil Nadu", type: "customer", paymentTermsDays: 30, creditLimit: 400000 },
  { name: "Kaveri MEP Consultants", contactPerson: "Er. Prakash Iyer", phone: "+91 9880412365", email: "prakash@kaverimep.example.com", gstin: "29AAKFK1156E1Z5", address: "HSR Layout Sector 2, Bengaluru", city: "Bengaluru", state: "Karnataka", type: "consultant", paymentTermsDays: 30, creditLimit: 0, notes: "Consultant who specifies BOQs for multiple industrial clients." },
  { name: "Skyline Builders & Developers", contactPerson: "Mohan Reddy (Project Director)", phone: "+91 9900156742", email: "mohan@skylinebuilders.example.com", gstin: "29AAECS7745F1Z0", address: "Bommasandra Industrial Area, Bengaluru", city: "Bengaluru", state: "Karnataka", type: "builder", paymentTermsDays: 45, creditLimit: 1500000 },
  { name: "Tamil Nadu Bearings Ltd", contactPerson: "V. Ilango (Safety Officer)", phone: "+91 9443987650", email: "ilango@tnbearings.example.com", gstin: "33AACCT6603B1Z2", address: "Mathigiri Industrial Estate, Hosur", city: "Hosur", state: "Tamil Nadu", type: "customer", paymentTermsDays: 45, creditLimit: 2500000 },
];

export interface DemoVendor {
  key: string; name: string; contactPerson: string; phone: string; email: string; gstin: string; address: string;
  city: string; systems: string[]; paymentTermsDays: number; leadTimeDays: number; priceFactor: number; invoicePrefix: string; notes?: string;
}

export const DEMO_VENDORS: DemoVendor[] = [
  { key: "pipes1", name: "Sri Balaji Steel & Pipes", contactPerson: "Balaji N", phone: "+91 9443211876", email: "sales@sribalajisteel.example.com", gstin: "33AAKFS3012G1Z9", address: "Bagalur Road, Hosur", city: "Hosur", systems: ["hydrant_sprinkler", "general"], paymentTermsDays: 30, leadTimeDays: 2, priceFactor: 0.99, invoicePrefix: "SBS", notes: "Tata / Jindal GI & MS pipes. Prices change daily, so call before ordering." },
  { key: "pipes2", name: "Bharath Tubes & Fittings", contactPerson: "Suresh Shetty", phone: "+91 9845190023", email: "orders@bharathtubes.example.com", gstin: "29AABFB4471K1Z3", address: "Peenya Industrial Area, Bengaluru", city: "Bengaluru", systems: ["hydrant_sprinkler"], paymentTermsDays: 45, leadTimeDays: 4, priceFactor: 1.02, invoicePrefix: "BTF" },
  { key: "valves1", name: "Kaveri Valves & Controls", contactPerson: "Ramesh Babu", phone: "+91 9842012876", email: "sales@kaverivalves.example.com", gstin: "33AAHFK8823L1Z1", address: "SIDCO Industrial Estate, Kurichi, Coimbatore", city: "Coimbatore", systems: ["hydrant_sprinkler"], paymentTermsDays: 30, leadTimeDays: 5, priceFactor: 0.98, invoicePrefix: "KVC" },
  { key: "hydrant1", name: "Annai Fire Engineering Supplies", contactPerson: "Anand Raj", phone: "+91 9884123456", email: "anand@annaifire.example.com", gstin: "33AAMFA2219Q1Z6", address: "Ambattur Industrial Estate, Chennai", city: "Chennai", systems: ["hydrant_sprinkler", "extinguisher_new", "spares"], paymentTermsDays: 30, leadTimeDays: 3, priceFactor: 1.01, invoicePrefix: "AFE" },
  { key: "fa1", name: "Sentinel Safety Distributors (Ravel authorised dealer)", contactPerson: "Kiran Kumar", phone: "+91 9886012347", email: "kiran@sentinelsafety.example.com", gstin: "29AAFCS5530J1Z8", address: "Wilson Garden, Bengaluru", city: "Bengaluru", systems: ["fire_alarm", "pa_system"], paymentTermsDays: 30, leadTimeDays: 3, priceFactor: 0.98, invoicePrefix: "SSD" },
  { key: "fa2", name: "Prime Fire & Security Solutions", contactPerson: "Vijay Anand", phone: "+91 9841567230", email: "vijay@primefiresec.example.com", gstin: "33AAGCP7712E1Z4", address: "Guindy Industrial Estate, Chennai", city: "Chennai", systems: ["fire_alarm", "pa_system"], paymentTermsDays: 45, leadTimeDays: 7, priceFactor: 1.03, invoicePrefix: "PFS", notes: "Honeywell / Morley / System Sensor & Ravel stockist." },
  { key: "cable1", name: "Polywire Cables & Electricals", contactPerson: "Senthil Nathan", phone: "+91 9787456120", email: "senthil@polywire.example.com", gstin: "33AAIFP6634B1Z2", address: "Rayakottai Road, Hosur", city: "Hosur", systems: ["fire_alarm", "general"], paymentTermsDays: 15, leadTimeDays: 1, priceFactor: 1.0, invoicePrefix: "PCE" },
  { key: "ext1", name: "Ganesh Fire Safety Agencies (Safex dealer)", contactPerson: "Ganesh M", phone: "+91 9750123498", email: "ganesh@ganeshfiresafety.example.com", gstin: "33AAQPG4410F1Z5", address: "Old Bus Stand Road, Krishnagiri", city: "Krishnagiri", systems: ["extinguisher_new", "extinguisher_refill", "spares"], paymentTermsDays: 30, leadTimeDays: 2, priceFactor: 0.99, invoicePrefix: "GFS" },
  { key: "ext2", name: "Thirumala Fire Protection Equipments (Chakraa dealer)", contactPerson: "Thirumala Rao", phone: "+91 9945123076", email: "sales@thirumalafire.example.com", gstin: "29AAHFT2287M1Z7", address: "Bommanahalli, Hosur Road, Bengaluru", city: "Bengaluru", systems: ["extinguisher_new", "spares"], paymentTermsDays: 30, leadTimeDays: 4, priceFactor: 1.02, invoicePrefix: "TFP" },
  { key: "pumps1", name: "Kongu Pumps & Motors", contactPerson: "Palanisamy K", phone: "+91 9443765109", email: "sales@kongupumps.example.com", gstin: "33AABFK9902H1Z0", address: "Avinashi Road, Coimbatore", city: "Coimbatore", systems: ["hydrant_sprinkler", "general"], paymentTermsDays: 45, leadTimeDays: 14, priceFactor: 1.0, invoicePrefix: "KPM", notes: "Fire pump sets (Kirloskar / CRI), jockey pumps, starter panels." },
];

export const COMPANY_SETTINGS = {
  name: "Linga Bhairavi Enterprise",
  tagline: "Fire Protection Systems: Extinguishers · Hydrant · Sprinkler · Fire Alarm · PA",
  address: "Hosur, Krishnagiri District, Tamil Nadu",
  gstin: "33XXXXXXXXXX1Z5",
  phone: "+91 90000 00000",
  email: "info@lingabhairavi.example.com",
  website: "",
  bank: {
    accountName: "Linga Bhairavi Enterprise",
    bankName: "<Bank name (client to provide)>",
    accountNo: "<Account number>",
    ifsc: "<IFSC>",
    branch: "Hosur",
  },
  quoteTerms: [
    "1. Validity: This quotation is valid for 30 days from the date of issue.",
    "2. Taxes: GST @ 18% extra as applicable at the time of invoicing.",
    "3. Payment: 50% advance along with PO, 40% against material delivery, 10% after testing & commissioning.",
    "4. Delivery: 2 to 3 weeks from the date of receipt of PO and advance, subject to material availability.",
    "5. Warranty: 12 months from the date of commissioning against manufacturing defects (consumables excluded).",
    "6. Civil works, scaffolding beyond 6 m, water & power at site to be provided by the client unless stated.",
    "7. Any additional work beyond the BOQ will be charged extra on mutually agreed rates.",
  ].join("\n"),
};

export const PRICING_SETTINGS = { defaultMarkupPct: 40, minMarginPct: 15, gstPct: 18, quoteValidityDays: 30 };

export const AGENT_RULES: { agent: string; params: Record<string, number> }[] = [
  { agent: "followup", params: { overdueDays: 0, noFollowUpDays: 3 } },
  { agent: "pending_delivery", params: { graceDays: 0, upcomingDays: 3 } },
  { agent: "refill_due", params: { leadDays: 10 } },
  { agent: "receivables", params: { firstReminderDaysOverdue: 1, repeatEveryDays: 7, maxReminders: 6 } },
  { agent: "payables", params: { leadDays: 5 } },
  { agent: "stale_price", params: { volatileDays: 7, normalDays: 90 } },
  { agent: "margin_guard", params: { minMarginPct: 15 } },
  { agent: "data_hygiene", params: { quoteNoFollowUpDays: 3, wonNoOrderDays: 2, deliveredNotInvoicedDays: 3, expensePendingDays: 3 } },
  { agent: "low_stock", params: {} },
  { agent: "quote_expiry", params: { warnDays: 3 } },
  { agent: "project_budget", params: { warnPct: 80, criticalPct: 100 } },
];

export const KICKOFF_NOTE = {
  title: "Kickoff: Requirements Discovery",
  meetingDate: "2026-11-20",
  attendees: "Karthick (LBE), Partner (LBE), Riyas (Sirah Digital), Sirah Digital consultant",
  summary: [
    "## Summary",
    "",
    "Linga Bhairavi Enterprise (Hosur) is a turnkey fire-protection contractor (extinguishers, hydrant, sprinkler, fire alarm, PA / voice evacuation and spares) planning to take a fire-alarm distributorship. Key pain points and asks:",
    "",
    "- **Standard BOQ from the item master**: quotations built from per-system BOQ templates; only lines with a quantity are printed and nothing is skipped.",
    "- **Latest price auto-picked** from supplier purchase invoices, with full **price history** per item and vendor (pipe prices change daily).",
    "- **Quotation follow-up tracker** with next follow-up dates, status pipeline and **conversion** reporting.",
    "- **Pending delivery pop-up** for customer PO lines; today \"1 of 10 line items\" sometimes gets missed.",
    "- **Purchase invoices linked to the item & vendor masters** so procurement cost flows into quotes automatically.",
    "- **Extinguisher refill reminders 10 days before expiry**: internal reminder only, not sent to customers.",
    "- **Vendor master**: same item bought from 3 to 4 suppliers; brand-specific pricing.",
    "- **Sales price history kept separate from purchase** price history (selling is typically 40 to 50% above buying).",
    "- **Project cost centre**: materials, petrol, lodging, labour; one trip's expense can be **split across projects**.",
    "- **Customer & vendor outstanding** with automatic reminder e-mails through **Office 365**.",
    "- **Future distributorship**: stock, reservations / allocations for dealers.",
    "- Must be **budget-friendly**; previous in-house CRM failed because staff did not enter data, so keep data entry minimal.",
  ].join("\n"),
  decisions: [
    "- Sirah Digital will build a working demo CRM around the client's own price list and sample BOQs.",
    "- Purchase invoice entry is the single source of truth for latest cost; sales rates are derived with a markup (default 40%).",
    "- Refill reminders are internal (staff dashboard / e-mail to LBE), not customer-facing, for now.",
    "- Accounts stay in Tally/Vyapar; the CRM tracks outstanding and reminders only.",
  ].join("\n"),
  actionItems: [
    { text: "Send the 4 sample BOQs / quotations and the billing (invoice) format", owner: "Client (Karthick)", done: true },
    { text: "Share company website link", owner: "Client (Karthick)", done: false },
    { text: "Share Office 365 e-mail account details for automated reminders", owner: "Client (Karthick)", done: false },
    { text: "Confirm requirements with Jagan sir", owner: "Client (Karthick)", done: false },
    { text: "Draft the requirement document (data each role must enter, agents, reports)", owner: "Sirah Digital", done: false },
    { text: "Build the demo CRM with seeded price list, BOQ templates and sample data", owner: "Sirah Digital", done: false },
    { text: "Review requirement doc and demo with Jagan sir / client for sign-off", owner: "Sirah Digital", done: false },
  ],
  openQuestions: [
    "- Exact billing / tax-invoice format and numbering series (does LBE want CRM invoices or Tally only?).",
    "- Which fire-alarm brand for the distributorship, and do dealers need their own logins?",
    "- Should customer payment reminder e-mails go automatically or after staff approval?",
    "- Default markup per system (40% vs 50%) and minimum acceptable margin.",
    "- Who enters purchase invoices (purchase team vs accounts) and how fast after receipt?",
    "- \"NPC\" in the transcript: confirm it means NBC (National Building Code).",
  ].join("\n"),
};
