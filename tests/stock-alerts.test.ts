import { describe, expect, it } from "vitest";
import { bagAlert, rawAlert } from "@/lib/stock-alert-rules";

describe("alerta de bolsas", () => {
  it("agotado cuando no hay", () => {
    expect(bagAlert(0, 2, 3, 7)).toEqual({ level: "agotado", days: 0 });
    expect(bagAlert(-1, 0, 3, 7)?.level).toBe("agotado");
  });
  it("bajo cuando quedan pocas unidades", () => {
    expect(bagAlert(3, 0, 3, 7)?.level).toBe("bajo");
    expect(bagAlert(4, 0, 3, 7)).toBeNull();
  });
  it("bajo cuando al ritmo de venta alcanza para menos de 7 días", () => {
    expect(bagAlert(10, 2, 3, 7)).toEqual({ level: "bajo", days: 5 });
    expect(bagAlert(20, 2, 3, 7)).toBeNull();
  });
});

describe("alerta de insumos", () => {
  it("agotado, mínimo y cobertura", () => {
    expect(rawAlert(0, 0, 100, 14)?.level).toBe("agotado");
    expect(rawAlert(500, 500, 0, 14)?.level).toBe("bajo");
    expect(rawAlert(1000, 0, 100, 14)).toEqual({ level: "bajo", days: 10 });
    expect(rawAlert(5000, 0, 100, 14)).toBeNull();
  });
});
