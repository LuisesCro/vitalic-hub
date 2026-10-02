"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { settings, users } from "@/db/schema";
import { requireAdmin, requireSession } from "@/lib/session";
import { isRole } from "@/lib/roles";
import { DEFAULT_SETTINGS, SETTING_LABELS, type SettingKey } from "@/lib/settings-defaults";

export async function saveSettings(formData: FormData) {
  await requireAdmin();
  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
    const kind = SETTING_LABELS[key].kind;
    let value: number;
    if (kind === "bool") value = formData.get(key) ? 1 : 0;
    else {
      const raw = Number(String(formData.get(key) ?? "").replace(",", "."));
      if (!Number.isFinite(raw)) continue;
      value = kind === "pct" ? raw / 100 : raw;
    }
    await db.insert(settings).values({ key, value: String(value) }).onConflictDoUpdate({ target: settings.key, set: { value: String(value) } });
  }
  revalidatePath("/", "layout");
}

export type PasswordState = { ok?: string; error?: string };

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const session = await requireSession();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const repeat = String(formData.get("repeat") ?? "");
  if (next.length < 10) return { error: "La clave nueva debe tener al menos 10 caracteres" };
  if (next !== repeat) return { error: "Las claves nuevas no coinciden" };
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) return { error: "La clave actual no es correcta" };
  await db.update(users).set({ passwordHash: await bcrypt.hash(next, 10) }).where(eq(users.id, user.id));
  return { ok: "Clave actualizada" };
}

export type UserState = { ok?: string; error?: string };

export async function createUser(_prev: UserState, formData: FormData): Promise<UserState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!name || !email.includes("@")) return { error: "Escribe el nombre y un correo" };
  if (!isRole(role)) return { error: "Elige el rol" };
  if (password.length < 10) return { error: "La clave inicial debe tener al menos 10 caracteres" };
  const inserted = await db
    .insert(users)
    .values({ name, email, role, passwordHash: await bcrypt.hash(password, 10) })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (inserted.length === 0) return { error: "Ya existe un usuario con ese correo" };
  revalidatePath("/ajustes");
  return { ok: `Usuario creado. ${name} entra con ${email} y la clave que escribiste.` };
}

export async function resetUserPassword(_prev: UserState, formData: FormData): Promise<UserState> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) return { error: "Mínimo 10 caracteres" };
  await db.update(users).set({ passwordHash: await bcrypt.hash(password, 10) }).where(eq(users.id, id));
  return { ok: "Clave nueva guardada" };
}

/** Cambia rol o estado de otra persona. Nadie puede quitarse a sí mismo el acceso de administrador. */
export async function updateUser(formData: FormData) {
  const session = await requireAdmin();
  const id = Number(formData.get("id"));
  if (id === session.userId) return;
  const role = String(formData.get("role") ?? "");
  const active = formData.get("active") === "1";
  await db.update(users).set({ ...(isRole(role) ? { role } : {}), active }).where(eq(users.id, id));
  revalidatePath("/ajustes");
}
