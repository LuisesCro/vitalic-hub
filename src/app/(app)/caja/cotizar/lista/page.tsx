import Link from "next/link";
import { BUSINESS } from "@/lib/business";
import { fmtCOP, fmtPct, todayISO } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { wholesaleList } from "../data";
import { PrintReport } from "../../cierre/print-button";

export const metadata = { title: "Lista de precios al por mayor · Vitalic Hub" };

const longDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
const addDays = (iso: string, n: number) => new Date(new Date(iso + "T12:00:00").getTime() + n * 864e5).toISOString().slice(0, 10);
const keep = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties;

export default async function ListaMayoristaPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  await requireAdmin();
  const { cliente } = await searchParams;
  const s = await getSettings();
  const { groups, units, belowFloor, belowCost } = await wholesaleList(s);
  const client = (cliente ?? "").trim().slice(0, 80);
  const today = todayISO();
  const d2 = Math.round(s.descuentoMayorista2 * 100), d3 = Math.round(s.descuentoMayorista3 * 100);
  const total = groups.reduce((t, g) => t + g.rows.length, 0) + units.length;

  return (
    <div className="mx-auto max-w-3xl print:max-w-none" style={{ fontFamily: "var(--font-brand)" }}>
      <div className="mb-4 space-y-3 print:hidden">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <form className="flex items-end gap-2">
            <label><span className="label">Cliente (opcional)</span><input name="cliente" defaultValue={client} className="input" placeholder="Nombre del cliente" /></label>
            <button className="btn-secondary">Poner</button>
          </form>
          <div className="flex gap-2">
            <Link href="/caja/cotizar" className="btn-secondary">← Cotizar</Link>
            <a href="/caja/cotizar/lista/csv" className="btn-secondary">Descargar Excel (CSV)</a>
            <PrintReport />
          </div>
        </div>
        {(belowFloor.length > 0 || belowCost.length > 0) && (
          <div className="rounded-lg border border-[var(--border)] p-3 text-xs">
            <p className="font-semibold">Solo para ti (no sale en el PDF): con {d3} % de descuento hay productos que quedan por debajo de tu margen.</p>
            {belowCost.length > 0 && <p className="mt-1"><strong style={{ color: "var(--bad)" }}>Por debajo del costo ({belowCost.length}):</strong> {belowCost.join(", ")}.</p>}
            {belowFloor.length > 0 && <p className="mt-1"><strong style={{ color: "var(--warn)" }}>Bajo el piso de margen de {fmtPct(s.margenGranelPiso)} ({belowFloor.length}):</strong> {belowFloor.join(", ")}.</p>}
          </div>
        )}
      </div>

      <div className="bg-white text-black">
        <header className="px-6 py-5 text-white" style={{ background: "var(--color-brand-500)", ...keep }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/vitalic-horizontal-blanco.svg" alt="Vitalic" className="h-12 w-auto" />
            <div className="text-right">
              <p className="text-xl font-bold leading-tight">Lista de precios<br />al por mayor</p>
            </div>
          </div>
          <p className="mt-2 text-xs opacity-90">Distribuidora de frutos secos, especias y condimentos</p>
        </header>
        <div className="h-1.5" style={{ background: "var(--color-leaf-500)", ...keep }} />

        <section className="grid gap-x-6 gap-y-1 px-6 py-3 text-xs sm:grid-cols-2" style={{ background: "var(--color-brand-50)", ...keep }}>
          <p><strong>Para:</strong> {client || "—"}</p>
          <p><strong>Fecha:</strong> {longDate(today)}</p>
          <p><strong>Válida hasta:</strong> {longDate(addDays(today, s.cotizacionValidezDias))}</p>
          <p><strong>Precios:</strong> en pesos colombianos, con IVA incluido</p>
        </section>

        <section className="grid gap-3 px-6 py-3 text-xs sm:grid-cols-3">
          <div className="rounded-lg border p-2" style={{ borderColor: "var(--color-brand-200)" }}><p className="font-bold" style={{ color: "var(--color-brand-700)" }}>Desde {s.granelDesdeKg2} kg</p><p>{d2} % de descuento sobre el precio por kilo en bolsa.</p></div>
          <div className="rounded-lg border p-2" style={{ borderColor: "var(--color-brand-200)" }}><p className="font-bold" style={{ color: "var(--color-brand-700)" }}>Desde {s.granelDesdeKg3} kg</p><p>{d3} % de descuento sobre el precio por kilo en bolsa.</p></div>
          <div className="rounded-lg border p-2" style={{ borderColor: "var(--color-brand-200)" }}><p className="font-bold" style={{ color: "var(--color-brand-700)" }}>Cómo pedir</p><p>Escríbenos con los productos y las cantidades: {BUSINESS.phone}.</p></div>
        </section>

        <div className="px-6 pb-2">
          {groups.map((g) => (
            <section key={g.category} className="mt-4">
              <h2 className="break-after-avoid rounded-md px-3 py-1 text-sm font-bold text-white" style={{ background: "var(--color-brand-600)", ...keep }}>{g.category}</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left" style={{ color: "var(--color-brand-800)" }}>
                    <th className="py-1 pl-1">Producto</th><th>Código</th>
                    <th className="text-right">Por kilo<br />en bolsa</th>
                    <th className="text-right">Desde {s.granelDesdeKg2} kg<br />(-{d2} %)</th>
                    <th className="pr-1 text-right">Desde {s.granelDesdeKg3} kg<br />(-{d3} %)</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r, i) => (
                    <tr key={r.code + r.name} className="break-inside-avoid" style={{ background: i % 2 ? "var(--color-brand-50)" : "transparent", ...keep }}>
                      <td className="py-0.5 pl-1 pr-2 font-medium">{r.name}</td>
                      <td className="pr-2 text-[10px] text-neutral-500">{r.code}</td>
                      <td className="text-right tabular-nums">{fmtCOP(r.retailPerKg)}</td>
                      <td className="text-right font-semibold tabular-nums">{fmtCOP(r.fromKg2)}</td>
                      <td className="pr-1 text-right font-bold tabular-nums" style={{ color: "var(--color-brand-700)" }}>{fmtCOP(r.fromKg3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}

          {units.length > 0 && (
            <section className="mt-4">
              <h2 className="break-after-avoid rounded-md px-3 py-1 text-sm font-bold text-white" style={{ background: "var(--color-brand-600)", ...keep }}>Productos por unidad</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left" style={{ color: "var(--color-brand-800)" }}>
                    <th className="py-1 pl-1">Producto</th><th>Código</th>
                    <th className="text-right">Por unidad</th>
                    <th className="text-right">Desde {s.granelDesdeKg2} und<br />(-{d2} %)</th>
                    <th className="pr-1 text-right">Desde {s.granelDesdeKg3} und<br />(-{d3} %)</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((r, i) => (
                    <tr key={r.code + r.name} className="break-inside-avoid" style={{ background: i % 2 ? "var(--color-brand-50)" : "transparent", ...keep }}>
                      <td className="py-0.5 pl-1 pr-2 font-medium">{r.name}</td>
                      <td className="pr-2 text-[10px] text-neutral-500">{r.code}</td>
                      <td className="text-right tabular-nums">{fmtCOP(r.unitPrice)}</td>
                      <td className="text-right font-semibold tabular-nums">{fmtCOP(r.from2)}</td>
                      <td className="pr-1 text-right font-bold tabular-nums" style={{ color: "var(--color-brand-700)" }}>{fmtCOP(r.from3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <footer className="mt-4 break-inside-avoid px-6 pb-5 text-[11px]">
          <div className="h-1" style={{ background: "var(--color-leaf-500)", ...keep }} />
          <p className="mt-2 text-neutral-700">
            El precio por cantidad aplica a un mismo producto. Forma de pago, entrega y disponibilidad: se confirman con el pedido. Los precios están vigentes hasta la fecha indicada y pueden cambiar después.
            {` ${total} productos.`}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-white" style={{ background: "var(--color-brand-600)", ...keep }}>
            <span className="font-bold">Vitalic · NIT {BUSINESS.nit}</span>
            <span>{BUSINESS.address}, {BUSINESS.city} · {BUSINESS.phone} · {BUSINESS.email} · {BUSINESS.instagram}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
