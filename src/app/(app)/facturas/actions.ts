"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { invoicePhotos } from "@/db/schema";
import { requireSession } from "@/lib/session";

export type PhotoState = { ok?: string; error?: string };

const TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/** La cajera envía la foto de una factura; queda pendiente para que el administrador la cargue. */
export async function submitInvoicePhoto(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  const session = await requireSession();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Toma o elige la foto de la factura" };
  if (!TYPES.has(file.type)) return { error: "La factura debe ser una foto (JPG o PNG)" };
  if (file.size > 5_500_000) return { error: "La foto pesa demasiado. Tómala de nuevo un poco más lejos" };
  const note = String(formData.get("note") ?? "").trim() || null;
  const bytes = Buffer.from(await file.arrayBuffer());
  await db.insert(invoicePhotos).values({
    imageBase64: bytes.toString("base64"),
    mediaType: file.type === "image/jpg" ? "image/jpeg" : file.type,
    note,
    uploadedBy: session.userId,
  });
  revalidatePath("/facturas");
  revalidatePath("/compras");
  return { ok: "Listo, la factura quedó enviada. Friday la carga al sistema." };
}

export async function recentPhotos(userId: number | null) {
  const q = db
    .select({ id: invoicePhotos.id, note: invoicePhotos.note, status: invoicePhotos.status, createdAt: invoicePhotos.createdAt, purchaseId: invoicePhotos.purchaseId })
    .from(invoicePhotos);
  return (userId ? q.where(eq(invoicePhotos.uploadedBy, userId)) : q).orderBy(desc(invoicePhotos.id)).limit(15);
}
