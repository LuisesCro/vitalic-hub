CREATE TABLE "supplier_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"raw_material_id" integer,
	"description" text NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"pack_kg" numeric(14, 3),
	"price_per_kg" numeric(14, 2),
	"price_date" date NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "iva_rate" numeric(5, 4) DEFAULT 0.19 NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "iva_mode" text DEFAULT 'ninguno' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_prices" ADD CONSTRAINT "supplier_prices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_prices" ADD CONSTRAINT "supplier_prices_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_prices_raw_idx" ON "supplier_prices" USING btree ("raw_material_id");