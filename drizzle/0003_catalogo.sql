CREATE TABLE "product_components" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"raw_material_id" integer NOT NULL,
	"grams" numeric(14, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_families" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"iva_rate" numeric(5, 4) DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_families_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "family_id" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "format" text DEFAULT 'bolsa' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "paused_by_family" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_components_product_raw" ON "product_components" USING btree ("product_id","raw_material_id");--> statement-breakpoint
CREATE INDEX "product_components_raw_idx" ON "product_components" USING btree ("raw_material_id");--> statement-breakpoint
CREATE INDEX "products_family_idx" ON "products" USING btree ("family_id");