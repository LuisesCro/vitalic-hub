import { describe, expect, it } from "vitest";
import { baseName, matchRawMaterial } from "@/lib/matching";

const mats = [
  { id: 1, name: "Almendra" },
  { id: 2, name: "Almendra Laminada" },
  { id: 3, name: "Canela entera" },
];

describe("matching", () => {
  it("quita el peso", () => {
    expect(baseName("Almendra Laminada  125g")).toBe("almendra laminada");
    expect(baseName("Linaza 20g – Paquete de 10 und")).toBe("linaza");
  });
  it("elige el insumo más específico", () => {
    expect(matchRawMaterial("Almendra Laminada 500g", mats)?.id).toBe(2);
    expect(matchRawMaterial("ALMENDRA ENTERA CAJA X 22,68 KG", mats)?.id).toBe(1);
    expect(matchRawMaterial("Canela entera x peso", mats)?.id).toBe(3);
    expect(matchRawMaterial("Pistacho 125g", mats)).toBeNull();
  });
});

import { matchProduct } from "@/lib/matching";

describe("matchProduct", () => {
  const products = [
    { id: 1, name: "Canela molida 125g", grams: 125 },
    { id: 2, name: "Canela molida 500g", grams: 500 },
    { id: 3, name: "Canela entera 125g", grams: 125 },
  ];
  it("empareja por nombre y peso", () => {
    expect(matchProduct("Canela molida 500 gr", 500, products)?.id).toBe(2);
    expect(matchProduct("Canela entera 125gr", 125, products)?.id).toBe(3);
    expect(matchProduct("Canela molida 250 gr", 250, products)).toBeNull();
    expect(matchProduct("Canela molida", null, products)).toBeNull();
  });
});
