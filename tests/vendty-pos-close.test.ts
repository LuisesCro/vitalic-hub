import { describe, expect, it } from "vitest";
import { isPosClose, parsePosClose, type PdfText } from "@/lib/vendty-pos-close";

const t = (s: string, x: number, y: number): PdfText => ({ s, x, y });

// Posiciones tomadas de un cierre real de Vendty POS: cada celda parte su texto en varias líneas.
const page1: PdfText[] = [
  t("Cierre de Caja No. 319", 270, 724), t("Fecha Apertura:", 134, 711), t("2026-10-04", 184, 711),
  t("Desde:", 237, 686), t("- Total:", 343, 686), t("15", 367, 686),
  t("Productos", 286, 662),
  t("Código", 232, 641), t("Ref", 287, 641), t("Cant", 329, 641), t("Precio", 354, 641),
  t("sin codigo", 242, 629), t("ajonjoli 125g", 238, 621), t("Ajonjoli", 294, 629), t("125g", 298, 621), t("1", 335, 625), t("2,800", 356, 625),
  t("VTL-FSS-", 242, 608), t("ALMEND-125G", 233, 600), t("Almendra", 291, 608), t("125g", 298, 600), t("2", 335, 604), t("16,000", 354, 604),
  t("https://pos.vendty.com/index.php/caja/listado_cierres", 100, 590), t("6/10/26, 5:11 p.m.", 20, 585),
  t("Total Devoluciones con Nota Crédito", 250, 520),
  t("Formas de pago", 280, 300),
  t("9", 180, 280), t("Efectivo", 230, 280), t("$ (+) 14,800", 430, 280),
  t("Total", 180, 260), t("$ 18,800", 430, 260),
  t("Concepto", 200, 200), t("(+) Total de apertura", 200, 180), t("$ 200,000", 430, 180),
  t("Valor ingresado por cajero", 200, 160), t("$ 214,800", 430, 160),
];

describe("cierre numerado de Vendty POS", () => {
  it("reconoce el formato y lee productos, pagos y arqueo", () => {
    expect(isPosClose([page1])).toBe(true);
    const c = parsePosClose([page1])!;
    expect(c).toMatchObject({ number: 319, date: "2026-10-04", salesCount: 15, total: 18800, opening: 200000, countedCash: 214800 });
    expect(c.payments).toEqual({ efectivo: 14800 });
    expect(c.items).toEqual([
      { code: "sin codigo ajonjoli 125g", name: "Ajonjoli 125g", quantity: 1, value: 2800 },
      { code: "VTL-FSS-ALMEND-125G", name: "Almendra 125g", quantity: 2, value: 16000 },
    ]);
  });

  it("no confunde un cierre del formato anterior", () => {
    expect(isPosClose([[t("Cierre de Caja:", 50, 700)]])).toBe(false);
  });
});
