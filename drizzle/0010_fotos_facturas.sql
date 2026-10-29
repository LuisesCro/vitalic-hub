CREATE TABLE "invoice_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_base64" text NOT NULL,
	"media_type" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"purchase_id" integer,
	"uploaded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_photos" ADD CONSTRAINT "invoice_photos_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_photos" ADD CONSTRAINT "invoice_photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;