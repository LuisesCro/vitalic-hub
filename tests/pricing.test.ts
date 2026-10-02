import { describe, expect, it } from "vitest";
import { margin, recommendPrice } from "@/lib/pricing";
import { DEFAULT_SETTINGS } from "@/lib/settings-defaults";

// Valores fijos para que las pruebas no dependan de los ajustes por defecto.
const s = { ...DEFAULT_SETTINGS, margenMinimo: 0.2, margenObjetivoFrutosSecos: 0.35, margenObjetivoEspecias: 0.5, posicionCompetencia: -0.03, permitirBajarPrecios: 1 };

describe("margin", () => {
  it("calcula sobre el precio sin IVA", () => {
    expect(margin(10000, 7500)).toBeCloseTo(0.25);
    expect(margin(0, 100)).toBeNull();
  });
});

describe("recommendPrice", () => {
  it("se ubica 3% bajo el competidor más barato", () => {
    const r = recommendPrice(
      { costNet: 2000, currentPriceGross: 5000, ivaRate: 0.19, category: "Aliños", competitorPricesGross: [6000, 8000] },
      s,
    );
    expect(r.referenceGross).toBe(6000);
    expect(r.competitiveGross).toBe(6000); // 5820 redondeado a múltiplo de 500
    expect(r.rule).toBe("posicion-competitiva");
  });

  it("respeta el piso de margen mínimo", () => {
    // Macadamia 500 g: costo 40.698 sin IVA, competencia a 38.000
    const r = recommendPrice(
      { costNet: 40698, currentPriceGross: 36000, ivaRate: 0, category: "Frutos secos y semillas", competitorPricesGross: [38000] },
      s,
    );
    expect(r.floorGross).toBe(51000);
    expect(r.recommendedGross).toBe(51000);
    expect(r.rule).toBe("piso-de-margen");
    expect(r.marginAtRecommended!).toBeGreaterThanOrEqual(0.2);
  });

  it("sin competencia mantiene el precio si cumple el margen mínimo", () => {
    const r = recommendPrice(
      { costNet: 55000, currentPriceGross: 65000, ivaRate: 0, category: "General", competitorPricesGross: [] },
      s,
    );
    expect(r.recommendedGross).toBe(69000); // piso: 55000/0.8 = 68750 -> 69000
    expect(r.rule).toBe("sin-competencia-minimo");
    const ok = recommendPrice(
      { costNet: 2000, currentPriceGross: 5000, ivaRate: 0, category: "Aliños", competitorPricesGross: [] },
      s,
    );
    expect(ok.recommendedGross).toBe(5000);
    expect(ok.rule).toBe("sin-competencia");
  });

  it("no recomienda con un costo mal cargado", () => {
    const r = recommendPrice(
      { costNet: 63125, currentPriceGross: 10500, ivaRate: 0, category: "Snack", competitorPricesGross: [] },
      s,
    );
    expect(r.rule).toBe("revisar-costo");
    expect(r.recommendedGross).toBeNull();
  });

  it("producto nuevo sin precio usa el margen objetivo por categoría", () => {
    const r = recommendPrice(
      { costNet: 1000, currentPriceGross: null, ivaRate: 0, category: "Frutos secos y semillas", competitorPricesGross: [] },
      s,
    );
    expect(r.rule).toBe("margen-objetivo");
    expect(r.recommendedGross).toBe(2000); // 1000/0.65 = 1538 -> 2000
  });

  it("no baja precios cuando el ajuste lo impide", () => {
    const r = recommendPrice(
      { costNet: 1000, currentPriceGross: 9000, ivaRate: 0, category: "Aliños", competitorPricesGross: [5000] },
      { ...s, permitirBajarPrecios: 0 },
    );
    expect(r.recommendedGross).toBe(9000);
    expect(r.rule).toBe("no-bajar");
  });
});

describe("ajustes por defecto de Vitalic", () => {
  it("margen mínimo de 40% y permite bajar precios con competencia", () => {
    expect(DEFAULT_SETTINGS.margenMinimo).toBe(0.4);
    expect(DEFAULT_SETTINGS.permitirBajarPrecios).toBe(1);
    expect(DEFAULT_SETTINGS.margenObjetivoFrutosSecos).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.margenMinimo);
  });
  it("baja el precio cuando la competencia está más barata y el margen lo permite", () => {
    const r = recommendPrice(
      { costNet: 2000, currentPriceGross: 9000, ivaRate: 0, category: "Aliños", competitorPricesGross: [6000] },
      DEFAULT_SETTINGS,
    );
    expect(r.recommendedGross).toBe(6000); // 6000*0.97 = 5820 -> 6000; piso 2000/0.6 = 3334 -> 3500
    expect(r.change).toBe(-3000);
  });
  it("sin competencia no baja el precio aunque esté permitido", () => {
    const r = recommendPrice(
      { costNet: 2000, currentPriceGross: 9000, ivaRate: 0, category: "Aliños", competitorPricesGross: [] },
      DEFAULT_SETTINGS,
    );
    expect(r.recommendedGross).toBe(9000);
  });
});
