"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { settings, users } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { DEFAULT_SETTINGS, SETTING_LABELS, type SettingKey } from "@/lib/settings-defaults";

export async function saveSettings(formData: FormData) {
  await requireSession();
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
