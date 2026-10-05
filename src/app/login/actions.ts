"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { bootstrapUsersIfEmpty } from "@/lib/bootstrap-users";
import { isRole } from "@/lib/roles";
import { createSession, destroySession } from "@/lib/session";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  await bootstrapUsersIfEmpty();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Correo o contraseña incorrectos" };
  }
  const role = isRole(user.role) ? user.role : "cajera";
  await createSession({ userId: user.id, name: user.name, role });
  redirect(role === "admin" ? "/" : "/vender");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
