import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseInventoryCount, parseVendtyProducts, parseVendtyTransactions, toNumber } from "@/lib/vendty";

function book(rows: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Hoja");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

describe("vendty", () => {
  it("convierte montos con comas", () => {
    expect(toNumber("1,371,691")).toBe(1371691);
  });

  it("lee productos", () => {
    const bytes = book([
      ["Codigo del producto", "Nombre del producto", "Descripción", "Precio de compra", "Precio de venta", "Nombre del impuesto", "Categoria"],
      ["VTL-FSS-ALMLAM-250G", "Almendra Laminada  250g", "", 10154, 13865.55, "IVA 19", "Frutos secos y semillas"],
      ["ing014", "Almendra", "", 38.67, 0, "Sin Impuesto", "ingredientes"],
    ]);
    const [a, b] = parseVendtyProducts(bytes);
    expect(a).toMatchObject({ sku: "VTL-FSS-ALMLAM-250G", name: "Almendra Laminada 250g", ivaRate: 0.19, isIngredient: false });
    expect(b.isIngredient).toBe(true);
    expect(b.priceNet).toBeNull();
  });

  it("lee transacciones y excluye ajustes", () => {
    const header = ["# Factura", "Código Producto", "Detalle Producto", "Cantidad", "Cant. Devueltas", "Fecha", "Precio Venta", "Precio Compra", "Subtotal", "Impuesto Total", "Total Venta", "Forma Pago", "Categoría"];
    const bytes = book([
      header,
      ["No3", "A250", "Almendra 250g", 1, 0, "2025-11-06 09:50:26", 12605, 10154, 12605, 2395, 15000, "efectivo", "Frutos"],
      ["No9", "AV500", "Avena 500g", 5000, 0, "2026-03-01 09:37:30", 0, 3300, 0, 0, 0, "efectivo", "Frutos"],
    ]);
    const [a, b] = parseVendtyTransactions(bytes);
    expect(a.subtotalNet).toBe(12605);
    expect(a.excluded).toBe(false);
    expect(a.soldAt.toISOString()).toBe("2025-11-06T14:50:26.000Z");
    expect(b.excluded).toBe(true);
  });
});

describe("inventario contado", () => {
  it("lee la existencia de Vendty y deja solo los insumos en gramos", () => {
    const bytes = book([
      ["Almacen", "Categoria", "Producto", "Codigo", "Unidad", "Precio Compra", "Unidades"],
      ["General", "Frutos secos", "Mani dulce  250g", "VTL-FSS-MANDUL-250G", "unidad", 3500, 39],
      ["General", "ingredientes", "Acacia entero", "ing003", "gramo", 10, 280],
    ]);
    expect(parseInventoryCount(bytes)).toEqual([{ code: "ing003", name: "Acacia entero", grams: 280 }]);
  });

  it("lee una hoja propia en kilos", () => {
    const bytes = book([
      ["Insumo", "Kg"],
      ["Almendra", "12,5"],
      ["Canela", 3],
    ]);
    const lines = parseInventoryCount(bytes);
    expect(lines).toEqual([
      { code: null, name: "Almendra", grams: 12.5 * 1000 },
      { code: null, name: "Canela", grams: 3000 },
    ]);
  });
});
