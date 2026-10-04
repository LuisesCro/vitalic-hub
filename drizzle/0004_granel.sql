CREATE TABLE "bulk_sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"occurred_on" date NOT NULL,
	"family_id" integer NOT NULL,
	"kg" numeric(14, 3) NOT NULL,
	"total_gross" numeric(14, 2) NOT NULL,
	"suggested_gross" numeric(14, 2) NOT NULL,
	"customer" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bulk_sales" ADD CONSTRAINT "bulk_sales_family_id_product_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."product_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_sales" ADD CONSTRAINT "bulk_sales_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;