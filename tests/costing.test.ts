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

import { unitCostFromComponents } from "@/lib/costing";

describe("costo por receta", () => {
  const s = { ...DEFAULT_SETTINGS, mermaEmpaque: 0 };
  it("suma los insumos de una mixtura", () => {
    const cost = unitCostFromComponents(
      { grams: 123, vendtyCost: null, packagingCost: 0 },
      [{ grams: 50, costPerKg: 12000 }, { grams: 43, costPerKg: 14000 }, { grams: 30, costPerKg: 20000 }],
      s,
    );
    expect(cost).toBeCloseTo(600 + 602 + 600, 5);
  });
  it("usa el costo de Vendty si falta el de un insumo", () => {
    expect(unitCostFromComponents({ grams: 100, vendtyCost: 1500, packagingCost: 0 }, [{ grams: 100, costPerKg: 0 }], s)).toBe(1500);
  });
});
