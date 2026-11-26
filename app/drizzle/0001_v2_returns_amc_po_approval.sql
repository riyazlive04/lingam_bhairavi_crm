CREATE TABLE "amc_contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" varchar(40) NOT NULL,
	"customer_id" integer NOT NULL,
	"project_id" integer,
	"site_address" text,
	"systems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"value" double precision DEFAULT 0 NOT NULL,
	"billing_frequency" varchar(20) DEFAULT 'yearly' NOT NULL,
	"visits_per_year" integer DEFAULT 4 NOT NULL,
	"coverage" varchar(20) DEFAULT 'non_comprehensive' NOT NULL,
	"response_hours" integer DEFAULT 24 NOT NULL,
	"engineer_id" integer,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"renewal_of" integer,
	"next_billing_date" date,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amc_visits" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"scheduled_date" date NOT NULL,
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"done_date" date,
	"engineer_id" integer,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"findings" text,
	"recommendations" text,
	"customer_signoff" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" integer NOT NULL,
	"sales_invoice_id" integer NOT NULL,
	"amount" double precision NOT NULL,
	"date" date NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"item_id" integer NOT NULL,
	"description" text,
	"qty" double precision NOT NULL,
	"received_qty" double precision DEFAULT 0 NOT NULL,
	"rate" double precision NOT NULL,
	"gst_rate" double precision DEFAULT 18 NOT NULL,
	"amount" double precision NOT NULL,
	"sales_order_line_id" integer
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" varchar(40) NOT NULL,
	"vendor_id" integer NOT NULL,
	"sales_order_id" integer,
	"project_id" integer,
	"po_date" date NOT NULL,
	"expected_date" date,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"subtotal" double precision DEFAULT 0 NOT NULL,
	"tax_amount" double precision DEFAULT 0 NOT NULL,
	"total" double precision DEFAULT 0 NOT NULL,
	"terms" text,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_return_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"return_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"purchase_invoice_line_id" integer,
	"qty" double precision NOT NULL,
	"rate" double precision NOT NULL,
	"gst_rate" double precision DEFAULT 18 NOT NULL,
	"amount" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" varchar(40) NOT NULL,
	"vendor_id" integer NOT NULL,
	"purchase_invoice_id" integer,
	"date" date NOT NULL,
	"reason" text,
	"subtotal" double precision DEFAULT 0 NOT NULL,
	"tax_amount" double precision DEFAULT 0 NOT NULL,
	"total" double precision DEFAULT 0 NOT NULL,
	"adjusted_amount" double precision DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_return_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"return_id" integer NOT NULL,
	"order_line_id" integer,
	"item_id" integer,
	"description" text NOT NULL,
	"qty" double precision NOT NULL,
	"rate" double precision NOT NULL,
	"gst_rate" double precision DEFAULT 18 NOT NULL,
	"amount" double precision NOT NULL,
	"restock" boolean DEFAULT true NOT NULL,
	"cost_rate" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" varchar(40) NOT NULL,
	"customer_id" integer NOT NULL,
	"order_id" integer,
	"sales_invoice_id" integer,
	"project_id" integer,
	"date" date NOT NULL,
	"reason" varchar(20) DEFAULT 'other' NOT NULL,
	"notes" text,
	"subtotal" double precision DEFAULT 0 NOT NULL,
	"tax_amount" double precision DEFAULT 0 NOT NULL,
	"total" double precision DEFAULT 0 NOT NULL,
	"adjusted_amount" double precision DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" varchar(40) NOT NULL,
	"customer_id" integer NOT NULL,
	"contract_id" integer,
	"project_id" integer,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reported_by" varchar(120),
	"priority" varchar(10) DEFAULT 'normal' NOT NULL,
	"system" varchar(30),
	"description" text NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"engineer_id" integer,
	"due_by" timestamp with time zone,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"chargeable" boolean DEFAULT false NOT NULL,
	"charge_amount" double precision DEFAULT 0 NOT NULL,
	"sales_invoice_id" integer,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_lines" ADD COLUMN "cost_rate" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "is_advance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "order_id" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "project_id" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "allocated_amount" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_invoice_lines" ADD COLUMN "po_line_id" integer;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD COLUMN "purchase_order_id" integer;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "cost_date" date;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "cost_vendor_id" integer;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "cost_source" varchar(10);--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "approval_status" varchar(20) DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "approval_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "approval_requested_by" integer;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "approved_by" integer;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "approval_note" text;--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD COLUMN "returned_qty" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "amc_number_uq" ON "amc_contracts" USING btree ("number");--> statement-breakpoint
CREATE INDEX "amc_end_idx" ON "amc_contracts" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "amc_visit_due_idx" ON "amc_visits" USING btree ("status","scheduled_date");--> statement-breakpoint
CREATE UNIQUE INDEX "po_number_uq" ON "purchase_orders" USING btree ("number");--> statement-breakpoint
CREATE INDEX "po_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "pr_number_uq" ON "purchase_returns" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "sr_number_uq" ON "sales_returns" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "sc_number_uq" ON "service_calls" USING btree ("number");--> statement-breakpoint
CREATE INDEX "sc_status_idx" ON "service_calls" USING btree ("status");