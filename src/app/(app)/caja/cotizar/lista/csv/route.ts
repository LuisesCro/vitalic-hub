import { readSession } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { wholesaleList } from "../../data";

export const dynamic = "force-dynamic";

const q = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** Lista mayorista en CSV (se abre en Excel). Solo administradores. */
export async function GET() {
  const session = await readSession();
  if (!session || session.role !== "admin") return new Response("No autorizado", { status: 401 });
  const s = await getSettings();
  const { groups, units } = await wholesaleList(s);
  const d2 = Math.round(s.descuentoMayorista2 * 100), d3 = Math.round(s.descuentoMayorista3 * 100);
  const lines = [
    ["Categoría", "Producto", "Código", "Unidad", "Precio por unidad de venta (con IVA)", `Desde ${s.granelDesdeKg2} (-${d2}%)`, `Desde ${s.granelDesdeKg3} (-${d3}%)`].map(q).join(";"),
    ...groups.flatMap((g) => g.rows.map((r) => [q(g.category), q(r.name), q(r.code), q("kilo"), r.retailPerKg, r.fromKg2, r.fromKg3].join(";"))),
    ...units.map((r) => [q("Productos por unidad"), q(r.name), q(r.code), q("unidad"), r.unitPrice, r.from2, r.from3].join(";")),
  ];
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="lista-precios-mayorista-vitalic.csv"' },
  });
}
