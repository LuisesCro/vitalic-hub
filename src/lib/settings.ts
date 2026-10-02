import "server-only";
import { db } from "@/db";
import { settings as settingsTable } from "@/db/schema";
import { DEFAULT_SETTINGS, type Settings } from "./settings-defaults";

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(settingsTable);
  const merged: Settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in merged) merged[row.key as keyof Settings] = Number(row.value);
  }
  return merged;
}
