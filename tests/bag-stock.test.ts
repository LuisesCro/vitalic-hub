import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseBagStock } from "@/lib/bag-stock";

function book(rows: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Existencia");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

describe("parseBagStock", () => {
  it("lee producto, código y unidades de la existencia de Vendty", () => {
    const lines = parseBagStock(book([
      ["Almacen", "Categoria", "Producto", "Codigo", "Unidad", "Precio Compra", "Precio Venta", "Unidades"],
      ["General", "Frutos secos", "Mani dulce  250g", "VTL-FSS-MANDUL-250G", "unidad", 3500, 4201.68, 39],
      ["General", "Frutos secos", "Mani dulce  500g", "VTL-FSS-MANDUL-500G", "unidad", 6300, 7142.86, -6],
    ]));
    expect(lines).toEqual([
      { code: "VTL-FSS-MANDUL-250G", name: "Mani dulce  250g", units: 39 },
      { code: "VTL-FSS-MANDUL-500G", name: "Mani dulce  500g", units: -6 },
    ]);
  });

  it("devuelve vacío si no hay columnas Producto y Unidades", () => {
    expect(parseBagStock(book([["Insumo", "Kg"], ["Chía", 5]]))).toEqual([]);
  });
});
