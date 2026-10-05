"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { purchaseLines, purchases, rawMaterials, supplierItemMap, suppliers } from "@/db/schema";
import { readInvoiceWithAI, type ImageMediaType } from "@/lib/ai-invoice";
import { parseDianFile, type ParsedInvoice } from "@/lib/dian";
import { applyMovement } from "@/lib/inventory";
import { matchRawMaterial } from "@/lib/matching";
import { requireAdmin } from "@/lib/session";
import { kgPerInvoiceUnit, normalize } from "@/lib/units";
import { todayISO } from "@/lib/format";

export type UploadState = { error?: string; ok?: string };

const IMAGE_TYPES: Record<string, ImageMediaType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

function lineKey(code: string | null, description: string) {
  return normalize(code ? `cod ${code}` : description);
}

export async function uploadInvoice(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const session = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona la factura (XML, ZIP, foto o PDF)" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  let parsed: ParsedInvoice;
  let source: "xml" | "foto";
  let rawXml: string | null = null;
  try {
    if (name.endsWith(".xml") || name.endsWith(".zip")) {
      parsed = parseDianFile(name, bytes);
      source = "xml";
      if (name.endsWith(".xml")) rawXml = new TextDecoder().decode(bytes);
    } else if (file.type === "application/pdf" || name.endsWith(".pdf")) {
      parsed = await readInvoiceWithAI(bytes, "application/pdf");
      source = "foto";
    } else if (IMAGE_TYPES[file.type]) {
      parsed = await readInvoiceWithAI(bytes, IMAGE_TYPES[file.type]);
      source = "foto";
    } else {
      return { error: "Formato no soportado. Sube el XML o ZIP de la factura electrónica, una foto (JPG/PNG) o un PDF." };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No pude leer la factura" };
  }

  if (parsed.cufe) {
    const [dup] = await db.select({ id: purchases.id }).from(purchases).where(eq(purchases.cufe, parsed.cufe)).limit(1);
    if (dup) return { error: `Esta factura ya está cargada (compra #${dup.id}).` };
  }

  const purchaseId = await createDraft(parsed, source, rawXml, session.userId);
  redirect(`/compras/${purchaseId}`);
}

async function findOrCreateSupplier(name: string | null, nit: string | null): Promise<number | null> {
  if (!name && !nit) return null;
  const cleanNit = nit?.replace(/[^0-9]/g, "") || null;
  if (cleanNit) {
    const [found] = await db.select().from(suppliers).where(eq(suppliers.nit, cleanNit)).limit(1);
    if (found) return found.id;
  }
  const all = await db.select().from(suppliers);
  const byName = name ? all.find((s) => normalize(s.name) === normalize(name)) : undefined;
  if (byName) {
    if (cleanNit && !byName.nit) await db.update(suppliers).set({ nit: cleanNit }).where(eq(suppliers.id, byName.id));
    return byName.id;
  }
  const [created] = await db
    .insert(suppliers)
    .values({ name: name ?? `Proveedor ${cleanNit}`, nit: cleanNit })
    .returning({ id: suppliers.id });
  return created.id;
}

async function createDraft(parsed: ParsedInvoice, source: "xml" | "foto", rawXml: string | null, userId: number) {
  const supplierId = await findOrCreateSupplier(parsed.supplierName, parsed.supplierNit);
  const materials = await db.select({ id: rawMaterials.id, name: rawMaterials.name }).from(rawMaterials);
  const learned = supplierId
    ? await db.select().from(supplierItemMap).where(eq(supplierItemMap.supplierId, supplierId))
    : [];

  return db.transaction(async (tx) => {
    const [purchase] = await tx
      .insert(purchases)
      .values({
        supplierId,
        invoiceNumber: parsed.invoiceNumber,
        cufe: parsed.cufe,
        issueDate: parsed.issueDate,
        paymentTerm: parsed.paymentTerm ?? null,
        dueDate: parsed.dueDate ?? (parsed.paymentTerm === "contado" ? parsed.issueDate : null),
        subtotal: parsed.subtotal,
        tax: parsed.tax,
        total: parsed.total,
        source,
        rawXml,
        createdBy: userId,
      })
      .returning({ id: purchases.id });

    if (parsed.lines.length) {
      await tx.insert(purchaseLines).values(
        parsed.lines.map((l) => {
          const memory = learned.find((m) => m.matchKey === lineKey(l.supplierCode, l.description));
          return {
            purchaseId: purchase.id,
            supplierCode: l.supplierCode,
            description: l.description,
            quantity: l.quantity,
            unit: l.unit,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal || l.unitPrice * l.quantity,
            taxRate: l.taxRate,
            rawMaterialId: memory?.rawMaterialId ?? matchRawMaterial(l.description, materials)?.id ?? null,
            kgPerUnit: memory?.kgPerUnit ?? kgPerInvoiceUnit(l.description, l.unit),
          };
        }),
      );
    }
    return purchase.id;
  });
}

function readLineEdits(formData: FormData) {
  const edits: { id: number; rawMaterialId: number | null; kgPerUnit: number | null }[] = [];
  for (const [key, value] of formData.entries()) {
    const m = key.match(/^raw-(\d+)$/);
    if (!m) continue;
    const id = Number(m[1]);
    const kg = Number(String(formData.get(`kg-${id}`) ?? "").replace(",", "."));
    edits.push({ id, rawMaterialId: value ? Number(value) : null, kgPerUnit: kg > 0 ? kg : null });
  }
  return edits;
}

async function saveEdits(purchaseId: number, formData: FormData) {
  const edits = readLineEdits(formData);
  for (const e of edits) {
    await db
      .update(purchaseLines)
      .set({ rawMaterialId: e.rawMaterialId, kgPerUnit: e.kgPerUnit })
      .where(and(eq(purchaseLines.id, e.id), eq(purchaseLines.purchaseId, purchaseId)));
  }
  const issueDate = String(formData.get("issueDate") ?? "");
  if (issueDate) await db.update(purchases).set({ issueDate }).where(eq(purchases.id, purchaseId));
}

export async function saveDraft(formData: FormData) {
  await requireAdmin();
  const purchaseId = Number(formData.get("purchaseId"));
  await saveEdits(purchaseId, formData);
  revalidatePath(`/compras/${purchaseId}`);
}

export async function confirmPurchase(formData: FormData) {
  const session = await requireAdmin();
  const purchaseId = Number(formData.get("purchaseId"));
  await saveEdits(purchaseId, formData);

  await db.transaction(async (tx) => {
    const [purchase] = await tx.select().from(purchases).where(eq(purchases.id, purchaseId)).for("update");
    if (!purchase || purchase.status === "confirmada") return;
    const lines = await tx.select().from(purchaseLines).where(eq(purchaseLines.purchaseId, purchaseId));
    const date = purchase.issueDate ?? todayISO();
    for (const line of lines) {
      if (!line.rawMaterialId || !line.kgPerUnit || line.quantity <= 0) continue; // fletes, bolsas, etc.
      const kg = line.quantity * line.kgPerUnit;
      await applyMovement(tx, {
        rawMaterialId: line.rawMaterialId,
        occurredOn: date,
        kind: "entrada",
        grams: kg * 1000,
        costPerKg: line.lineTotal / kg,
        purchaseLineId: line.id,
        note: `Factura ${purchase.invoiceNumber ?? purchase.id}`,
        userId: session.userId,
      });
      if (purchase.supplierId) {
        await tx
          .insert(supplierItemMap)
          .values({
            supplierId: purchase.supplierId,
            matchKey: lineKey(line.supplierCode, line.description),
            rawMaterialId: line.rawMaterialId,
            kgPerUnit: line.kgPerUnit,
          })
          .onConflictDoUpdate({
            target: [supplierItemMap.supplierId, supplierItemMap.matchKey],
            set: { rawMaterialId: line.rawMaterialId, kgPerUnit: line.kgPerUnit },
          });
      }
    }
    await tx.update(purchases).set({ status: "confirmada", confirmedAt: new Date() }).where(eq(purchases.id, purchaseId));
  });
  revalidatePath("/", "layout");
  redirect(`/compras/${purchaseId}`);
}

export async function deleteDraft(formData: FormData) {
  await requireAdmin();
  const purchaseId = Number(formData.get("purchaseId"));
  await db.delete(purchases).where(and(eq(purchases.id, purchaseId), inArray(purchases.status, ["borrador"])));
  revalidatePath("/compras");
  redirect("/compras");
}
