import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { fmtCOP } from "@/lib/format";
import { kindPlural } from "@/lib/pack";
import { requireAdmin } from "@/lib/session";
import { supplierCatalog } from "@/lib/supplier-prices";

export const metadata = { title: "Lista de productos · Vitalic Hub" };

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

export default async function SupplierProductsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!supplier) notFound();
  const rows = await supplierCatalog(id);
  const ups = rows.filter((r) => r.change !== null && r.change > 0.005).length;
  const downs = rows.filter((r) => r.change !== null && r.change < -0.005).length;

  return (
    <div className="space-y-4">
      <PageHeader title={`Productos de ${supplier.name}`} subtitle="Lo que nos ha vendido o cotizado, con su último precio y cómo cambió frente al anterior.">
        <Link href="/proveedores" className="btn-secondary">← Proveedores</Link>
      </PageHeader>
      <div className="flex flex-wrap gap-3 text-sm text-muted">
        <span>{rows.length} productos</span>
        <span style={{ color: "var(--bad)" }}>{ups} subieron</span>
        <span style={{ color: "var(--good)" }}>{downs} bajaron</span>
      </div>

      {rows.length === 0 ? (
        <p className="card text-sm text-muted">Todavía no hay productos de este proveedor. Carga una factura en Compras o sube una cotización anterior en Cotizaciones.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Producto</th><th>Nos lo vende en</th><th className="text-right">Precio por unidad</th><th className="text-right">Precio por kg</th><th>Fecha</th>
                <th className="text-right">Precio anterior</th><th className="text-right">Cambio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const up = r.change !== null && r.change > 0.005;
                const down = r.change !== null && r.change < -0.005;
                return (
                  <tr key={r.key}>
                    <td className="font-medium">{r.name}</td>
                    <td className="text-sm">{r.packKg && r.kind !== "unidad" ? `${cap(r.kind)} de ${r.packKg.toLocaleString("es-CO")} kg` : r.kind === "kilo" ? "Kilo" : "—"}</td>
                    <td className="text-right tabular-nums">{fmtCOP(r.unitPrice)}</td>
                    <td className="text-right tabular-nums">{r.pricePerKg ? fmtCOP(r.pricePerKg) : "—"}</td>
                    <td className="text-sm">{r.date ?? "—"}{r.reference ? <span className="block text-xs text-muted">referencia</span> : null}</td>
                    <td className="text-right tabular-nums text-sm">{r.prevUnitPrice !== null ? <>{fmtCOP(r.prevUnitPrice)}<span className="block text-xs text-muted">{r.prevDate}</span></> : "—"}</td>
                    <td className="text-right text-sm font-semibold tabular-nums" style={{ color: up ? "var(--bad)" : down ? "var(--good)" : undefined }}>
                      {r.change === null ? <span className="font-normal text-muted">Sin comparar</span> : up ? `▲ +${(r.change * 100).toFixed(1)} %` : down ? `▼ ${(r.change * 100).toFixed(1)} %` : "Igual"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">«Cambio» compara el último precio por unidad con el anterior del mismo producto y presentación. Si solo hay un precio, aparece «Sin comparar». Los {kindPlural("caja")} y bultos se leen de las facturas y cotizaciones.</p>
    </div>
  );
}
