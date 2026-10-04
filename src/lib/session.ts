import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureSchema } from "@/db/ensure-schema";
import { isRole, type Role } from "./roles";

const COOKIE = "vitalic_session";
const MAX_AGE_DAYS = 30;

export type Session = { userId: number; name: string; role: Role };

export function sessionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET debe tener al menos 32 caracteres");
  return new TextEncoder().encode(secret);
}

export async function createSession(session: Session) {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_DAYS}d`)
    .sign(sessionKey());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
  });
}

/**
 * Lee el token y confirma contra la base que el usuario sigue activo, con su rol
 * actual: desactivar a alguien o cambiarle el rol tiene efecto inmediato.
 * cache(): el layout y la página comparten la misma consulta en cada visita.
 */
export const readSession = cache(async function readSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  let userId: number;
  try {
    const { payload } = await jwtVerify(token, sessionKey());
    userId = Number(payload.userId);
  } catch {
    return null;
  }
  // Una sola vez por servidor: aplica columnas nuevas antes de cualquier consulta de la página.
  await ensureSchema();
  const [user] = await db
    .select({ id: users.id, name: users.name, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || !user.active) return null;
  return { userId: user.id, name: user.name, role: isRole(user.role) ? user.role : "cajera" };
});

/** Para páginas y acciones del servidor: exige sesión o envía al login. */
export async function requireSession(): Promise<Session> {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
}

/** Para todo lo que no es la caja: solo administradores. */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/caja");
  return session;
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;
