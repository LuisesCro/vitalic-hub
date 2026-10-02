import * as XLSX from "xlsx";
import { gramsFromName, normalize } from "./units";
import { toNumber } from "./vendty";

export type CompetitorRow = { name: string; grams: number | null; priceGross: number };

/**
 * Lee un catálogo de competencia en Excel o CSV. Busca una columna de producto
 * (producto, nombre, descripción) y una de precio; los gramos salen de una columna
 * "gramos" o del nombre.
 */
export function parseCompetitorFile(bytes: Uint8Array): CompetitorRow[] {
  const book = XLSX.read(bytes, { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  const headerIndex = rows.findIndex((r) => r.some((c) => typeof c === "string" && /precio/.test(normalize(c))));
  if (headerIndex < 0) throw new Error("No encontré una columna de precio. Usa encabezados como Producto y Precio.");
  const header = rows[headerIndex].map((c) => normalize(String(c ?? "")));
  const nameCol = header.findIndex((h) => /producto|nombre|descripcion|item/.test(h));
  const priceCol = header.findIndex((h) => /precio/.test(h));
  const gramsCol = header.findIndex((h) => /gramo|peso|presentacion/.test(h));
  if (nameCol < 0) throw new Error("No encontré la columna de producto.");

  return rows
    .slice(headerIndex + 1)
    .map((r) => {
      const name = String(r[nameCol] ?? "").replace(/\s+/g, " ").trim();
      const price = toNumber(r[priceCol]);
      const gramsCell = gramsCol >= 0 ? r[gramsCol] : null;
      const grams =
        typeof gramsCell === "number" ? gramsCell : gramsCell ? gramsFromName(String(gramsCell)) ?? gramsFromName(`${gramsCell} g`) : null;
      // "Pistacho con cáscara 250" (sin unidad): un número final de 10 o más se toma como gramos.
      const trailing = name.match(/\s(\d{2,4})\s*$/);
      return { name, grams: grams ?? gramsFromName(name) ?? (trailing ? Number(trailing[1]) : null), priceGross: price };
    })
    .filter((r) => r.name && r.priceGross > 0);
}
