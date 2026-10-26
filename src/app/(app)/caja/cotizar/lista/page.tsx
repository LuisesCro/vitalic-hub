import Link from "next/link";
import { fmtCOP, fmtPct, todayISO } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { wholesaleList } from "../data";
import { PrintReport } from "../../cierre/print-button";

export const metadata = { title: "Lista de precios al por mayor · Vitalic Hub" };

export default async function ListaMayoristaPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  await requireAdmin();
  const { cliente } = await searchParams;
  const s = await getSettings();
  const { rows, excluded } = await wholesaleList(s);
  const client = (cliente ?? "").trim().slice(0, 80);
  const date = new Date(todayISO() + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-3xl bg-white p-4 text-black print:p-0 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2 print:hidden">
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

      <header className="text-center">
        <p className="text-base font-bold">VITALIC S.A.S</p>
        <p className="text-xs">NIT: 901967570-5 · Alameda, Cali</p>
        <p className="mt-1 text-sm font-bold">Lista de precios al por mayor</p>
        <p className="text-xs">{client ? `Para: ${client} · ` : ""}{date}</p>
      </header>

      <table className="mt-4 w-full text-xs">
        <thead>
          <tr className="border-b border-black/40 text-left">
            <th className="py-1">Producto</th>
            <th className="text-right">Precio en bolsa<br />por kilo</th>
            <th className="text-right">Desde {s.granelDesdeKg2} kg<br />por kilo</th>
            <th className="text-right">Dcto.</th>
            <th className="text-right">Desde {s.granelDesdeKg3} kg<br />por kilo</th>
            <th className="text-right">Dcto.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="break-inside-avoid border-b border-black/10">
              <td className="py-0.5 pr-2">{r.name}</td>
              <td className="text-right tabular-nums">{r.retailPerKg ? fmtCOP(r.retailPerKg) : "—"}</td>
              <td className="text-right font-semibold tabular-nums">{fmtCOP(r.fromKg2)}</td>
              <td className="text-right tabular-nums">{r.discount2 ? fmtPct(r.discount2) : "—"}</td>
              <td className="text-right font-semibold tabular-nums">{fmtCOP(r.fromKg3)}</td>
              <td className="text-right tabular-nums">{r.discount3 ? fmtPct(r.discount3) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {excluded.length > 0 && (
        <p className="mt-4 rounded-lg border border-[var(--border)] p-3 text-xs print:hidden">
          <strong>No salen en la lista ({excluded.length}):</strong> su precio en bolsa ya está en el piso de margen y no se puede dar descuento por cantidad sin bajar del {fmtPct(s.margenGranelPiso)} de margen. {excluded.join(", ")}.
        </p>
      )}
      <p className="mt-3 text-[11px]">
        Precios por kilo con IVA incluido. El descuento es frente al precio por kilo de la bolsa más grande. El precio por cantidad aplica al comprar {s.granelDesdeKg2} kg o más
        de un mismo producto y el de bulto desde {s.granelDesdeKg3} kg. Los precios pueden cambiar sin previo aviso; consulta disponibilidad antes de confirmar el pedido.
      </p>
    </div>
  );
}
