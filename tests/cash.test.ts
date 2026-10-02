import { describe, expect, it } from "vitest";
import { differenceStatus, expectedCash, parsePesos, sumDenominations, totalSales, vendtyMethodKey } from "@/lib/cash";

describe("cuadre de caja", () => {
  it("suma billetes y monedas", () => {
    expect(sumDenominations({ "100000": 2, "50000": 1, "500": 3, "x": 9 })).toBe(251500);
  });

  it("calcula el efectivo esperado con base, ventas y movimientos", () => {
    const movements = [
      { kind: "egreso", amount: 80000 },
      { kind: "retiro", amount: 200000 },
      { kind: "ingreso", amount: 50000 },
      { kind: "desconocido", amount: 999 },
    ];
    expect(expectedCash(150000, 620000, movements)).toBe(150000 + 620000 - 80000 - 200000 + 50000);
  });

  it("clasifica la diferencia con tolerancia de monedas", () => {
    expect(differenceStatus(300)).toBe("cuadra");
    expect(differenceStatus(-2000)).toBe("falta");
    expect(differenceStatus(5000)).toBe("sobra");
  });

  it("suma ventas de todos los medios", () => {
    expect(totalSales({ salesCash: 1, salesCard: 2, salesNequi: 3, salesDaviplata: 4, salesTransfer: 5, salesOther: 6 })).toBe(21);
  });

  it("lleva las formas de pago de Vendty al cuadre", () => {
    expect(vendtyMethodKey("efectivo")).toBe("salesCash");
    expect(vendtyMethodKey("tarjeta_debito")).toBe("salesCard");
    expect(vendtyMethodKey("tarjeta_credito")).toBe("salesCard");
    expect(vendtyMethodKey("Nequi")).toBe("salesNequi");
    expect(vendtyMethodKey("efectivo,Nequi")).toBeNull();
    expect(vendtyMethodKey(null)).toBeNull();
  });

  it("lee montos escritos con puntos", () => {
    expect(parsePesos("1.250.000")).toBe(1250000);
    expect(parsePesos("$ 35.000")).toBe(35000);
    expect(parsePesos(null)).toBe(0);
  });
});
