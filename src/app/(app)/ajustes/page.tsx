import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { SETTING_LABELS, type SettingKey } from "@/lib/settings-defaults";
import { saveSettings } from "./actions";
import { PasswordForm } from "./password-form";
import { UsersPanel } from "./users-panel";

export const metadata = { title: "Ajustes · Vitalic Hub" };

export default async function AjustesPage() {
  const session = await requireSession();
  if (session.role !== "admin") {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Mi clave</h1>
        <PasswordForm />
      </div>
    );
  }
  const [s, people] = await Promise.all([
    getSettings(),
    db.select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active }).from(users).orderBy(asc(users.id)),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Ajustes del negocio</h1>
      <form action={saveSettings} className="card grid gap-4 sm:grid-cols-2">
        {(Object.keys(SETTING_LABELS) as SettingKey[]).map((key) => {
          const { label, kind } = SETTING_LABELS[key];
          if (kind === "bool") {
            return (
              <label key={key} className="flex items-center gap-2 sm:col-span-2">
                <input type="checkbox" name={key} defaultChecked={s[key] === 1} /> <span>{label}</span>
              </label>
            );
          }
          return (
            <label key={key}>
              <span className="label">{label}{kind === "pct" ? " (%)" : " (COP)"}</span>
              <input name={key} inputMode="decimal" defaultValue={kind === "pct" ? +(s[key] * 100).toFixed(2) : s[key]} className="input" />
            </label>
          );
        })}
        <div className="sm:col-span-2"><button className="btn-primary">Guardar ajustes</button></div>
      </form>
      <UsersPanel users={people} me={session.userId} />
      <PasswordForm />
    </div>
  );
}
