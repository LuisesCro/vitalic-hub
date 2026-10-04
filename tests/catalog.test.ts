import { describe, expect, it } from "vitest";
import {
  detectFormat, familyKey, familyNameOf, marginOf, materialCost, papeletaMaxGrams, parseVendtyCompounds,
  priceForMargin, proportionsFrom, skuFor, splitRecipe,
} from "@/lib/catalog";
import fs from "node:fs";

describe("catálogo", () => {
  it("saca el nombre de la familia", () => {
    expect(familyNameOf("Almendra Laminada  250g")).toBe("Almendra Laminada");
    expect(familyNameOf("Mixtura Premium Vitalic 125gr")).toBe("Mixtura Premium Vitalic");
    expect(familyNameOf("Comino grano 10g – Paquete de 10 und")).toBe("Comino grano");
    expect(familyNameOf("Polvo de hornear * 20g")).toBe("Polvo de hornear");
    expect(familyNameOf("Albaricoque X Peso")).toBe("Albaricoque");
    expect(familyKey("Anís estrellado 20g")).toBe(familyKey("Anis Estrellado 125g"));
  });

  it("reconoce papeletas", () => {
    expect(detectFormat(1000, 20)).toBe("papeleta");
    expect(detectFormat(4200, 125)).toBe("bolsa");
    expect(detectFormat(1000, null)).toBe("unidad");
  });

  it("crea SKU únicos", () => {
    const taken = new Set(["VTL-ALMENDRA-125G"]);
    expect(skuFor("Almendra", 125, "bolsa", taken)).toBe("VTL-ALMENDRA-125G-2");
    expect(skuFor("Pimienta negra", 20, "papeleta", new Set())).toBe("VTL-PIMIENTANE-PAP20G");
  });

  it("reparte la receta en cada tamaño y cuadra el total", () => {
    const recipe = [{ rawMaterialId: 1, parts: 40 }, { rawMaterialId: 2, parts: 35 }, { rawMaterialId: 3, parts: 25 }];
    const r125 = splitRecipe(recipe, 125);
    expect(r125.reduce((t, c) => t + c.grams, 0)).toBe(125);
    expect(r125.find((c) => c.rawMaterialId === 1)!.grams).toBe(50);
    expect(splitRecipe(recipe, 1000).map((c) => c.grams)).toEqual([400, 350, 250]);
    expect(proportionsFrom([{ rawMaterialId: 1, grams: 50 }, { rawMaterialId: 2, grams: 50 }])).toEqual([
      { rawMaterialId: 1, parts: 50 }, { rawMaterialId: 2, parts: 50 },
    ]);
  });

  it("calcula costo, margen y precio sugerido", () => {
    const cost = materialCost([{ grams: 100, costPerKg: 30000 }, { grams: 25, costPerKg: 20000 }], 0);
    expect(cost).toBe(3500);
    expect(materialCost([{ grams: 100, costPerKg: 0 }], 0)).toBeNull();
    expect(marginOf(5950, 0.19, 3000)).toBeCloseTo(0.4, 2);
    expect(priceForMargin(3000, 0.19, 0.4, 100)).toBe(6000);
  });

  it("dice cuántos gramos caben en una papeleta de $1.000", () => {
    // $1.000 con IVA 19 % = $840 sin IVA; 60 % para costo = $504; pimienta a $40.000/kg → 12,5 g.
    expect(papeletaMaxGrams({ priceGross: 1000, ivaRate: 0.19, costPerKg: 40000, minMargin: 0.4, packagingCost: 0, merma: 0 })).toBe(12.5);
    expect(papeletaMaxGrams({ priceGross: 1000, ivaRate: 0.19, costPerKg: 0, minMargin: 0.4, packagingCost: 0, merma: 0 })).toBeNull();
  });

  it("lee las recetas de Vendty", () => {
    const text = [
      "Nombre producto\tPrecio de compra\tPrecio de venta\tIngredientes\tunidad de medida",
      "Mani Mixtura dulce Vitalic 125g\t1493.2\t2521.01\t",
      "50Mani salado", "43Mani dulce", "30Uvas pasas", "unidad",
      "Acacia entero 20g\t100\t840.33\t", "10Acacia entero", "unidad",
    ].join("\n");
    const out = parseVendtyCompounds(text);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ name: "Mani Mixtura dulce Vitalic 125g", components: [
      { grams: 50, ingredient: "Mani salado" }, { grams: 43, ingredient: "Mani dulce" }, { grams: 30, ingredient: "Uvas pasas" },
    ] });
    expect(out[1].components).toEqual([{ grams: 10, ingredient: "Acacia entero" }]);
  });

  it("lee el informe completo de Vendty", () => {
    const file = "/tmp/claude-0/-home-user-Sophie-ads/6763d6d8-c1a2-506d-b5ec-b08e9de259bf/scratchpad/compuestos.txt";
    if (!fs.existsSync(file)) return;
    const out = parseVendtyCompounds(fs.readFileSync(file, "utf8"));
    expect(out.length).toBeGreaterThan(250);
    const premium = out.find((c) => c.name.startsWith("Mixtura Premium Vitalic 125"));
    expect(premium?.components).toHaveLength(6);
  });
});
