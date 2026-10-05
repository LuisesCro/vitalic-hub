import { PageHeader } from "@/components/ui";
import { PrintTicket } from "@/components/ticket";
import { fmtCOP, todayISO } from "@/lib/format";
import { POS_METHODS } from "@/lib/pos";
import { requireSession } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { quoteItems, toPublic } from "../caja/cotizar/data";
import { voidSale } from "./actions";
import { posProducts, todaySales } from "./data";
import { PosTerminal } from "./terminal";
import { ReturnForm } from "./return-form";

export const metadata = { title: "Vender · Vitalic Hub" };

export default async function VenderPage() {
  const session = await requireSession();
  const today = todayISO();
  const settings = await getSettings();
  const { all, quick } = await posProducts();
  const bulkItems = toPublic(await quoteItems(), settings, false);
  const sales = await todaySales(today);
  const valid = sales.filter((s) => s.status === "vigente");
  const soldCount = valid.filter((s) => !s.returnOf).length;
  const sold = valid.reduce((t, s) => t + s.total, 0);
  return (
    <div className="space-y-4">
      <PageHeader title="Vender" subtitle={`Hoy: ${soldCount} ventas por ${fmtCOP(sold)}`} />
      <PosTerminal products={all} quick={quick} isAdmin={session.role === "admin"} bulkItems={bulkItems} settings={settings} />
      {sales.length > 0 && (
        <section className="card overflow-x-auto sm:overflow-visible">
          <h2 className="mb-2 font-semibold">Ventas de hoy</h2>
          <table className="table-base">
            <thead><tr><th>Recibo</th><th>Hora</th><th className="text-right">Total</th><th>Pago</th><th>Atendió</th><th /></tr></thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className={s.status === "anulada" ? "opacity-50 line-through" : ""}>
                  <td>{s.number}{s.returnOf && <span className="block text-xs text-muted">Devolución de V-{s.returnOf}</span>}</td><td>{s.time}</td><td className="text-right">{fmtCOP(s.total)}</td>
                  <td>{s.payments.map((p) => POS_METHODS[p.method] ?? p.method).join(" + ")}</td>
                  <td>{s.seller ?? "—"}</td>
                  <td className="space-x-2 whitespace-nowrap">
                    {s.status === "vigente" && <PrintTicket data={s.ticket} label="Reimprimir" className="text-sm underline" />}
                    {s.status === "vigente" && !s.returnOf && s.lines.some((l) => l.quantity - l.returned > 0) && (
                      <ReturnForm
                        saleId={s.id} number={s.number} lines={s.lines} defaultMethod={s.payments.find((p) => p.amount > 0)?.method ?? "efectivo"}
                        maxRefund={session.role === "admin" ? undefined : settings.devolucionMaxCajera}
                      />
                    )}
                    {s.status === "vigente" && session.role === "admin" && !s.returnOf && !s.hasReturns && (
                      <form action={voidSale} className="inline">
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="reason" value="Anulada desde ventas del día" />
                        <button className="text-sm text-muted underline">Anular</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
