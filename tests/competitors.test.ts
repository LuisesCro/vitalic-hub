import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseCompetitorFile } from "@/lib/competitors";

describe("parseCompetitorFile", () => {
  it("lee CSV con producto y precio", () => {
    const csv = 'Producto,Precio\n"Canela molida 125gr","$10,000"\n"Pistacho con cascara 250 ",22000\nSin precio,\n';
    const bytes = new TextEncoder().encode(csv);
    const rows = parseCompetitorFile(bytes);
    expect(rows).toEqual([
      { name: "Canela molida 125gr", grams: 125, priceGross: 10000 },
      { name: "Pistacho con cascara 250", grams: 250, priceGross: 22000 },
    ]);
  });
  it("usa la columna de gramos si existe", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Nombre", "Gramos", "Precio venta"], ["Comino molido", 500, 18000]]), "x");
    const rows = parseCompetitorFile(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })));
    expect(rows[0]).toEqual({ name: "Comino molido", grams: 500, priceGross: 18000 });
  });
});
