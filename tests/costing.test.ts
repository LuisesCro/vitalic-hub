import { describe, expect, it } from "vitest";
import { unitCost } from "@/lib/costing";
import { DEFAULT_SETTINGS } from "@/lib/settings-defaults";

const s = { ...DEFAULT_SETTINGS, mermaEmpaque: 0 };

describe("unitCost", () => {
  it("usa el costo promedio del insumo", () => {
    expect(unitCost({ grams: 500, vendtyCost: 20000, packagingCost: 0 }, 38000, s)).toBe(19000);
  });
  it("cae al costo de Vendty si el insumo está mal cargado", () => {
    expect(unitCost({ grams: 500, vendtyCost: 4500, packagingCost: 0 }, 4_545_000, s)).toBe(4500);
  });
  it("suma el empaque por tamaño", () => {
    expect(unitCost({ grams: 125, vendtyCost: null, packagingCost: 0 }, 40000, { ...s, empaqueHasta150g: 300 })).toBe(5300);
  });
});
