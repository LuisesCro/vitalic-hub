CREATE TABLE "competitor_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"competitor_id" integer NOT NULL,
	"product_id" integer,
	"raw_name" text NOT NULL,
	"grams" numeric(14, 3),
	"price_gross" numeric(14, 2) NOT NULL,
	"captured_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "competitors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"month" date NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "packaging_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"occurred_on" date NOT NULL,
	"product_id" integer NOT NULL,
	"bags" integer NOT NULL,
	"grams_used" numeric(14, 3) NOT NULL,
	"waste_grams" numeric(14, 3) DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"grams" numeric(14, 3),
	"raw_material_id" integer,
	"price_net" numeric(14, 2) DEFAULT 0 NOT NULL,
	"iva_rate" numeric(5, 4) DEFAULT 0 NOT NULL,
	"vendty_cost" numeric(14, 2),
	"packaging_cost" numeric(14, 2) DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "purchase_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"supplier_code" text,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" text,
	"unit_price" numeric(14, 2) DEFAULT 0 NOT NULL,
	"line_total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tax_rate" numeric(5, 4) DEFAULT 0 NOT NULL,
	"raw_material_id" integer,
	"kg_per_unit" numeric(14, 3)
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer,
	"invoice_number" text,
	"cufe" text,
	"issue_date" date,
	"subtotal" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tax" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'borrador' NOT NULL,
	"raw_xml" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_at" timestamp,
	CONSTRAINT "purchases_cufe_unique" UNIQUE("cufe")
);
--> statement-breakpoint
CREATE TABLE "raw_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"vendty_code" text,
	"category" text,
	"stock_grams" numeric(14, 3) DEFAULT 0 NOT NULL,
	"avg_cost_per_kg" numeric(14, 2) DEFAULT 0 NOT NULL,
	"min_stock_grams" numeric(14, 3) DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "raw_materials_name_unique" UNIQUE("name"),
	CONSTRAINT "raw_materials_vendty_code_unique" UNIQUE("vendty_code")
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_key" text NOT NULL,
	"invoice" text NOT NULL,
	"sold_at" timestamp with time zone NOT NULL,
	"sku" text NOT NULL,
	"product_name" text NOT NULL,
	"category" text,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price_net" numeric(14, 2) NOT NULL,
	"unit_cost_net" numeric(14, 2) NOT NULL,
	"subtotal_net" numeric(14, 2) NOT NULL,
	"tax" numeric(14, 2) NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"payment_method" text,
	"excluded" boolean DEFAULT false NOT NULL,
	"excluded_reason" text,
	CONSTRAINT "sale_lines_external_key_unique" UNIQUE("external_key")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"raw_material_id" integer NOT NULL,
	"occurred_on" date NOT NULL,
	"kind" text NOT NULL,
	"grams" numeric(14, 3) NOT NULL,
	"cost_per_kg" numeric(14, 2),
	"purchase_line_id" integer,
	"packaging_run_id" integer,
	"note" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_item_map" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer,
	"match_key" text NOT NULL,
	"raw_material_id" integer NOT NULL,
	"kg_per_unit" numeric(14, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"nit" text,
	"phone" text,
	"notes" text,
	CONSTRAINT "suppliers_nit_unique" UNIQUE("nit")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "competitor_prices" ADD CONSTRAINT "competitor_prices_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_prices" ADD CONSTRAINT "competitor_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packaging_runs" ADD CONSTRAINT "packaging_runs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packaging_runs" ADD CONSTRAINT "packaging_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_line_id_purchase_lines_id_fk" FOREIGN KEY ("purchase_line_id") REFERENCES "public"."purchase_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_item_map" ADD CONSTRAINT "supplier_item_map_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_item_map" ADD CONSTRAINT "supplier_item_map_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competitor_prices_product_idx" ON "competitor_prices" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_raw_idx" ON "products" USING btree ("raw_material_id");--> statement-breakpoint
CREATE INDEX "sale_lines_sold_at_idx" ON "sale_lines" USING btree ("sold_at");--> statement-breakpoint
CREATE INDEX "sale_lines_sku_idx" ON "sale_lines" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "stock_movements_raw_idx" ON "stock_movements" USING btree ("raw_material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_item_map_key" ON "supplier_item_map" USING btree ("supplier_id","match_key");