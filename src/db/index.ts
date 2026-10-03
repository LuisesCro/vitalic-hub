import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;
const globalForDb = globalThis as unknown as { vitalicDb?: Db };

// La conexión se abre en el primer uso, no al importar, para que la compilación funcione sin DATABASE_URL.
function getDb(): Db {
  if (globalForDb.vitalicDb) return globalForDb.vitalicDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta la variable DATABASE_URL");
  // prepare: false permite usar el pooler de Supabase (modo transacción).
  const instance = drizzle(postgres(url, { prepare: false, max: 5, connect_timeout: 15, idle_timeout: 20 }), { schema });
  globalForDb.vitalicDb = instance;
  return instance;
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
export { schema };
