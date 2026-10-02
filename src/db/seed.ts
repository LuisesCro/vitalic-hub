import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { settings, users } from "./schema";
import { DEFAULT_SETTINGS } from "../lib/settings-defaults";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta la variable DATABASE_URL");
const sql = postgres(url, { max: 1, prepare: false });
const db = drizzle(sql);

const seedUsers = (process.env.SEED_USERS ?? "").split(",").filter(Boolean);
for (const entry of seedUsers) {
  const [email, name, password] = entry.split(":");
  if (!email || !name || !password) throw new Error(`SEED_USERS mal formado: ${entry}`);
  const passwordHash = await bcrypt.hash(password, 10);
  await db
    .insert(users)
    .values({ email: email.toLowerCase(), name, passwordHash })
    .onConflictDoUpdate({ target: users.email, set: { name, passwordHash } });
  console.log(`Usuario listo: ${email}`);
}

for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
  await db.insert(settings).values({ key, value: String(value) }).onConflictDoNothing();
}
await sql.end();
console.log("Datos iniciales cargados");
