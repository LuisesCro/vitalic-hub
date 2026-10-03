import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * Cambios de estructura posteriores a 0000_init.sql, escritos para poder
 * ejecutarse siempre sin dañar nada (IF NOT EXISTS). La aplicación los aplica
 * sola la primera vez que se conecta, así nadie tiene que pegar SQL en Supabase.
 * Al agregar una migración nueva en drizzle/, agregar aquí su versión idempotente.
 */
const STATEMENTS = [
  // 0001_caja
  sql`CREATE TABLE IF NOT EXISTS "cash_sessions" (
    "id" serial PRIMARY KEY NOT NULL,
    "business_date" date NOT NULL UNIQUE,
    "status" text DEFAULT 'abierta' NOT NULL,
    "opening_cash" numeric(14, 2) DEFAULT 0 NOT NULL,
    "opened_by" integer REFERENCES "users"("id"),
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
    "closed_by" integer REFERENCES "users"("id"),
    "closed_at" timestamp with time zone
  )`,
  sql`CREATE TABLE IF NOT EXISTS "cash_movements" (
    "id" serial PRIMARY KEY NOT NULL,
    "session_id" integer NOT NULL REFERENCES "cash_sessions"("id") ON DELETE CASCADE,
    "kind" text NOT NULL,
    "category" text NOT NULL,
    "amount" numeric(14, 2) NOT NULL,
    "note" text,
    "created_by" integer REFERENCES "users"("id"),
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  // 0002_usuarios_roles
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'admin' NOT NULL`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL`,
];

let ready: Promise<void> | null = null;

/** Una vez por servidor; si falla, se reintenta en la siguiente visita. */
export function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    // El candado evita que dos servidores que arrancan a la vez choquen al crear tablas.
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(732451)`);
      for (const statement of STATEMENTS) await tx.execute(statement);
    });
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}
