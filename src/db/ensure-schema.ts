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
  // 0003_catalogo
  sql`CREATE TABLE IF NOT EXISTS "product_families" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" text NOT NULL UNIQUE,
    "category" text,
    "iva_rate" numeric(5, 4) DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE TABLE IF NOT EXISTS "product_components" (
    "id" serial PRIMARY KEY NOT NULL,
    "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
    "raw_material_id" integer NOT NULL REFERENCES "raw_materials"("id"),
    "grams" numeric(14, 3) NOT NULL
  )`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "product_components_product_raw" ON "product_components" ("product_id", "raw_material_id")`,
  sql`CREATE INDEX IF NOT EXISTS "product_components_raw_idx" ON "product_components" ("raw_material_id")`,
  sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "family_id" integer`,
  sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "format" text DEFAULT 'bolsa' NOT NULL`,
  sql`CREATE INDEX IF NOT EXISTS "products_family_idx" ON "products" ("family_id")`,
  sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "paused_by_family" boolean DEFAULT false NOT NULL`,
  // 0005_breb
  sql`ALTER TABLE "cash_sessions" ADD COLUMN IF NOT EXISTS "sales_breb" numeric(14, 2) DEFAULT 0 NOT NULL`,
  // 0004_granel
  sql`CREATE TABLE IF NOT EXISTS "bulk_sales" (
    "id" serial PRIMARY KEY NOT NULL,
    "occurred_on" date NOT NULL,
    "family_id" integer NOT NULL REFERENCES "product_families"("id"),
    "kg" numeric(14, 3) NOT NULL,
    "total_gross" numeric(14, 2) NOT NULL,
    "suggested_gross" numeric(14, 2) NOT NULL,
    "customer" text,
    "created_by" integer REFERENCES "users"("id"),
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
];

/** Revisión de solo lectura: ¿ya está todo? Así casi nunca se toca la estructura. */
async function upToDate(): Promise<boolean> {
  const rows = await db.execute<{ n: string }>(sql`
    select (select count(*) from information_schema.columns
             where table_schema = 'public' and (
               (table_name = 'users' and column_name in ('role', 'active')) or
               (table_name = 'products' and column_name in ('family_id', 'format', 'paused_by_family')) or
               (table_name = 'cash_sessions' and column_name = 'sales_breb')))
         + (select count(*) from information_schema.tables
             where table_schema = 'public' and table_name in ('cash_sessions', 'cash_movements', 'product_families', 'product_components', 'bulk_sales')) as n`);
  return Number(rows[0]?.n) === 11;
}

let ready: Promise<void> | null = null;

/** Una vez por servidor; si falla, se reintenta en la siguiente visita. */
export function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    if (await upToDate()) return;
    await db.transaction(async (tx) => {
      // Nunca quedarse esperando: si algo tiene la tabla ocupada, falla rápido y se reintenta luego.
      await tx.execute(sql`set local lock_timeout = '4s'`);
      await tx.execute(sql`set local statement_timeout = '15s'`);
      // El candado evita que dos servidores que arrancan a la vez choquen al crear tablas.
      await tx.execute(sql`select pg_advisory_xact_lock(732451)`);
      for (const statement of STATEMENTS) await tx.execute(statement);
    });
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}
