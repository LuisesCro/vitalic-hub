import { describe, expect, it } from "vitest";
import { pickSupplier, planAutoOrder, suggestOrderKg, type PriceOption } from "@/lib/auto-order";

const p = (supplierId: number, pricePerKg: number, date: string | null, extra: Partial<PriceOption> = {}): PriceOption => ({
  supplierId, supplier: `P${supplierId}`, pricePerKg, date, packKg: null, kind: "kilo", ...extra,
});
const HOY = "2026-11-05";

describe("elegir proveedor", () => {
  it("gana el más barato por kilo", () => {
    const r = pickSupplier([p(1, 40_000, "2026-10-20"), p(2, 36_000, "2026-09-01"), p(3, 38_000, "2026-10-01")], HOY);
    expect(r?.best.supplierId).toBe(2);
    expect(r?.runnerUp?.supplierId).toBe(3);
    expect(r?.last?.supplierId).toBe(1);
    expect(r?.savingPerKg).toBe(4_000);
    expect(r?.stale).toBe(false);
  });
  it("un precio viejo no le gana a uno reciente", () => {
    const r = pickSupplier([p(1, 40_000, "2026-10-20"), p(2, 20_000, "2025-12-01")], HOY);
    expect(r?.best.supplierId).toBe(1);
  });
  it("si todos son viejos usa el más barato y avisa", () => {
    const r = pickSupplier([p(1, 40_000, "2025-10-20"), p(2, 30_000, "2025-12-01")], HOY);
    expect(r?.best.supplierId).toBe(2);
    expect(r?.stale).toBe(true);
  });
  it("a igual precio gana la compra real más reciente", () => {
    const r = pickSupplier([p(1, 30_000, "2026-10-01", { reference: true }), p(2, 30_000, "2026-10-01"), p(3, 30_000, "2026-08-01")], HOY);
    expect(r?.best.supplierId).toBe(2);
  });
  it("sin precios no elige", () => {
    expect(pickSupplier([], HOY)).toBeNull();
    expect(pickSupplier([p(1, 0, HOY)], HOY)).toBeNull();
  });
  it("no hay ahorro si el último proveedor es el más barato", () => {
    expect(pickSupplier([p(1, 30_000, "2026-10-20"), p(2, 35_000, "2026-10-01")], HOY)?.savingPerKg).toBe(0);
  });
});

describe("kilos a pedir", () => {
  it("30 días de consumo menos lo que queda, de 5 en 5", () => {
    expect(suggestOrderKg(500, 2, null)).toBe(15); // 15 kg − 2 = 13 → 15
    expect(suggestOrderKg(100, 0, null)).toBe(5); // 3 kg → mínimo 5
  });
  it("sin consumo medido pide 10 kg", () => {
    expect(suggestOrderKg(0, 0, null)).toBe(10);
  });
  it("completa bultos o cajas si no se pasa mucho", () => {
    expect(suggestOrderKg(500, 0, 12.5)).toBe(12.5); // 15 → 1 caja de 12,5 (2 serían 25, demasiado)
    expect(suggestOrderKg(700, 0, 12.5)).toBe(25); // 21 → 2 cajas
    expect(suggestOrderKg(100, 0, 25)).toBe(5); // 5 kg no justifica un bulto de 25
  });
});

describe("plan del pedido", () => {
  const prices = new Map([[10, [p(1, 40_000, "2026-10-20"), p(2, 36_000, "2026-10-01")]], [11, [p(1, 9_000, "2026-10-20")]]]);
  const consumption = new Map([[10, 500], [11, 200]]);
  it("arma un renglón por insumo con el mejor proveedor", () => {
    const r = planAutoOrder(
      [{ rawMaterialId: 10, name: "Almendra", stockKg: 1, reason: "bajo" }, { rawMaterialId: 11, name: "Avena", stockKg: 0, reason: "agotado" }, { rawMaterialId: 12, name: "Cardamomo", stockKg: 0, reason: "urgente" }],
      prices, consumption, new Map(), HOY,
    );
    expect(r.lines).toEqual([
      { rawMaterialId: 10, name: "Almendra", supplierId: 2, qtyKg: 15 },
      { rawMaterialId: 11, name: "Avena", supplierId: 1, qtyKg: 10 },
    ]);
    expect(r.noSupplier.map((n) => n.name)).toEqual(["Cardamomo"]);
  });
  it("no repite lo que ya se está pidiendo, lo descartado ni lo duplicado", () => {
    const open = new Map([[10, { manualDraft: false, inFlight: true, dismissed: false, orderedRecently: false }]]);
    const r = planAutoOrder(
      [{ rawMaterialId: 10, name: "Almendra", stockKg: 1, reason: "bajo" }, { rawMaterialId: 11, name: "Avena", stockKg: 0, reason: "agotado" }, { rawMaterialId: 11, name: "Avena", stockKg: 0, reason: "urgente" }],
      prices, consumption, open, HOY,
    );
    expect(r.lines.map((l) => l.rawMaterialId)).toEqual([11]);
  });
});
