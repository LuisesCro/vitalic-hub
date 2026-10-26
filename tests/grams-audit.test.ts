import { describe, expect, it } from "vitest";
import { auditGrams, gramsFromSku } from "@/lib/grams-audit";

describe("gramos del código", () => {
  it("lee gramos y kilos", () => {
    expect(gramsFromSku("VTL-ACE-AJI-500G")).toBe(500);
    expect(gramsFromSku("VTL-FSS-ALMEND-1KG")).toBe(1000);
    expect(gramsFromSku("sin codigo hojuela miel 500g")).toBe(500);
    expect(gramsFromSku("VTL-ACE-CANENT-1A")).toBeNull();
    expect(gramsFromSku("VTL-ACE-CANMOL-10G-P10")).toBe(100);
  });
});

describe("revisión de gramos", () => {
  const base = { id: 1, name: "X", sku: "SKU", format: "bolsa", grams: 500, recipeGrams: 500 };
  it("no marca lo que coincide", () => {
    expect(auditGrams({ ...base, name: "Almendra 500g", sku: "VTL-A-ALM-500G" })).toBeNull();
  });
  it("hojuela con 1 g pero 500 g en el código y 1 g en la receta", () => {
    const r = auditGrams({ ...base, name: "Hojuela Mixta Miel de Caña", sku: "sin codigo hojuela miel 500g", grams: 1, recipeGrams: 1 });
    expect(r?.reasons.join()).toContain("500");
    expect(r?.suggested).toBe(500);
  });
  it("nombre y código coinciden y la ficha no: sugiere ese valor", () => {
    const r = auditGrams({ ...base, name: "Linaza 250g", sku: "VTL-A-LIN-250G", grams: 125, recipeGrams: 125 });
    expect(r?.suggested).toBe(250);
  });
  it("un código mal escrito no marca si el nombre coincide con lo guardado", () => {
    expect(auditGrams({ ...base, name: "Propoleo en miel 280g", sku: "sc propoleo en miel 28 g", grams: 280, recipeGrams: null })).toBeNull();
  });
  it("paquete de 10: 10 g por 10 son 100 g", () => {
    expect(auditGrams({ ...base, name: "Color 10g – Paquete de 10 und", sku: "VTL-ACE-COLOR-10G-P10", grams: 100, recipeGrams: 100 })).toBeNull();
    expect(auditGrams({ ...base, name: "Paprika 10g – Paquete de 10 und", sku: "VTL-ACE-PAPRIK-10G-P10", grams: 150, recipeGrams: 150 })?.suggested).toBe(100);
  });
  it("los sachets solo se comparan con su receta", () => {
    expect(auditGrams({ ...base, format: "sachet", name: "Ají sachet", sku: "VTL-X-SACHET", grams: 20, recipeGrams: 20 })).toBeNull();
    expect(auditGrams({ ...base, format: "sachet", name: "Ají sachet", sku: "VTL-X-SACHET", grams: 20, recipeGrams: 5 })?.reasons[0]).toContain("5");
  });
});
