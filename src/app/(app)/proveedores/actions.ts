"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { requireAdmin } from "@/lib/session";

export type SupplierState = { ok?: string; error?: string };

/** Crea un proveedor o actualiza sus datos de contacto. */
export async function saveSupplier(_prev: SupplierState, formData: FormData): Promise<SupplierState> {
  await requireAdmin();
  const id = Number(formData.get("id")) || null;
  const name = String(formData.get("name") ?? "").trim();
  const nit = String(formData.get("nit") ?? "").replace(/[^0-9]/g, "") || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!name) return { error: "Escribe el nombre del proveedor" };
  try {
    if (id) await db.update(suppliers).set({ name, nit, phone, notes }).where(eq(suppliers.id, id));
    else await db.insert(suppliers).values({ name, nit, phone, notes });
  } catch {
    return { error: "Ya hay un proveedor con ese NIT" };
  }
  revalidatePath("/proveedores");
  return { ok: id ? "Proveedor actualizado" : `${name} quedó agregado` };
}
