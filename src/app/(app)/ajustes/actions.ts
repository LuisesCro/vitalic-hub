"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { settings } from "@/db/schema";
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
