import { describe, expect, it } from "vitest";
import { parseVendtyClose } from "@/lib/vendty-close";

describe("cierre de caja de Vendty", () => {
  it("lee medios de pago y productos", () => {
    const text = [
      "VITALIC S.A.S", "Cierre de Caja:", "Fecha: 2026-10-02", "Tipo: Producto", "# Forma de pago Valor",
      "17 Efectivo 346,420", "6 Nequi 613,500", "1 Tarjeta debito 50,700", "2 Tarjeta credito 61,800", "26 Total ventas 1,072,420",
      "Resumen de Productos Vendidos", "Descripción Cantidad Descuento Valor a Pagar",
      "Anís estrellado 20g 1 0 1,000", "Canela entera x peso 266 0 31,920", "Anís estrellado 500g 2 3,782 70,000",
    ].join("\n");
    const c = parseVendtyClose(text)!;
    expect(c.date).toBe("2026-10-02");
    expect(c.salesCount).toBe(26);
    expect(c.total).toBe(1072420);
    expect(c.payments).toMatchObject({ efectivo: 346420, nequi: 613500, "tarjeta debito": 50700, "tarjeta credito": 61800 });
    expect(c.items).toEqual([
      { name: "Anís estrellado 20g", quantity: 1, discount: 0, value: 1000 },
      { name: "Canela entera x peso", quantity: 266, discount: 0, value: 31920 },
      { name: "Anís estrellado 500g", quantity: 2, discount: 3782, value: 70000 },
    ]);
  });
});
