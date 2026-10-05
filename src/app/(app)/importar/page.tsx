import { requireAdmin } from "@/lib/session";
import { count, max, min } from "drizzle-orm";
import { db } from "@/db";
import { products, rawMaterials, saleLines } from "@/db/schema";
import { UploadForm } from "@/components/upload-form";
import { importCloses, importInventory, importProducts, importTransactions } from "./actions";

export const metadata = { title: "Importar · Vitalic Hub" };

export default async function ImportarPage() {
  await requireAdmin();
  const [[p], [m], [s]] = await Promise.all([
    db.select({ n: count() }).from(products),
    db.select({ n: count() }).from(rawMaterials),
    db.select({ n: count(), from: min(saleLines.soldAt), to: max(saleLines.soldAt) }).from(saleLines),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Importar datos de Vendty</h1>
      <p className="text-sm text-muted">
        Hoy hay {p.n} productos, {m.n} insumos y {s.n.toLocaleString("es-CO")} líneas de venta
        {s.from && s.to ? ` (${s.from.toISOString().slice(0, 10)} a ${s.to.toISOString().slice(0, 10)})` : ""}.
        Puedes volver a subir los archivos cuando quieras: lo repetido se actualiza, no se duplica.
      </p>
      <section className="card space-y-2">
        <h2 className="font-semibold">1. Catálogo de productos</h2>
        <p className="text-sm text-muted">Vendty → Productos → Exportar (productos.xls). Crea productos e insumos.</p>
        <UploadForm action={importProducts} accept=".xls,.xlsx" button="Importar productos" />
      </section>
      <section className="card space-y-2">
        <h2 className="font-semibold">2. Ventas</h2>
        <p className="text-sm text-muted">
          Vendty → Informes → Exportar facturas (Transacciones). Recomendado: una vez por semana.
        </p>
        <UploadForm action={importTransactions} accept=".xls,.xlsx" button="Importar ventas" />
      </section>
      <section className="card space-y-2">
        <h2 className="font-semibold">Cierres de caja de Vendty (PDF)</h2>
        <p className="text-sm text-muted">
          Vendty → Informes → Cierre de caja, guardado como PDF (puedes elegir varios a la vez). Carga las ventas de cada día por
          producto. Los días que ya tienen ventas no se tocan, y si después subes la exportación de Transacciones, ella los reemplaza.
        </p>
        <UploadForm action={importCloses} accept=".pdf" button="Cargar cierres" multiple />
      </section>
      <section className="card space-y-2">
        <h2 className="font-semibold">3. Inventario inicial o conteo general</h2>
        <p className="text-sm text-muted">
          Vendty → Informes → Existencia de inventario, o una hoja tuya con dos columnas: <b>Insumo</b> y <b>Kg</b>.
          Cada insumo del archivo queda con esa cantidad desde hoy; los que no estén en el archivo no cambian.
        </p>
        <UploadForm action={importInventory} accept=".xls,.xlsx,.csv" button="Cargar inventario" />
      </section>
    </div>
  );
}
