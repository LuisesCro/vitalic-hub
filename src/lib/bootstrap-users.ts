import "server-only";
import bcrypt from "bcryptjs";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Primera puesta en marcha: si la base no tiene usuarios, los crea desde la
 * variable SEED_USERS ("correo:Nombre:clave,correo:Nombre:clave"). Después de
 * entrar, cada persona cambia su clave en Ajustes y la variable se puede borrar.
 */
export async function bootstrapUsersIfEmpty() {
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n > 0) return;
  const entries = (process.env.SEED_USERS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  for (const entry of entries) {
    const [email, name, password] = entry.split(":");
    if (!email || !name || !password) continue;
    await db
      .insert(users)
      .values({ email: email.toLowerCase(), name, passwordHash: await bcrypt.hash(password, 10) })
      .onConflictDoNothing();
  }
}
