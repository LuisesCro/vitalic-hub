import { describe, expect, it } from "vitest";
import { daysUntil, payStatus } from "@/lib/payables";

describe("cuentas por pagar", () => {
  const today = "2026-10-15";
  it("factura sin pagos y sin vencer", () => {
    expect(payStatus(994578, 0, "2026-10-24", today)).toEqual({ status: "pendiente", balance: 994578, daysOverdue: 0 });
  });
  it("abono parcial", () => {
    expect(payStatus(994578, 500000, "2026-10-24", today)).toMatchObject({ status: "abonada", balance: 494578 });
  });
  it("vencida con días de atraso", () => {
    expect(payStatus(994578, 500000, "2026-10-10", today)).toMatchObject({ status: "vencida", daysOverdue: 5 });
  });
  it("pagada, tolerando redondeos", () => {
    expect(payStatus(994578, 994550, "2026-10-10", today).status).toBe("pagada");
  });
  it("días para vencer", () => {
    expect(daysUntil("2026-10-24", today)).toBe(9);
    expect(daysUntil(null, today)).toBeNull();
  });
});
