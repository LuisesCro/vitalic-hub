CREATE TABLE "pos_sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"sold_at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_date" date NOT NULL,
	"customer" text,
	"subtotal_net" numeric(14, 2) NOT NULL,
	"tax" numeric(14, 2) NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"payments" text NOT NULL,
	"cash_received" numeric(14, 2),
	"change_given" numeric(14, 2),
	"status" text DEFAULT 'vigente' NOT NULL,
	"void_reason" text,
	"created_by" integer
);
--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pos_sales_date_idx" ON "pos_sales" USING btree ("business_date");