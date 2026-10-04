import { describe, expect, it } from "vitest";
import { profitOf, quoteBulk, tierFor } from "@/lib/bulk";
import { DEFAULT_SETTINGS } from "@/lib/settings-defaults";

const s = { ...DEFAULT_SETTINGS };

describe("cotización por kilo y bulto", () => {
  it("elige el nivel por cantidad", () => {
    expect(tierFor(3, s).tier).toBe(1);
    expect(tierFor(5, s).tier).toBe(2);
    expect(tierFor(25, s).tier).toBe(3);
  });

  it("cotiza 3 kg de linaza con margen del 40 %", () => {
    // Linaza a $6.000/kg sin IVA, IVA 19 %: 6000/0,6*1,19 = 11.900/kg.
    const q = quoteBulk({ kg: 3, costPerKg: 6000, ivaRate: 0.19, retailPerKg: 20000, settings: s })!;
    expect(q.pricePerKg).toBe(11900);
    expect(q.total).toBe(36000);
    expect(q.retailTotal).toBe(60000);
    expect(q.savings).toBeCloseTo(0.4, 2);
    expect(q.floorPerKg).toBeLessThan(q.pricePerKg);
  });

  it("cotiza un bulto de chía de 25 kg con margen de bulto", () => {
    const q = quoteBulk({ kg: 25, costPerKg: 12000, ivaRate: 0, retailPerKg: 40000, settings: s })!;
    expect(q.tier).toBe(3);
    expect(q.pricePerKg).toBe(16000); // 12000/0,75
    expect(q.total).toBe(400000);
  });

  it("nunca cobra más que en bolsas", () => {
    const q = quoteBulk({ kg: 2, costPerKg: 10000, ivaRate: 0, retailPerKg: 15000, settings: s })!;
    expect(q.cappedByRetail).toBe(true);
    expect(q.pricePerKg).toBeLessThanOrEqual(15000);
  });

  it("sin costo no cotiza", () => {
    expect(quoteBulk({ kg: 3, costPerKg: 0, ivaRate: 0, retailPerKg: null, settings: s })).toBeNull();
  });
});

describe("utilidad", () => {
  it("bulto de chía: $595.000 con IVA 19 % y costo $15.200/kg", () => {
    const u = profitOf(595000, 0.19, 15200 * 25);
    expect(u.net).toBeCloseTo(500000, 0);
    expect(u.profit).toBeCloseTo(120000, 0);
    expect(u.margin).toBeCloseTo(0.24, 3);
    expect(u.markup).toBeCloseTo(0.3158, 3);
  });
});
