"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { requireSession } from "@/lib/session";


export async function addExpense(formData: FormData) {
  await requireSession();
  const month = String(formData.get("month") ?? ""); // AAAA-MM
  const category = String(formData.get("category") ?? "");
  const amount = Number(String(formData.get("amount") ?? "").replace(/[^0-9.]/g, ""));
  if (!/^\d{4}-\d{2}$/.test(month) || !category || !(amount > 0)) return;
  await db.insert(expenses).values({ month: `${month}-01`, category, amount, note: String(formData.get("note") ?? "") || null });
  revalidatePath("/resultados");
  revalidatePath("/");
}

/** Copia los gastos de un mes al siguiente (útil para gastos fijos). */
export async function copyExpenses(formData: FormData) {
  await requireSession();
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return;
  const existing = await db.select().from(expenses).where(eq(expenses.month, `${to}-01`));
  if (existing.length) return;
  const rows = await db.select().from(expenses).where(eq(expenses.month, `${from}-01`));
  if (rows.length) {
    await db.insert(expenses).values(rows.map((r) => ({ month: `${to}-01`, category: r.category, amount: r.amount, note: r.note })));
  }
  revalidatePath("/resultados");
}

export async function deleteExpense(formData: FormData) {
  await requireSession();
  const id = Number(formData.get("id"));
  const month = String(formData.get("month") ?? "");
  await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.month, month)));
  revalidatePath("/resultados");
}
