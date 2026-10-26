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
  const rows = await wholesaleList(s);
  const pct = (v: number | null) => (v ? `${Math.round(v * 1000) / 10}%` : "");
  const lines = [
    ["Producto", "Precio en bolsa por kilo (con IVA)", `Desde ${s.granelDesdeKg2} kg por kilo`, "Descuento", `Desde ${s.granelDesdeKg3} kg por kilo`, "Descuento"].map(q).join(";"),
    ...rows.map((r) => [q(r.name), r.retailPerKg ?? "", r.fromKg2, q(pct(r.discount2)), r.fromKg3, q(pct(r.discount3))].join(";")),
  ];
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="lista-precios-mayorista-vitalic.csv"' },
  });
}
