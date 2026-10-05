import * as XLSX from "xlsx";

export type BagStockLine = { code: string; name: string; units: number };

/**
 * "Existencia de inventario" de Vendty: una fila por producto con sus unidades (bolsas listas para vender).
 * Columnas que usa: Producto, Codigo, Unidades.
 */
export function parseBagStock(bytes: Uint8Array): BagStockLine[] {
  const wb = XLSX.read(bytes, { type: "array" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const norm = (v: unknown) => String(v).normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const headerAt = rows.findIndex((r) => r.some((c) => norm(c) === "unidades") && r.some((c) => norm(c) === "producto"));
  if (headerAt < 0) return [];
  const head = rows[headerAt].map(norm);
  const iName = head.indexOf("producto");
  const iCode = head.indexOf("codigo");
  const iUnits = head.indexOf("unidades");
  const out: BagStockLine[] = [];
  for (const r of rows.slice(headerAt + 1)) {
    const units = Number(String(r[iUnits] ?? "").replace(",", "."));
    const name = String(r[iName] ?? "").trim();
    if (!name || !Number.isFinite(units)) continue;
    out.push({ code: iCode >= 0 ? String(r[iCode] ?? "").trim() : "", name, units });
  }
  return out;
}
