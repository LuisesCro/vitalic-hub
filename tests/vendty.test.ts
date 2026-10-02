import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseVendtyProducts, parseVendtyTransactions, toNumber } from "@/lib/vendty";

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
