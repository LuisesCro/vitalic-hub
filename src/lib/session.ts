import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "vitalic_session";
const MAX_AGE_DAYS = 30;

export type Session = { userId: number; name: string };

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET debe tener al menos 32 caracteres");
  return new TextEncoder().encode(secret);
}

export async function createSession(session: Session) {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_DAYS}d`)
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
  });
}

export async function readSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return { userId: Number(payload.userId), name: String(payload.name) };
  } catch {
    return null;
  }
}

/** Para páginas y acciones del servidor: exige sesión o envía al login. */
export async function requireSession(): Promise<Session> {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;
