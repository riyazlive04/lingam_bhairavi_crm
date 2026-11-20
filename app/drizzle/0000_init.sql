CREATE TABLE "agent_rules" (
	"agent" varchar(40) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent" varchar(40) NOT NULL,
	"trigger" varchar(10) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" varchar(10) DEFAULT 'ok' NOT NULL,
	"alerts_created" integer DEFAULT 0 NOT NULL,
	"alerts_resolved" integer DEFAULT 0 NOT NULL,
	"emails_queued" integer DEFAULT 0 NOT NULL,
	"minutes_saved" double precision DEFAULT 0 NOT NULL,
	"summary" text
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent" varchar(40) NOT NULL,
	"severity" varchar(10) DEFAULT 'warning' NOT NULL,
	"title" varchar(200) NOT NULL,
	"message" text,
	"entity_type" varchar(40),
	"entity_id" integer,
	"link" varchar(200),
	"assigned_role" varchar(20),
	"assigned_user_id" integer,
	"status" varchar(10) DEFAULT 'open' NOT NULL,
	"due_date" date,
	"snoozed_until" date,
	"dedupe_key" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" varchar(40) NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" integer,
	"details" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boq_template_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"sort_order" integer NOT NULL,
	"boq_ref" varchar(20),
	"section" varchar(120),
	"item_id" integer,
	"description" text NOT NULL,
	"uom" varchar(20) DEFAULT 'Nos' NOT NULL,
	"default_qty" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boq_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"system" varchar(30) NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"contact_person" varchar(120),
	"phone" varchar(30),
	"email" varchar(160),
	"gstin" varchar(20),
	"address" text,
	"city" varchar(80),
	"state" varchar(60) DEFAULT 'Tamil Nadu',
	"type" varchar(20) DEFAULT 'customer' NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"credit_limit" double precision DEFAULT 0 NOT NULL,
	"auto_reminders" boolean DEFAULT true NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" varchar(40) NOT NULL,
	"order_id" integer NOT NULL,
	"date" date NOT NULL,
	"vehicle_no" varchar(30),
	"received_by" varchar(120),
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"delivery_id" integer NOT NULL,
	"order_line_id" integer NOT NULL,
	"qty" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"to" varchar(200) NOT NULL,
	"cc" varchar(200),
	"subject" varchar(250) NOT NULL,
	"body" text NOT NULL,
	"status" varchar(10) DEFAULT 'queued' NOT NULL,
	"agent" varchar(40),
	"entity_type" varchar(40),
	"entity_id" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "expense_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"expense_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"amount" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"voucher_no" varchar(40) NOT NULL,
	"date" date NOT NULL,
	"category" varchar(30) NOT NULL,
	"amount" double precision NOT NULL,
	"description" text,
	"paid_to" varchar(120),
	"bill_ref" varchar(80),
	"user_id" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"approved_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extinguisher_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"location" varchar(200),
	"ext_type" varchar(60) NOT NULL,
	"make" varchar(60),
	"serial_no" varchar(60),
	"qty" integer DEFAULT 1 NOT NULL,
	"install_date" date,
	"last_refill_date" date,
	"refill_interval_months" integer DEFAULT 12 NOT NULL,
	"next_due_date" date NOT NULL,
	"hpt_due_date" date,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_id" integer NOT NULL,
	"date" date NOT NULL,
	"mode" varchar(20) NOT NULL,
	"notes" text,
	"outcome" varchar(20),
	"next_date" date,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(200) NOT NULL,
	"system" varchar(30) NOT NULL,
	"group_name" varchar(120) NOT NULL,
	"size" varchar(40),
	"make" varchar(80),
	"uom" varchar(20) DEFAULT 'Nos' NOT NULL,
	"hsn" varchar(20),
	"gst_rate" double precision DEFAULT 18 NOT NULL,
	"description" text,
	"last_purchase_rate" double precision,
	"last_purchase_date" date,
	"last_purchase_vendor_id" integer,
	"last_sale_rate" double precision,
	"last_sale_date" date,
	"list_price" double precision,
	"markup_pct" double precision DEFAULT 40 NOT NULL,
	"erection_rate" double precision DEFAULT 0 NOT NULL,
	"reorder_level" double precision DEFAULT 0 NOT NULL,
	"volatile_price" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_note_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"change_summary" text,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"meeting_date" date NOT NULL,
	"attendees" text,
	"summary" text,
	"decisions" text,
	"action_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_questions" text,
	"transcript" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"direction" varchar(4) NOT NULL,
	"customer_id" integer,
	"vendor_id" integer,
	"sales_invoice_id" integer,
	"purchase_invoice_id" integer,
	"amount" double precision NOT NULL,
	"date" date NOT NULL,
	"mode" varchar(20) NOT NULL,
	"reference" varchar(80),
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"kind" varchar(12) NOT NULL,
	"rate" double precision NOT NULL,
	"date" date NOT NULL,
	"vendor_id" integer,
	"customer_id" integer,
	"ref_type" varchar(30),
	"ref_id" integer,
	"qty" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"customer_id" integer NOT NULL,
	"quotation_id" integer,
	"status" varchar(20) DEFAULT 'planning' NOT NULL,
	"site_address" text,
	"engineer_id" integer,
	"start_date" date,
	"end_date" date,
	"contract_value" double precision DEFAULT 0 NOT NULL,
	"budget" double precision DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_invoice_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"description" text,
	"qty" double precision NOT NULL,
	"rate" double precision NOT NULL,
	"gst_rate" double precision DEFAULT 18 NOT NULL,
	"amount" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"invoice_no" varchar(60) NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date,
	"project_id" integer,
	"subtotal" double precision DEFAULT 0 NOT NULL,
	"tax_amount" double precision DEFAULT 0 NOT NULL,
	"total" double precision DEFAULT 0 NOT NULL,
	"paid_amount" double precision DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_id" integer NOT NULL,
	"sort_order" integer NOT NULL,
	"boq_ref" varchar(20),
	"section" varchar(120),
	"item_id" integer,
	"description" text NOT NULL,
	"qty" double precision NOT NULL,
	"uom" varchar(20) DEFAULT 'Nos' NOT NULL,
	"cost_rate" double precision DEFAULT 0 NOT NULL,
	"supply_rate" double precision DEFAULT 0 NOT NULL,
	"erection_rate" double precision DEFAULT 0 NOT NULL,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" varchar(40) NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"customer_id" integer NOT NULL,
	"project_name" varchar(200),
	"site_location" varchar(200),
	"system" varchar(30),
	"template_id" integer,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"quote_date" date NOT NULL,
	"valid_until" date,
	"prepared_by" integer,
	"markup_pct" double precision DEFAULT 40 NOT NULL,
	"discount_pct" double precision DEFAULT 0 NOT NULL,
	"gst_pct" double precision DEFAULT 18 NOT NULL,
	"subtotal_supply" double precision DEFAULT 0 NOT NULL,
	"subtotal_erection" double precision DEFAULT 0 NOT NULL,
	"cost_total" double precision DEFAULT 0 NOT NULL,
	"tax_amount" double precision DEFAULT 0 NOT NULL,
	"grand_total" double precision DEFAULT 0 NOT NULL,
	"terms" text,
	"notes" text,
	"next_follow_up_date" date,
	"lost_reason" text,
	"sent_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refill_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"date" date NOT NULL,
	"kind" varchar(20) DEFAULT 'refill' NOT NULL,
	"sales_invoice_id" integer,
	"amount" double precision,
	"notes" text,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_invoice_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"order_line_id" integer,
	"item_id" integer,
	"description" text NOT NULL,
	"qty" double precision NOT NULL,
	"rate" double precision NOT NULL,
	"gst_rate" double precision DEFAULT 18 NOT NULL,
	"amount" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" varchar(40) NOT NULL,
	"customer_id" integer NOT NULL,
	"order_id" integer,
	"project_id" integer,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"subtotal" double precision DEFAULT 0 NOT NULL,
	"tax_amount" double precision DEFAULT 0 NOT NULL,
	"total" double precision DEFAULT 0 NOT NULL,
	"paid_amount" double precision DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'issued' NOT NULL,
	"last_reminder_at" timestamp with time zone,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_order_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"sort_order" integer NOT NULL,
	"item_id" integer,
	"description" text NOT NULL,
	"qty" double precision NOT NULL,
	"delivered_qty" double precision DEFAULT 0 NOT NULL,
	"invoiced_qty" double precision DEFAULT 0 NOT NULL,
	"uom" varchar(20) DEFAULT 'Nos' NOT NULL,
	"rate" double precision DEFAULT 0 NOT NULL,
	"delivery_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"expected_date" date,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" varchar(40) NOT NULL,
	"customer_id" integer NOT NULL,
	"customer_po_number" varchar(80),
	"customer_po_date" date,
	"quotation_id" integer,
	"project_id" integer,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"order_date" date NOT NULL,
	"expected_delivery" date,
	"total" double precision DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"key" varchar(60) PRIMARY KEY NOT NULL,
	"value" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"qty" double precision NOT NULL,
	"customer_id" integer,
	"order_id" integer,
	"project_id" integer,
	"status" varchar(20) DEFAULT 'reserved' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"qty" double precision NOT NULL,
	"type" varchar(20) NOT NULL,
	"rate" double precision DEFAULT 0 NOT NULL,
	"project_id" integer,
	"ref_type" varchar(30),
	"ref_id" integer,
	"date" date NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(160) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(20) NOT NULL,
	"phone" varchar(20),
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"last_rate" double precision,
	"last_date" date,
	"lead_time_days" integer
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"contact_person" varchar(120),
	"phone" varchar(30),
	"email" varchar(160),
	"gstin" varchar(20),
	"address" text,
	"city" varchar(80),
	"systems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_dedupe_uq" ON "alerts" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "alerts_status_idx" ON "alerts" USING btree ("status","assigned_role");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ext_due_idx" ON "extinguisher_assets" USING btree ("next_due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "items_code_uq" ON "items" USING btree ("code");--> statement-breakpoint
CREATE INDEX "items_system_idx" ON "items" USING btree ("system","group_name");--> statement-breakpoint
CREATE INDEX "ph_item_idx" ON "price_history" USING btree ("item_id","kind","date");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_code_uq" ON "projects" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "pi_vendor_no_uq" ON "purchase_invoices" USING btree ("vendor_id","invoice_no");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_number_uq" ON "quotations" USING btree ("number");--> statement-breakpoint
CREATE INDEX "quotations_status_idx" ON "quotations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "si_number_uq" ON "sales_invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "so_number_uq" ON "sales_orders" USING btree ("number");--> statement-breakpoint
CREATE INDEX "sm_item_idx" ON "stock_movements" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "vi_uq" ON "vendor_items" USING btree ("vendor_id","item_id");