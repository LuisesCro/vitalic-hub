"use server";

import { and, eq, sum } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { cashMovements, cashSessions, purchases, supplierPayments, suppliers } from "@/db/schema";
import { fmtCOP, todayISO } from "@/lib/format";
import { isSupplierMethod, payStatus } from "@/lib/payables";
import { requireAdmin } from "@/lib/session";

export type PayState = { ok?: string; error?: string };

const pesos = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(/[^0-9,]/g, "").replace(",", ".")) || 0;

function refresh(purchaseId: number) {
  revalidatePath(`/compras/${purchaseId}`);
  revalidatePath("/compras");
  revalidatePath("/caja");
  revalidatePath("/");
}

/** Registra un pago o abono. Si es en efectivo y sale de la caja abierta de ese día, también queda en el cuadre. */
export async function addSupplierPayment(_prev: PayState, formData: FormData): Promise<PayState> {
  const session = await requireAdmin();
  const purchaseId = Number(formData.get("purchaseId"));
  const amount = pesos(formData.get("amount"));
  const method = String(formData.get("method") ?? "");
  const paidOn = String(formData.get("paidOn") ?? "") || todayISO();
  const note = String(formData.get("note") ?? "").trim() || null;
  const fromCash = formData.get("fromCash") === "1";
  if (!(amount > 0)) return { error: "Escribe el valor pagado" };
  if (!isSupplierMethod(method)) return { error: "Elige cómo se pagó" };

  const [row] = await db
    .select({ p: purchases, supplier: suppliers.name })
    .from(purchases)
    .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(eq(purchases.id, purchaseId));
  if (!row) return { error: "La factura no existe" };
  const [{ paid }] = await db.select({ paid: sum(supplierPayments.amount).mapWith(Number) }).from(supplierPayments).where(eq(supplierPayments.purchaseId, purchaseId));
  const { balance } = payStatus(row.p.total, paid ?? 0, null, paidOn);
  if (amount > balance + 100) return { error: `El saldo de esta factura es ${fmtCOP(balance)}; el pago no puede ser mayor` };

  let cashMovementId: number | null = null;
  let cashNote = "";
  await db.transaction(async (tx) => {
    if (fromCash && method === "efectivo") {
      const [open] = await tx
        .select({ id: cashSessions.id })
        .from(cashSessions)
        .where(and(eq(cashSessions.businessDate, paidOn), eq(cashSessions.status, "abierta")));
      if (open) {
        [{ id: cashMovementId }] = await tx
          .insert(cashMovements)
          .values({
            sessionId: open.id, kind: "egreso", category: "Pago a proveedor", amount,
            note: `${row.supplier ?? "Proveedor"} · factura ${row.p.invoiceNumber ?? row.p.id}`, createdBy: session.userId,
          })
          .returning({ id: cashMovements.id });
        cashNote = " También quedó como salida en la caja de hoy.";
      } else {
        cashNote = " No había caja abierta ese día, así que no se registró en el cuadre.";
      }
    }
    await tx.insert(supplierPayments).values({ purchaseId, paidOn, amount, method, note, cashMovementId, createdBy: session.userId });
  });
  refresh(purchaseId);
  const left = balance - amount;
  return { ok: `${left < 100 ? "Factura pagada por completo." : `Abono registrado. Saldo pendiente: ${fmtCOP(left)}.`}${cashNote}` };
}

/** Borra un pago mal registrado (y su salida de caja si la caja sigue abierta). */
export async function deleteSupplierPayment(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const [pay] = await db.select().from(supplierPayments).where(eq(supplierPayments.id, id));
  if (!pay) return;
  await db.transaction(async (tx) => {
    if (pay.cashMovementId) {
      const [mv] = await tx
        .select({ status: cashSessions.status })
        .from(cashMovements)
        .innerJoin(cashSessions, eq(cashSessions.id, cashMovements.sessionId))
        .where(eq(cashMovements.id, pay.cashMovementId));
      if (mv?.status === "abierta") await tx.delete(cashMovements).where(eq(cashMovements.id, pay.cashMovementId));
    }
    await tx.delete(supplierPayments).where(eq(supplierPayments.id, id));
  });
  refresh(pay.purchaseId);
}

/** Forma de pago y vencimiento (por si la factura no los trae o el proveedor dio otro plazo). */
export async function updatePaymentTerms(formData: FormData) {
  await requireAdmin();
  const purchaseId = Number(formData.get("purchaseId"));
  const term = String(formData.get("paymentTerm") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  await db
    .update(purchases)
    .set({ paymentTerm: term === "contado" || term === "credito" ? term : null, dueDate: /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null })
    .where(eq(purchases.id, purchaseId));
  refresh(purchaseId);
}
