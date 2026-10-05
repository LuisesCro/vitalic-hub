import { describe, expect, it } from "vitest";
import { cartTotals, quickCash, settle, soldByWeight } from "@/lib/pos";

describe("caja registradora", () => {
  it("suma el carrito con IVA y separa el impuesto", () => {
    const t = cartTotals([
      { unitGross: 5000, quantity: 2, ivaRate: 0.19 },
      { unitGross: 840, quantity: 1, ivaRate: 0 },
    ]);
    expect(t.total).toBe(10840);
    expect(t.net).toBeCloseTo(10000 / 1.19 + 840, 1);
    expect(t.tax).toBeCloseTo(10840 - t.net, 1);
  });
  it("aplica descuento sobre el total", () => {
    const t = cartTotals([{ unitGross: 10000, quantity: 1, ivaRate: 0.19 }], 1000);
    expect(t.total).toBe(9000);
    expect(t.net).toBeCloseTo(9000 / 1.19, 1);
  });
  it("calcula el cambio del efectivo", () => {
    const r = settle(8500, [{ method: "efectivo", amount: 10000 }]);
    expect(r).toMatchObject({ ok: true, change: 1500, cashReceived: 10000 });
    if (r.ok) expect(r.paid).toEqual([{ method: "efectivo", amount: 8500 }]);
  });
  it("pago mixto: Nequi y el resto en efectivo", () => {
    const r = settle(20000, [{ method: "nequi", amount: 12000 }, { method: "efectivo", amount: 10000 }]);
    expect(r).toMatchObject({ ok: true, change: 2000 });
    if (r.ok) expect(r.paid).toEqual([{ method: "nequi", amount: 12000 }, { method: "efectivo", amount: 8000 }]);
  });
  it("rechaza pagos incompletos o excedidos sin efectivo", () => {
    expect(settle(5000, [{ method: "efectivo", amount: 4000 }])).toMatchObject({ ok: false });
    expect(settle(5000, [{ method: "tarjeta", amount: 6000 }])).toMatchObject({ ok: false });
    expect(settle(5000, [])).toMatchObject({ ok: false });
  });
  it("ofrece billetes rápidos", () => {
    expect(quickCash(8500)).toEqual([8500, 9000, 10000, 20000]);
  });
  it("reconoce productos por peso", () => {
    expect(soldByWeight("Canela entera x peso")).toBe(true);
    expect(soldByWeight("Almendra 125g")).toBe(false);
  });
});
