"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { restockRequests } from "@/db/schema";
import { requireAdmin, requireSession } from "@/lib/session";

const refresh = () => {
  revalidatePath("/por-pedir");
  revalidatePath("/", "layout");
};

/** La cajera marca (o desmarca) algo como urgente de pedir. */
export async function toggleUrgent(formData: FormData) {
  const session = await requireSession();
  const kind = String(formData.get("kind"));
  const refId = Number(formData.get("refId"));
  const name = String(formData.get("name") ?? "").slice(0, 200);
  if ((kind !== "bolsa" && kind !== "insumo") || !refId || !name) return;
  const [open] = await db
    .select({ id: restockRequests.id })
    .from(restockRequests)
    .where(and(eq(restockRequests.kind, kind), eq(restockRequests.refId, refId), eq(restockRequests.status, "pendiente")));
  if (open) await db.delete(restockRequests).where(eq(restockRequests.id, open.id));
  else await db.insert(restockRequests).values({ kind, refId, name, requestedBy: session.userId });
  refresh();
}

/** El administrador ya hizo el pedido de lo que marcó la cajera. */
export async function markOrdered(formData: FormData) {
  await requireAdmin();
  await db.update(restockRequests).set({ status: "pedido", orderedAt: new Date() }).where(eq(restockRequests.id, Number(formData.get("id"))));
  refresh();
}
