CREATE TABLE "restock_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ref_id" integer NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"requested_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ordered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "restock_requests_status_idx" ON "restock_requests" USING btree ("status");