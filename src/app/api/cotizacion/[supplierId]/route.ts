import { and, asc, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/db";
import { quoteItems, suppliers } from "@/db/schema";
import { BUSINESS } from "@/lib/business";
import { todayISO } from "@/lib/format";
import { readSession } from "@/lib/session";

/** Solicitud de cotización en Excel para mandársela al proveedor (sin costos ni precios nuestros). */
export async function GET(_req: Request, { params }: { params: Promise<{ supplierId: string }> }) {
  const session = await readSession();
  if (!session || session.role !== "admin") return new Response("No autorizado", { status: 401 });
  const id = Number((await params).supplierId);
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!supplier) return new Response("No encontrado", { status: 404 });
  const items = await db.select().from(quoteItems).where(and(eq(quoteItems.supplierId, id), eq(quoteItems.status, "borrador"))).orderBy(asc(quoteItems.name));

  const aoa: (string | number)[][] = [
    ["SOLICITUD DE COTIZACIÓN"],
    [`${BUSINESS.name} · NIT ${BUSINESS.nit}`],
    [`${BUSINESS.address}, ${BUSINESS.city} · ${BUSINESS.phone} · ${BUSINESS.email}`],
    [],
    ["Proveedor", supplier.name],
    ["Fecha", todayISO()],
    [],
    ["#", "Producto", "Cantidad (kg)", "Precio por kg sin IVA", "IVA %", "Disponibilidad / plazo de entrega", "Observaciones"],
    ...items.map((it, i) => [i + 1, it.name, it.qtyKg || "", "", "", "", ""]),
    [],
    ["Por favor indicar precio por kg, IVA, forma de pago y tiempo de entrega."],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [{ wch: 5 }, { wch: 42 }, { wch: 15 }, { wch: 22 }, { wch: 8 }, { wch: 32 }, { wch: 32 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Cotización");
  const bytes = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const safe = supplier.name.normalize("NFD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Cotizacion-${safe}-${todayISO()}.xlsx"`,
    },
  });
}
