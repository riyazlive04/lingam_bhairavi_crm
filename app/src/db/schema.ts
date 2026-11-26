/**
 * Linga Bhairavi Enterprise CRM: database schema (Postgres via Drizzle).
 * Maintainer: Sirah Digital.
 * Money is stored as double precision (INR, rounded to 2dp in app code via lib/format.round2).
 */
import {
  pgTable, serial, integer, text, varchar, boolean, doublePrecision, date, timestamp, jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";

const ts = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

// ---------------------------------------------------------------- core
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 160 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  /** admin | sales | purchase | accounts | engineer | store */
  role: varchar("role", { length: 20 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  active: boolean("active").default(true).notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: ts(),
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const settings = pgTable("settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: jsonb("value").notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  action: varchar("action", { length: 40 }).notNull(), // create | update | delete | login | post | email
  entityType: varchar("entity_type", { length: 40 }).notNull(),
  entityId: integer("entity_id"),
  details: jsonb("details"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("audit_entity_idx").on(t.entityType, t.entityId)]);

/** Document number sequences, e.g. key "quotation:2026-27" */
export const sequences = pgTable("sequences", {
  key: varchar("key", { length: 60 }).primaryKey(),
  value: integer("value").notNull(),
});

// ---------------------------------------------------------------- parties
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  contactPerson: varchar("contact_person", { length: 120 }),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 160 }),
  gstin: varchar("gstin", { length: 20 }),
  address: text("address"),
  city: varchar("city", { length: 80 }),
  state: varchar("state", { length: 60 }).default("Tamil Nadu"),
  /** customer | consultant | builder */
  type: varchar("type", { length: 20 }).default("customer").notNull(),
  paymentTermsDays: integer("payment_terms_days").default(30).notNull(),
  creditLimit: doublePrecision("credit_limit").default(0).notNull(),
  autoReminders: boolean("auto_reminders").default(true).notNull(),
  notes: text("notes"),
  active: boolean("active").default(true).notNull(),
  createdAt: ts(),
});

export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  contactPerson: varchar("contact_person", { length: 120 }),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 160 }),
  gstin: varchar("gstin", { length: 20 }),
  address: text("address"),
  city: varchar("city", { length: 80 }),
  /** array of system keys this vendor supplies (see lib/constants SYSTEMS) */
  systems: jsonb("systems").$type<string[]>().default([]).notNull(),
  paymentTermsDays: integer("payment_terms_days").default(30).notNull(),
  notes: text("notes"),
  active: boolean("active").default(true).notNull(),
  createdAt: ts(),
});

// ---------------------------------------------------------------- items & prices
export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 40 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  /** hydrant_sprinkler | fire_alarm | pa_system | extinguisher_new | extinguisher_refill | spares | general */
  system: varchar("system", { length: 30 }).notNull(),
  /** item group, e.g. "Pipe GI", "Butterfly Valve", "Smoke Detector Addressable" */
  groupName: varchar("group_name", { length: 120 }).notNull(),
  size: varchar("size", { length: 40 }),     // e.g. "150NB", "6 Kg", "2C x 1.5 sqmm"
  make: varchar("make", { length: 80 }),     // e.g. "Ravel UL", "Safex"
  uom: varchar("uom", { length: 20 }).default("Nos").notNull(),
  hsn: varchar("hsn", { length: 20 }),
  gstRate: doublePrecision("gst_rate").default(18).notNull(),
  description: text("description"),
  /** latest procured (purchase) rate, maintained automatically from purchase invoices */
  lastPurchaseRate: doublePrecision("last_purchase_rate"),
  lastPurchaseDate: date("last_purchase_date"),
  lastPurchaseVendorId: integer("last_purchase_vendor_id"),
  /** last selling rate (quoted/invoiced), maintained automatically */
  lastSaleRate: doublePrecision("last_sale_rate"),
  lastSaleDate: date("last_sale_date"),
  /** master list price (from the client's price list) used when no purchase history */
  listPrice: doublePrecision("list_price"),
  /** default markup over cost for selling (%) */
  markupPct: doublePrecision("markup_pct").default(40).notNull(),
  /** erection / installation labour rate per unit */
  erectionRate: doublePrecision("erection_rate").default(0).notNull(),
  reorderLevel: doublePrecision("reorder_level").default(0).notNull(),
  /** items whose prices change fast (e.g. pipes); the Stale Price Agent uses a shorter window */
  volatilePrice: boolean("volatile_price").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: ts(),
}, (t) => [uniqueIndex("items_code_uq").on(t.code), index("items_system_idx").on(t.system, t.groupName)]);

/** Every price point ever seen for an item (purchase from vendor, sale to customer, manual list update). */
export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull(),
  /** purchase | sale | quote | list */
  kind: varchar("kind", { length: 12 }).notNull(),
  rate: doublePrecision("rate").notNull(),
  date: date("date").notNull(),
  vendorId: integer("vendor_id"),
  customerId: integer("customer_id"),
  refType: varchar("ref_type", { length: 30 }), // purchase_invoice | sales_invoice | quotation | manual
  refId: integer("ref_id"),
  qty: doublePrecision("qty"),
  createdAt: ts(),
}, (t) => [index("ph_item_idx").on(t.itemId, t.kind, t.date)]);

/** Which vendor supplies which item (auto-upserted from purchase invoices, also manually editable). */
export const vendorItems = pgTable("vendor_items", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull(),
  itemId: integer("item_id").notNull(),
  lastRate: doublePrecision("last_rate"),
  lastDate: date("last_date"),
  leadTimeDays: integer("lead_time_days"),
}, (t) => [uniqueIndex("vi_uq").on(t.vendorId, t.itemId)]);

// ---------------------------------------------------------------- BOQ templates & quotations
export const boqTemplates = pgTable("boq_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  system: varchar("system", { length: 30 }).notNull(),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
  createdAt: ts(),
});

export const boqTemplateLines = pgTable("boq_template_lines", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull(),
  sortOrder: integer("sort_order").notNull(),
  boqRef: varchar("boq_ref", { length: 20 }),
  section: varchar("section", { length: 120 }), // e.g. "A - Pump Room", "B - Hydrant"
  itemId: integer("item_id"),                   // null = free-text line (priced manually)
  description: text("description").notNull(),
  uom: varchar("uom", { length: 20 }).default("Nos").notNull(),
  defaultQty: doublePrecision("default_qty").default(0).notNull(),
});

export const quotations = pgTable("quotations", {
  id: serial("id").primaryKey(),
  number: varchar("number", { length: 40 }).notNull(),
  revision: integer("revision").default(0).notNull(),
  customerId: integer("customer_id").notNull(),
  projectName: varchar("project_name", { length: 200 }),
  siteLocation: varchar("site_location", { length: 200 }),
  system: varchar("system", { length: 30 }), // primary system (may be mixed)
  templateId: integer("template_id"),
  /** draft | sent | negotiation | won | lost | expired */
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  quoteDate: date("quote_date").notNull(),
  validUntil: date("valid_until"),
  preparedBy: integer("prepared_by"),
  markupPct: doublePrecision("markup_pct").default(40).notNull(),
  discountPct: doublePrecision("discount_pct").default(0).notNull(),
  gstPct: doublePrecision("gst_pct").default(18).notNull(),
  subtotalSupply: doublePrecision("subtotal_supply").default(0).notNull(),
  subtotalErection: doublePrecision("subtotal_erection").default(0).notNull(),
  costTotal: doublePrecision("cost_total").default(0).notNull(),
  taxAmount: doublePrecision("tax_amount").default(0).notNull(),
  grandTotal: doublePrecision("grand_total").default(0).notNull(),
  terms: text("terms"),
  notes: text("notes"),
  nextFollowUpDate: date("next_follow_up_date"),
  lostReason: text("lost_reason"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  /** Internal approval before sending: not_required | pending | approved | rejected */
  approvalStatus: varchar("approval_status", { length: 20 }).default("not_required").notNull(),
  approvalRequestedAt: timestamp("approval_requested_at", { withTimezone: true }),
  approvalRequestedBy: integer("approval_requested_by"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvalNote: text("approval_note"),
  createdAt: ts(),
}, (t) => [uniqueIndex("quotations_number_uq").on(t.number), index("quotations_status_idx").on(t.status)]);

export const quotationLines = pgTable("quotation_lines", {
  id: serial("id").primaryKey(),
  quotationId: integer("quotation_id").notNull(),
  sortOrder: integer("sort_order").notNull(),
  boqRef: varchar("boq_ref", { length: 20 }),
  section: varchar("section", { length: 120 }),
  itemId: integer("item_id"),
  description: text("description").notNull(),
  qty: doublePrecision("qty").notNull(),
  uom: varchar("uom", { length: 20 }).default("Nos").notNull(),
  /** snapshot of latest purchase cost at the time of quoting */
  costRate: doublePrecision("cost_rate").default(0).notNull(),
  /** date and supplier of that cost snapshot (from items.lastPurchaseDate / lastPurchaseVendorId) */
  costDate: date("cost_date"),
  costVendorId: integer("cost_vendor_id"),
  /** purchase | list | manual: where the cost came from */
  costSource: varchar("cost_source", { length: 10 }),
  supplyRate: doublePrecision("supply_rate").default(0).notNull(),
  erectionRate: doublePrecision("erection_rate").default(0).notNull(),
  remarks: text("remarks"),
});

export const followUps = pgTable("follow_ups", {
  id: serial("id").primaryKey(),
  quotationId: integer("quotation_id").notNull(),
  date: date("date").notNull(),
  /** call | email | whatsapp | visit | meeting */
  mode: varchar("mode", { length: 20 }).notNull(),
  notes: text("notes"),
  /** positive | neutral | negative | no_response */
  outcome: varchar("outcome", { length: 20 }),
  nextDate: date("next_date"),
  userId: integer("user_id"),
  createdAt: ts(),
});

// ---------------------------------------------------------------- projects
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  customerId: integer("customer_id").notNull(),
  quotationId: integer("quotation_id"),
  /** planning | active | on_hold | completed | closed */
  status: varchar("status", { length: 20 }).default("planning").notNull(),
  siteAddress: text("site_address"),
  engineerId: integer("engineer_id"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  contractValue: doublePrecision("contract_value").default(0).notNull(),
  budget: doublePrecision("budget").default(0).notNull(),
  notes: text("notes"),
  createdAt: ts(),
}, (t) => [uniqueIndex("projects_code_uq").on(t.code)]);

// ---------------------------------------------------------------- sales orders (customer POs) & delivery
export const salesOrders = pgTable("sales_orders", {
  id: serial("id").primaryKey(),
  number: varchar("number", { length: 40 }).notNull(),
  customerId: integer("customer_id").notNull(),
  customerPoNumber: varchar("customer_po_number", { length: 80 }),
  customerPoDate: date("customer_po_date"),
  quotationId: integer("quotation_id"),
  projectId: integer("project_id"),
  /** open | partial | delivered | closed | cancelled */
  status: varchar("status", { length: 20 }).default("open").notNull(),
  orderDate: date("order_date").notNull(),
  expectedDelivery: date("expected_delivery"),
  total: doublePrecision("total").default(0).notNull(),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: ts(),
}, (t) => [uniqueIndex("so_number_uq").on(t.number)]);

export const salesOrderLines = pgTable("sales_order_lines", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  sortOrder: integer("sort_order").notNull(),
  itemId: integer("item_id"),
  description: text("description").notNull(),
  qty: doublePrecision("qty").notNull(),
  deliveredQty: doublePrecision("delivered_qty").default(0).notNull(),
  invoicedQty: doublePrecision("invoiced_qty").default(0).notNull(),
  uom: varchar("uom", { length: 20 }).default("Nos").notNull(),
  rate: doublePrecision("rate").default(0).notNull(),
  /** pending | ordered | in_transit | partial | delivered | cancelled */
  deliveryStatus: varchar("delivery_status", { length: 20 }).default("pending").notNull(),
  expectedDate: date("expected_date"),
  /** qty the customer sent back (sales returns). Net delivered = deliveredQty − returnedQty */
  returnedQty: doublePrecision("returned_qty").default(0).notNull(),
  remarks: text("remarks"),
});

export const deliveries = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  number: varchar("number", { length: 40 }).notNull(),
  orderId: integer("order_id").notNull(),
  date: date("date").notNull(),
  vehicleNo: varchar("vehicle_no", { length: 30 }),
  receivedBy: varchar("received_by", { length: 120 }),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: ts(),
});

export const deliveryLines = pgTable("delivery_lines", {
  id: serial("id").primaryKey(),
  deliveryId: integer("delivery_id").notNull(),
  orderLineId: integer("order_line_id").notNull(),
  qty: doublePrecision("qty").notNull(),
  /** cost of goods per unit at delivery (latest purchase cost then), used for order P&L */
  costRate: doublePrecision("cost_rate").default(0).notNull(),
});

// ---------------------------------------------------------------- purchasing
export const purchaseInvoices = pgTable("purchase_invoices", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull(),
  invoiceNo: varchar("invoice_no", { length: 60 }).notNull(),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date"),
  /** if set, materials go to this project's cost center; else into stock */
  projectId: integer("project_id"),
  /** vendor purchase order this bill was raised against (optional) */
  purchaseOrderId: integer("purchase_order_id"),
  subtotal: doublePrecision("subtotal").default(0).notNull(),
  taxAmount: doublePrecision("tax_amount").default(0).notNull(),
  total: doublePrecision("total").default(0).notNull(),
  paidAmount: doublePrecision("paid_amount").default(0).notNull(),
  /** draft | posted | cancelled  (posting updates price history, vendor items, stock) */
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: ts(),
}, (t) => [uniqueIndex("pi_vendor_no_uq").on(t.vendorId, t.invoiceNo)]);

export const purchaseInvoiceLines = pgTable("purchase_invoice_lines", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull(),
  itemId: integer("item_id").notNull(),
  description: text("description"),
  qty: doublePrecision("qty").notNull(),
  rate: doublePrecision("rate").notNull(),
  gstRate: doublePrecision("gst_rate").default(18).notNull(),
  amount: doublePrecision("amount").notNull(),
  /** vendor PO line received by this bill line (optional) */
  poLineId: integer("po_line_id"),
});

/** Vendor purchase orders, optionally raised against a customer sales order / project. */
export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  number: varchar("number", { length: 40 }).notNull(),
  vendorId: integer("vendor_id").notNull(),
  salesOrderId: integer("sales_order_id"),
  projectId: integer("project_id"),
  poDate: date("po_date").notNull(),
  expectedDate: date("expected_date"),
  /** draft | sent | partial | received | closed | cancelled */
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  subtotal: doublePrecision("subtotal").default(0).notNull(),
  taxAmount: doublePrecision("tax_amount").default(0).notNull(),
  total: doublePrecision("total").default(0).notNull(),
  terms: text("terms"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: ts(),
}, (t) => [uniqueIndex("po_number_uq").on(t.number), index("po_status_idx").on(t.status)]);

export const purchaseOrderLines = pgTable("purchase_order_lines", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  itemId: integer("item_id").notNull(),
  description: text("description"),
  qty: doublePrecision("qty").notNull(),
  receivedQty: doublePrecision("received_qty").default(0).notNull(),
  rate: doublePrecision("rate").notNull(),
  gstRate: doublePrecision("gst_rate").default(18).notNull(),
  amount: doublePrecision("amount").notNull(),
  /** customer PO line this was bought for (optional) */
  salesOrderLineId: integer("sales_order_line_id"),
});

/** Goods sent back to a vendor (debit note). Posting moves stock out and reduces what we owe. */
export const purchaseReturns = pgTable("purchase_returns", {
  id: serial("id").primaryKey(),
  number: varchar("number", { length: 40 }).notNull(),
  vendorId: integer("vendor_id").notNull(),
  purchaseInvoiceId: integer("purchase_invoice_id"),
  date: date("date").notNull(),
  reason: text("reason"),
  subtotal: doublePrecision("subtotal").default(0).notNull(),
  taxAmount: doublePrecision("tax_amount").default(0).notNull(),
  total: doublePrecision("total").default(0).notNull(),
  /** amount of this debit note adjusted against vendor bills */
  adjustedAmount: doublePrecision("adjusted_amount").default(0).notNull(),
  /** draft | posted | cancelled */
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  createdBy: integer("created_by"),
  createdAt: ts(),
}, (t) => [uniqueIndex("pr_number_uq").on(t.number)]);

export const purchaseReturnLines = pgTable("purchase_return_lines", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").notNull(),
  itemId: integer("item_id").notNull(),
  purchaseInvoiceLineId: integer("purchase_invoice_line_id"),
  qty: doublePrecision("qty").notNull(),
  rate: doublePrecision("rate").notNull(),
  gstRate: doublePrecision("gst_rate").default(18).notNull(),
  amount: doublePrecision("amount").notNull(),
});

// ---------------------------------------------------------------- stock
export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull(),
  /** positive = in, negative = out */
  qty: doublePrecision("qty").notNull(),
  /** purchase_in | issue_project | return | sale_out | adjust | opening */
  type: varchar("type", { length: 20 }).notNull(),
  rate: doublePrecision("rate").default(0).notNull(),
  projectId: integer("project_id"),
  refType: varchar("ref_type", { length: 30 }),
  refId: integer("ref_id"),
  date: date("date").notNull(),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: ts(),
}, (t) => [index("sm_item_idx").on(t.itemId)]);

/** Stock reserved for a customer order/project (future distributorship). */
export const stockAllocations = pgTable("stock_allocations", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull(),
  qty: doublePrecision("qty").notNull(),
  customerId: integer("customer_id"),
  orderId: integer("order_id"),
  projectId: integer("project_id"),
  /** reserved | released | consumed */
  status: varchar("status", { length: 20 }).default("reserved").notNull(),
  notes: text("notes"),
  createdAt: ts(),
});

// ---------------------------------------------------------------- expenses & project costing
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  voucherNo: varchar("voucher_no", { length: 40 }).notNull(),
  date: date("date").notNull(),
  /** petrol | travel | lodging | food | labour | transport | material_local | misc */
  category: varchar("category", { length: 30 }).notNull(),
  amount: doublePrecision("amount").notNull(),
  description: text("description"),
  paidTo: varchar("paid_to", { length: 120 }),
  billRef: varchar("bill_ref", { length: 80 }),
  userId: integer("user_id"),
  /** pending | approved | rejected */
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  approvedBy: integer("approved_by"),
  createdAt: ts(),
});

/** An expense may be split across several projects (e.g. one trip covering 2 sites). */
export const expenseAllocations = pgTable("expense_allocations", {
  id: serial("id").primaryKey(),
  expenseId: integer("expense_id").notNull(),
  projectId: integer("project_id").notNull(),
  amount: doublePrecision("amount").notNull(),
});

// ---------------------------------------------------------------- billing
export const salesInvoices = pgTable("sales_invoices", {
  id: serial("id").primaryKey(),
  number: varchar("number", { length: 40 }).notNull(),
  customerId: integer("customer_id").notNull(),
  orderId: integer("order_id"),
  projectId: integer("project_id"),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date").notNull(),
  subtotal: doublePrecision("subtotal").default(0).notNull(),
  taxAmount: doublePrecision("tax_amount").default(0).notNull(),
  total: doublePrecision("total").default(0).notNull(),
  paidAmount: doublePrecision("paid_amount").default(0).notNull(),
  /** draft | issued | partially_paid | paid | cancelled */
  status: varchar("status", { length: 20 }).default("issued").notNull(),
  lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
  reminderCount: integer("reminder_count").default(0).notNull(),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: ts(),
}, (t) => [uniqueIndex("si_number_uq").on(t.number)]);

export const salesInvoiceLines = pgTable("sales_invoice_lines", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull(),
  orderLineId: integer("order_line_id"),
  itemId: integer("item_id"),
  description: text("description").notNull(),
  qty: doublePrecision("qty").notNull(),
  rate: doublePrecision("rate").notNull(),
  gstRate: doublePrecision("gst_rate").default(18).notNull(),
  amount: doublePrecision("amount").notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  /** in = received from customer, out = paid to vendor */
  direction: varchar("direction", { length: 4 }).notNull(),
  customerId: integer("customer_id"),
  vendorId: integer("vendor_id"),
  salesInvoiceId: integer("sales_invoice_id"),
  purchaseInvoiceId: integer("purchase_invoice_id"),
  amount: doublePrecision("amount").notNull(),
  date: date("date").notNull(),
  /** cash | bank | upi | cheque */
  mode: varchar("mode", { length: 20 }).notNull(),
  reference: varchar("reference", { length: 80 }),
  notes: text("notes"),
  /** advance received against a customer PO / project, not yet tied to an invoice */
  isAdvance: boolean("is_advance").default(false).notNull(),
  orderId: integer("order_id"),
  projectId: integer("project_id"),
  /** portion of an advance already applied to invoices (see payment_allocations) */
  allocatedAmount: doublePrecision("allocated_amount").default(0).notNull(),
  createdBy: integer("created_by"),
  createdAt: ts(),
});

/** Applies an advance (payments.isAdvance) to a sales invoice. */
export const paymentAllocations = pgTable("payment_allocations", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").notNull(),
  salesInvoiceId: integer("sales_invoice_id").notNull(),
  amount: doublePrecision("amount").notNull(),
  date: date("date").notNull(),
  createdBy: integer("created_by"),
  createdAt: ts(),
});

/** Customer returns (credit note). Posting brings stock back and reduces what the customer owes. */
export const salesReturns = pgTable("sales_returns", {
  id: serial("id").primaryKey(),
  /** credit note number, e.g. LBE/CN/2026-27/0001 */
  number: varchar("number", { length: 40 }).notNull(),
  customerId: integer("customer_id").notNull(),
  orderId: integer("order_id"),
  salesInvoiceId: integer("sales_invoice_id"),
  projectId: integer("project_id"),
  date: date("date").notNull(),
  /** damaged | excess | wrong_item | quality | other */
  reason: varchar("reason", { length: 20 }).default("other").notNull(),
  notes: text("notes"),
  subtotal: doublePrecision("subtotal").default(0).notNull(),
  taxAmount: doublePrecision("tax_amount").default(0).notNull(),
  total: doublePrecision("total").default(0).notNull(),
  /** amount of this credit note adjusted against invoices */
  adjustedAmount: doublePrecision("adjusted_amount").default(0).notNull(),
  /** draft | posted | cancelled */
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  createdBy: integer("created_by"),
  createdAt: ts(),
}, (t) => [uniqueIndex("sr_number_uq").on(t.number)]);

export const salesReturnLines = pgTable("sales_return_lines", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").notNull(),
  orderLineId: integer("order_line_id"),
  itemId: integer("item_id"),
  description: text("description").notNull(),
  qty: doublePrecision("qty").notNull(),
  rate: doublePrecision("rate").notNull(),
  gstRate: doublePrecision("gst_rate").default(18).notNull(),
  amount: doublePrecision("amount").notNull(),
  /** true = goes back into sellable stock; false = scrap / send back to vendor */
  restock: boolean("restock").default(true).notNull(),
  /** cost per unit reversed out of cost of goods */
  costRate: doublePrecision("cost_rate").default(0).notNull(),
});

// ---------------------------------------------------------------- AMC & service
/** Annual maintenance contracts for installed systems (hydrant, sprinkler, alarm, PA, extinguishers). */
export const amcContracts = pgTable("amc_contracts", {
  id: serial("id").primaryKey(),
  number: varchar("number", { length: 40 }).notNull(),
  customerId: integer("customer_id").notNull(),
  projectId: integer("project_id"),
  siteAddress: text("site_address"),
  /** array of system keys covered (see SYSTEMS) */
  systems: jsonb("systems").$type<string[]>().default([]).notNull(),
  scope: text("scope"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  /** contract value excl. GST */
  value: doublePrecision("value").default(0).notNull(),
  /** monthly | quarterly | half_yearly | yearly | one_time */
  billingFrequency: varchar("billing_frequency", { length: 20 }).default("yearly").notNull(),
  /** preventive maintenance visits per year */
  visitsPerYear: integer("visits_per_year").default(4).notNull(),
  /** comprehensive (parts included) | non_comprehensive */
  coverage: varchar("coverage", { length: 20 }).default("non_comprehensive").notNull(),
  /** response time promised for breakdown calls, in hours */
  responseHours: integer("response_hours").default(24).notNull(),
  engineerId: integer("engineer_id"),
  /** draft | active | expired | renewed | cancelled */
  status: varchar("status", { length: 20 }).default("active").notNull(),
  renewalOf: integer("renewal_of"),
  nextBillingDate: date("next_billing_date"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: ts(),
}, (t) => [uniqueIndex("amc_number_uq").on(t.number), index("amc_end_idx").on(t.endDate)]);

export const amcVisits = pgTable("amc_visits", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull(),
  scheduledDate: date("scheduled_date").notNull(),
  /** scheduled | done | missed | cancelled */
  status: varchar("status", { length: 20 }).default("scheduled").notNull(),
  doneDate: date("done_date"),
  engineerId: integer("engineer_id"),
  /** checklist results: [{ item, ok, remark }] */
  checklist: jsonb("checklist").$type<{ item: string; ok: boolean; remark?: string }[]>().default([]).notNull(),
  findings: text("findings"),
  recommendations: text("recommendations"),
  customerSignoff: varchar("customer_signoff", { length: 120 }),
  createdAt: ts(),
}, (t) => [index("amc_visit_due_idx").on(t.status, t.scheduledDate)]);

/** Breakdown / service calls (AMC or chargeable). */
export const serviceCalls = pgTable("service_calls", {
  id: serial("id").primaryKey(),
  number: varchar("number", { length: 40 }).notNull(),
  customerId: integer("customer_id").notNull(),
  contractId: integer("contract_id"),
  projectId: integer("project_id"),
  raisedAt: timestamp("raised_at", { withTimezone: true }).defaultNow().notNull(),
  reportedBy: varchar("reported_by", { length: 120 }),
  /** low | normal | high | critical */
  priority: varchar("priority", { length: 10 }).default("normal").notNull(),
  system: varchar("system", { length: 30 }),
  description: text("description").notNull(),
  /** open | assigned | in_progress | resolved | closed */
  status: varchar("status", { length: 20 }).default("open").notNull(),
  engineerId: integer("engineer_id"),
  dueBy: timestamp("due_by", { withTimezone: true }),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  chargeable: boolean("chargeable").default(false).notNull(),
  chargeAmount: doublePrecision("charge_amount").default(0).notNull(),
  salesInvoiceId: integer("sales_invoice_id"),
  createdBy: integer("created_by"),
  createdAt: ts(),
}, (t) => [uniqueIndex("sc_number_uq").on(t.number), index("sc_status_idx").on(t.status)]);

// ---------------------------------------------------------------- extinguisher refill tracker
export const extinguisherAssets = pgTable("extinguisher_assets", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  location: varchar("location", { length: 200 }), // site / block / floor
  /** e.g. "ABC 6 Kg", "CO2 4.5 Kg", "Clean Agent 2 Kg", "Foam 9 L" */
  extType: varchar("ext_type", { length: 60 }).notNull(),
  make: varchar("make", { length: 60 }),
  serialNo: varchar("serial_no", { length: 60 }),
  qty: integer("qty").default(1).notNull(),
  installDate: date("install_date"),
  lastRefillDate: date("last_refill_date"),
  refillIntervalMonths: integer("refill_interval_months").default(12).notNull(),
  nextDueDate: date("next_due_date").notNull(),
  hptDueDate: date("hpt_due_date"), // hydraulic pressure test
  /** active | retired */
  status: varchar("status", { length: 20 }).default("active").notNull(),
  notes: text("notes"),
  createdAt: ts(),
}, (t) => [index("ext_due_idx").on(t.nextDueDate)]);

export const refillServices = pgTable("refill_services", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  date: date("date").notNull(),
  /** refill | service | hpt | replacement */
  kind: varchar("kind", { length: 20 }).default("refill").notNull(),
  salesInvoiceId: integer("sales_invoice_id"),
  amount: doublePrecision("amount"),
  notes: text("notes"),
  userId: integer("user_id"),
  createdAt: ts(),
});

// ---------------------------------------------------------------- automation agents
export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  /** agent key, see lib/agents */
  agent: varchar("agent", { length: 40 }).notNull(),
  /** info | warning | critical */
  severity: varchar("severity", { length: 10 }).default("warning").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message"),
  entityType: varchar("entity_type", { length: 40 }),
  entityId: integer("entity_id"),
  link: varchar("link", { length: 200 }),
  assignedRole: varchar("assigned_role", { length: 20 }),
  assignedUserId: integer("assigned_user_id"),
  /** open | snoozed | done */
  status: varchar("status", { length: 10 }).default("open").notNull(),
  dueDate: date("due_date"),
  snoozedUntil: date("snoozed_until"),
  /** prevents duplicate alerts for same condition */
  dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),
  createdAt: ts(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [uniqueIndex("alerts_dedupe_uq").on(t.dedupeKey), index("alerts_status_idx").on(t.status, t.assignedRole)]);

export const emailOutbox = pgTable("email_outbox", {
  id: serial("id").primaryKey(),
  to: varchar("to", { length: 200 }).notNull(),
  cc: varchar("cc", { length: 200 }),
  subject: varchar("subject", { length: 250 }).notNull(),
  body: text("body").notNull(), // HTML
  /** queued | sent | failed | logged (SMTP not configured, demo) */
  status: varchar("status", { length: 10 }).default("queued").notNull(),
  agent: varchar("agent", { length: 40 }),
  entityType: varchar("entity_type", { length: 40 }),
  entityId: integer("entity_id"),
  error: text("error"),
  createdAt: ts(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const agentRules = pgTable("agent_rules", {
  agent: varchar("agent", { length: 40 }).primaryKey(),
  enabled: boolean("enabled").default(true).notNull(),
  params: jsonb("params").$type<Record<string, number | string | boolean>>().default({}).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentRuns = pgTable("agent_runs", {
  id: serial("id").primaryKey(),
  agent: varchar("agent", { length: 40 }).notNull(),
  /** cron | manual */
  trigger: varchar("trigger", { length: 10 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  /** ok | error */
  status: varchar("status", { length: 10 }).default("ok").notNull(),
  alertsCreated: integer("alerts_created").default(0).notNull(),
  alertsResolved: integer("alerts_resolved").default(0).notNull(),
  emailsQueued: integer("emails_queued").default(0).notNull(),
  minutesSaved: doublePrecision("minutes_saved").default(0).notNull(),
  summary: text("summary"),
});

// ---------------------------------------------------------------- meeting notes (living, versioned)
export const meetingNotes = pgTable("meeting_notes", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  meetingDate: date("meeting_date").notNull(),
  attendees: text("attendees"),
  summary: text("summary"),          // markdown
  decisions: text("decisions"),      // markdown
  actionItems: jsonb("action_items").$type<{ text: string; owner: string; due?: string; done: boolean }[]>().default([]).notNull(),
  openQuestions: text("open_questions"), // markdown
  transcript: text("transcript"),    // markdown
  version: integer("version").default(1).notNull(),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: ts(),
});

export const meetingNoteRevisions = pgTable("meeting_note_revisions", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id").notNull(),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  changeSummary: text("change_summary"),
  updatedBy: integer("updated_by"),
  createdAt: ts(),
});
