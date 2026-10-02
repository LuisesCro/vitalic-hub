"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession } from "@/lib/session";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Correo o contraseña incorrectos" };
  }
  await createSession({ userId: user.id, name: user.name });
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
