import { describe, expect, it } from "vitest";
import { gramsFromName, kgPerInvoiceUnit, normalize } from "@/lib/units";

describe("gramsFromName", () => {
  it("lee gramos y kilos", () => {
    expect(gramsFromName("Almendra Laminada  125g")).toBe(125);
    expect(gramsFromName("Nuez pecan 500 gr")).toBe(500);
    expect(gramsFromName("Glutamato 1 kg")).toBe(1000);
  });
  it("multiplica paquetes", () => {
    expect(gramsFromName("Linaza 20g – Paquete de 10 und")).toBe(200);
  });
  it("devuelve null sin peso", () => {
    expect(gramsFromName("Canela entera x peso")).toBeNull();
    expect(gramsFromName("Nuez moscada entera 2 pepitas")).toBeNull();
  });
});

describe("kgPerInvoiceUnit", () => {
  it("usa el código de unidad DIAN", () => {
    expect(kgPerInvoiceUnit("ALMENDRA", "KGM")).toBe(1);
    expect(kgPerInvoiceUnit("ALMENDRA", "LBR")).toBe(0.5);
  });
  it("lee el peso en la descripción", () => {
    expect(kgPerInvoiceUnit("ALMENDRA NONPAREIL CAJA 22,68 KG", "NIU")).toBeCloseTo(22.68);
    expect(kgPerInvoiceUnit("GRANOLA 450G", "94")).toBeCloseTo(0.45);
  });
  it("entiende arroba y libra", () => {
    expect(kgPerInvoiceUnit("ARROBA MANI SIMPLE", "NIU")).toBe(12.5);
    expect(kgPerInvoiceUnit("COLOR SUPER ARROBA", null)).toBe(12.5);
    expect(kgPerInvoiceUnit("PISTACHO LIBRA", null)).toBe(0.5);
    expect(kgPerInvoiceUnit("COJIN SEMILLAS DE CHIA", null)).toBeNull();
  });
  it("normaliza tildes", () => {
    expect(normalize("Marañón  Tostado")).toBe("maranon tostado");
  });
});
