"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { cashMovements, cashSessions } from "@/db/schema";
import { DENOMINATIONS, MOVEMENT_KINDS, PAYMENT_METHODS, isMovementKind, parsePesos, sumDenominations } from "@/lib/cash";
import { todayISO } from "@/lib/format";
import { requireAdmin, requireSession } from "@/lib/session";

function validDate(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && s <= todayISO() ? s : null;
}

function refresh() {
  revalidatePath("/caja");
  revalidatePath("/");
}

export async function openCash(formData: FormData) {
  const session = await requireSession();
  const date = validDate(formData.get("date")) ?? todayISO();
  await db
    .insert(cashSessions)
    .values({ businessDate: date, openingCash: parsePesos(formData.get("openingCash")), openedBy: session.userId })
    .onConflictDoNothing();
  refresh();
  redirect(`/caja?fecha=${date}`);
}

export async function addCashMovement(formData: FormData) {
  const session = await requireSession();
  const sessionId = Number(formData.get("sessionId"));
  // El selector envía "tipo|concepto", p. ej. "egreso|Pago a proveedor".
  const [kind, category = ""] = String(formData.get("category") ?? "").split("|");
  const amount = parsePesos(formData.get("amount"));
  if (!isMovementKind(kind) || !(amount > 0)) return;
  const categories: readonly string[] = MOVEMENT_KINDS[kind].categories;
  const [open] = await db
    .select({ id: cashSessions.id })
    .from(cashSessions)
    .where(and(eq(cashSessions.id, sessionId), eq(cashSessions.status, "abierta")));
  if (!open) return;
  await db.insert(cashMovements).values({
    sessionId,
    kind,
    category: categories.includes(category) ? category : categories[categories.length - 1],
    amount,
    note: String(formData.get("note") ?? "").trim() || null,
    createdBy: session.userId,
  });
  refresh();
}

export async function deleteCashMovement(formData: FormData) {
  await requireSession();
  const id = Number(formData.get("id"));
  const [m] = await db
    .select({ status: cashSessions.status })
    .from(cashMovements)
    .innerJoin(cashSessions, eq(cashSessions.id, cashMovements.sessionId))
    .where(eq(cashMovements.id, id));
  if (m?.status !== "abierta") return;
  await db.delete(cashMovements).where(eq(cashMovements.id, id));
  refresh();
}

export type CloseState = { error?: string };

export async function closeCash(_prev: CloseState, formData: FormData): Promise<CloseState> {
  const session = await requireSession();
  const sessionId = Number(formData.get("sessionId"));
  const sales = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.key, parsePesos(formData.get(m.key))]));
  const counts: Record<string, number> = {};
  for (const d of DENOMINATIONS) {
    const n = parsePesos(formData.get(`d${d}`));
    if (n > 0) counts[String(d)] = n;
  }
  const byBills = sumDenominations(counts);
  const typed = String(formData.get("countedCash") ?? "").trim();
  if (byBills === 0 && typed === "") return { error: "Cuenta el efectivo del cajón: por billetes y monedas o el total" };
  const countedCash = byBills > 0 ? byBills : parsePesos(typed);
  const nextBaseRaw = String(formData.get("nextBase") ?? "").trim();
  const nextBase = nextBaseRaw === "" ? null : parsePesos(nextBaseRaw);
  if (nextBase !== null && nextBase > countedCash) return { error: "La base para mañana no puede ser mayor que el efectivo contado" };

  const updated = await db
    .update(cashSessions)
    .set({
      ...sales,
      countedCash,
      denominations: byBills > 0 ? JSON.stringify(counts) : null,
      nextBase,
      closingNote: String(formData.get("note") ?? "").trim() || null,
      status: "cerrada",
      closedBy: session.userId,
      closedAt: new Date(),
    })
    .where(and(eq(cashSessions.id, sessionId), eq(cashSessions.status, "abierta")))
    .returning({ date: cashSessions.businessDate });
  if (updated.length === 0) return { error: "Esta caja ya estaba cerrada" };
  refresh();
  redirect(`/caja?fecha=${updated[0].date}`);
}

/** Reabre una caja cerrada para corregirla. */
export async function reopenCash(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  await db.update(cashSessions).set({ status: "abierta", closedAt: null, closedBy: null }).where(eq(cashSessions.id, id));
  refresh();
}
