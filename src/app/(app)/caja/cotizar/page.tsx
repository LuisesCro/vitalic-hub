import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bulkSales, productFamilies, users } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { fmtCOP } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { cancelBulkSale } from "./actions";
import { quoteItems, toPublic } from "./data";
import { QuoteTool } from "./quote-tool";

export const metadata = { title: "Cotizar · Vitalic Hub" };

export default async function CotizarPage() {
  const session = await requireSession();
  const settings = await getSettings();
  const items = await quoteItems();
  const recent = await db
    .select({ s: bulkSales, name: productFamilies.name, by: users.name })
    .from(bulkSales)
    .innerJoin(productFamilies, eq(bulkSales.familyId, productFamilies.id))
    .leftJoin(users, eq(bulkSales.createdBy, users.id))
    .orderBy(desc(bulkSales.createdAt))
    .limit(15);
  return (
    <div className="space-y-4">
      <PageHeader title="Cotizar por kilo o bulto" subtitle="Para cuando un cliente pregunta cuánto le deja 3 kg de linaza o un bulto de chía.">
        <Link href="/caja" className="btn-secondary">← Caja</Link>
      </PageHeader>
      <QuoteTool items={toPublic(items, settings, session.role === "admin")} settings={settings} isAdmin={session.role === "admin"} />
      {recent.length > 0 && (
        <section className="card overflow-x-auto">
          <h2 className="mb-2 font-semibold">Últimas ventas a granel</h2>
          <table className="table-base">
            <thead><tr><th>Fecha</th><th>Producto</th><th className="text-right">Kg</th><th className="text-right">Valor</th><th className="text-right">Sugerido</th><th>Cliente</th><th>Registró</th>{session.role === "admin" && <th />}</tr></thead>
            <tbody>
              {recent.map(({ s, name, by }) => (
                <tr key={s.id}>
                  <td>{s.occurredOn}</td><td>{name}</td><td className="text-right">{s.kg.toLocaleString("es-CO")}</td>
                  <td className="text-right">{fmtCOP(s.totalGross)}</td><td className="text-right text-muted">{fmtCOP(s.suggestedGross)}</td>
                  <td>{s.customer ?? "—"}</td><td>{by ?? "—"}</td>
                  {session.role === "admin" && (
                    <td>
                      <form action={cancelBulkSale}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="text-xs text-muted underline">Anular</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
