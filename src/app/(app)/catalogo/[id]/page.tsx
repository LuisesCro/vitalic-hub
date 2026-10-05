import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { productFamilies, products } from "@/db/schema";
import { isFormat, proportionsFrom, splitRecipe } from "@/lib/catalog";
import { loadComponents } from "@/lib/components";
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { setFamilyActive } from "../actions";
import { editorOptions } from "../editor-data";
import { FamilyEditor, type EditorInitial } from "../family-editor";

export const metadata = { title: "Producto · Vitalic Hub" };

export default async function ProductoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guardado?: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const saved = (await searchParams).guardado === "1";
  const [family] = await db.select().from(productFamilies).where(eq(productFamilies.id, id));
  if (!family) notFound();
  const items = await db.select().from(products).where(eq(products.familyId, id)).orderBy(asc(products.grams));
  const recipes = await loadComponents();
  const settings = await getSettings();
  const { materials, categories } = await editorOptions();

  // La receta en proporciones sale de la presentación más grande con receta;
  // las que no coinciden con ese reparto quedan "ajustadas a mano".
  const withRecipe = items.filter((p) => (recipes.get(p.id) ?? []).length).sort((a, b) => (b.grams ?? 0) - (a.grams ?? 0));
  const reference = withRecipe[0] ? recipes.get(withRecipe[0].id)! : [];
  const recipe = proportionsFrom(reference).map((r) => ({ ref: r.rawMaterialId, parts: r.parts }));
  const initial: EditorInitial = {
    id: family.id,
    name: family.name,
    category: family.category ?? "",
    ivaRate: family.ivaRate,
    recipe,
    presentations: items.map((p) => {
      const comps = recipes.get(p.id) ?? [];
      const auto = splitRecipe(recipe.map((r) => ({ rawMaterialId: r.ref, parts: r.parts })), p.grams ?? 0);
      const same =
        comps.length === auto.length &&
        comps.every((c) => Math.abs((auto.find((a) => a.rawMaterialId === c.rawMaterialId)?.grams ?? -99) - c.grams) <= 0.5);
      return {
        id: p.id,
        format: isFormat(p.format) ? p.format : "bolsa",
        grams: p.grams,
        priceGross: p.priceNet * (1 + p.ivaRate),
        sku: p.sku,
        active: p.active,
        cost: p.vendtyCost,
        custom: comps.length > 1 && !same ? Object.fromEntries(comps.map((c) => [String(c.rawMaterialId), c.grams])) : null,
      };
    }),
  };

  return (
    <div>
      <PageHeader title={family.name} subtitle={<Link href="/catalogo" className="underline">← Volver al catálogo</Link>}>
        <form action={setFamilyActive}>
          <input type="hidden" name="id" value={family.id} />
          <input type="hidden" name="active" value={family.active ? "0" : "1"} />
          <button className="btn-secondary">{family.active ? "Dar de baja el producto" : "Reactivar el producto"}</button>
        </form>
      </PageHeader>
      {saved && <p className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--good-bg)", color: "var(--good)" }}>Guardado.</p>}
      {!family.active && (
        <p className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>
          Este producto está dado de baja: no aparece en precios, empaque ni alertas. Su historial de ventas se conserva.
        </p>
      )}
      <FamilyEditor initial={initial} materials={materials} categories={categories} settings={settings} />
    </div>
  );
}
