CREATE TABLE "cash_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"note" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_date" date NOT NULL,
	"status" text DEFAULT 'abierta' NOT NULL,
	"opening_cash" numeric(14, 2) DEFAULT 0 NOT NULL,
	"opened_by" integer,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sales_cash" numeric(14, 2) DEFAULT 0 NOT NULL,
	"sales_card" numeric(14, 2) DEFAULT 0 NOT NULL,
	"sales_nequi" numeric(14, 2) DEFAULT 0 NOT NULL,
	"sales_daviplata" numeric(14, 2) DEFAULT 0 NOT NULL,
	"sales_transfer" numeric(14, 2) DEFAULT 0 NOT NULL,
	"sales_other" numeric(14, 2) DEFAULT 0 NOT NULL,
	"counted_cash" numeric(14, 2),
	"denominations" text,
	"next_base" numeric(14, 2),
	"closing_note" text,
	"closed_by" integer,
	"closed_at" timestamp with time zone,
	CONSTRAINT "cash_sessions_business_date_unique" UNIQUE("business_date")
);
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_session_id_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;