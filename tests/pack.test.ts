import { describe, expect, it } from "vitest";
import { packLabel, packRecommendation } from "@/lib/pack";

describe("packLabel", () => {
  it("reconoce bulto, caja, cojín y arroba por la descripción", () => {
    expect(packLabel("GELATINA SIN SABOR BULTO X 25 KL", null, 25)).toBe("bulto");
    expect(packLabel("CANELA ASTILLA CAJA X 10 KL", "UN", 10)).toBe("caja");
    expect(packLabel("COJIN SEMILLAS DE CHIA X", null, 2.5)).toBe("cojín");
    expect(packLabel("SAL DE AJO @ X 12.5 KL", null, 12.5)).toBe("arroba");
  });
  it("usa el peso cuando la descripción no dice el empaque", () => {
    expect(packLabel("CLAVO ENTERO X 1 KL", null, 1)).toBe("kilo");
    expect(packLabel("MANI SALADO X 500 G", null, 0.5)).toBe("bolsa");
    expect(packLabel("ALGO", null, null)).toBe("unidad");
  });
});

describe("packRecommendation", () => {
  it("redondea hacia arriba a unidades completas", () => {
    const r = packRecommendation(15, 10, "caja")!;
    expect(r.packs).toBe(2);
    expect(r.totalKg).toBe(20);
    expect(r.exact).toBe(false);
    expect(r.text).toBe("2 cajas de 10 kg = 20 kg");
  });
  it("respeta una cantidad exacta y pide mínimo una", () => {
    expect(packRecommendation(25, 25, "bulto")!.exact).toBe(true);
    expect(packRecommendation(0, 25, "bulto")!.packs).toBe(1);
  });
  it("no recomienda nada si se vende por kilo o no hay peso", () => {
    expect(packRecommendation(5, 1, "kilo")).toBeNull();
    expect(packRecommendation(5, null, "unidad")).toBeNull();
  });
});
