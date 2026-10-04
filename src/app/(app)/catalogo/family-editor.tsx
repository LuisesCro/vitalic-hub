"use client";

import { useActionState, useMemo, useState } from "react";
import { FORMATS, fmtGrams, marginOf, papeletaMaxGrams, priceForMargin, splitRecipe, type Format } from "@/lib/catalog";
import { unitCostFromComponents } from "@/lib/costing";
import { fmtCOP, fmtPct } from "@/lib/format";
import { packagingCostFor, type Settings } from "@/lib/settings-defaults";
import { saveFamily, type CatalogState } from "./actions";

type Ref = number | string; // número = insumo existente; texto = insumo nuevo de este formulario
export type Material = { id: number; name: string; costPerKg: number; stockGrams: number };
type NewMaterial = { ref: string; name: string; costPerKg: string; stockKg: string };
type RecipeRow = { key: string; ref: Ref | null; text: string; parts: string };
type Presentation = {
  key: string;
  id?: number;
  format: Format;
  grams: string;
  priceGross: string;
  sku: string;
  active: boolean;
  custom: Record<string, string> | null; // gramos por insumo cuando se ajustan a mano
};
export type EditorInitial = {
  id?: number;
  name: string;
  category: string;
  ivaRate: number;
  recipe: { ref: number; parts: number }[];
  presentations: { id: number; format: Format; grams: number | null; priceGross: number; sku: string; active: boolean; custom: Record<string, number> | null }[];
};

let seq = 0;
const key = () => `k${++seq}`;
const num = (v: string) => Number(String(v).replace(/\./g, "").replace(",", ".")) || 0;
const QUICK = [125, 250, 500, 1000];

export function FamilyEditor({
  initial, materials, categories, settings,
}: {
  initial: EditorInitial;
  materials: Material[];
  categories: string[];
  settings: Settings;
}) {
  const [state, action, pending] = useActionState<CatalogState, FormData>(saveFamily, {});
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState(initial.category);
  const [iva, setIva] = useState(initial.ivaRate);
  const [newMats, setNewMats] = useState<NewMaterial[]>([]);
  const byName = useMemo(() => new Map(materials.map((m) => [m.name.toLowerCase(), m])), [materials]);
  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const [recipe, setRecipe] = useState<RecipeRow[]>(() =>
    initial.recipe.length
      ? initial.recipe.map((r) => ({ key: key(), ref: r.ref, text: byId.get(r.ref)?.name ?? "", parts: String(r.parts) }))
      : [{ key: key(), ref: null, text: "", parts: "100" }],
  );
  const [pres, setPres] = useState<Presentation[]>(() =>
    initial.presentations.map((p) => ({
      key: key(), id: p.id, format: p.format, grams: p.grams ? String(p.grams) : "", priceGross: String(Math.round(p.priceGross)),
      sku: p.sku, active: p.active, custom: p.custom ? Object.fromEntries(Object.entries(p.custom).map(([k, v]) => [k, String(v)])) : null,
    })),
  );

  const labelOf = (ref: Ref) => (typeof ref === "number" ? byId.get(ref)?.name : newMats.find((m) => m.ref === ref)?.name) ?? "—";
  const costOf = (ref: Ref) => (typeof ref === "number" ? byId.get(ref)?.costPerKg ?? 0 : num(newMats.find((m) => m.ref === ref)?.costPerKg ?? "0"));
  const validRecipe = recipe.filter((r) => r.ref !== null && num(r.parts) > 0) as (RecipeRow & { ref: Ref })[];
  const partsTotal = validRecipe.reduce((t, r) => t + num(r.parts), 0);
  const blendedCostPerKg = partsTotal
    ? validRecipe.reduce((t, r) => (costOf(r.ref) > 0 && t !== null ? t + (num(r.parts) / partsTotal) * costOf(r.ref) : null), 0 as number | null)
    : null;

  /** Gramos de cada insumo en una presentación: los ajustados a mano o la receta repartida. */
  function componentsOf(p: Presentation): { ref: Ref; grams: number }[] {
    if (p.custom) return validRecipe.map((r) => ({ ref: r.ref, grams: num(p.custom![String(r.ref)] ?? "0") })).filter((c) => c.grams > 0);
    const grams = num(p.grams);
    return splitRecipe(validRecipe.map((r, i) => ({ rawMaterialId: i + 1, parts: num(r.parts) })), grams).map((c) => ({
      ref: validRecipe[c.rawMaterialId - 1].ref,
      grams: c.grams,
    }));
  }

  function evaluate(p: Presentation) {
    const comps = componentsOf(p);
    const grams = p.custom ? comps.reduce((t, c) => t + c.grams, 0) : num(p.grams);
    const cost = comps.length
      ? unitCostFromComponents({ grams, vendtyCost: null, packagingCost: 0 }, comps.map((c) => ({ grams: c.grams, costPerKg: costOf(c.ref) || null })), settings)
      : null;
    const price = num(p.priceGross);
    const margin = marginOf(price, iva, cost);
    const suggested = cost !== null ? priceForMargin(cost, iva, settings.margenMinimo, p.format === "papeleta" ? 100 : settings.redondeoPrecio) : null;
    const maxGrams =
      p.format === "papeleta" && blendedCostPerKg
        ? papeletaMaxGrams({ priceGross: price || 1000, ivaRate: iva, costPerKg: blendedCostPerKg, minMargin: settings.margenMinimo, packagingCost: packagingCostFor(grams, settings), merma: settings.mermaEmpaque })
        : null;
    return { comps, grams, cost, margin, suggested, maxGrams };
  }

  function addPresentation(format: Format, grams: number) {
    const draft: Presentation = { key: key(), format, grams: String(grams), priceGross: format === "papeleta" ? "1000" : "", sku: "", active: true, custom: null };
    const { suggested } = evaluate(draft);
    if (format !== "papeleta" && suggested) draft.priceGross = String(suggested);
    setPres((list) => [...list, draft]);
  }
  const update = (k: string, patch: Partial<Presentation>) => setPres((list) => list.map((p) => (p.key === k ? { ...p, ...patch } : p)));
  const updateRow = (k: string, patch: Partial<RecipeRow>) => setRecipe((rows) => rows.map((r) => (r.key === k ? { ...r, ...patch } : r)));

  function pickIngredient(k: string, text: string) {
    const found = byName.get(text.trim().toLowerCase());
    const created = newMats.find((m) => m.name.trim().toLowerCase() === text.trim().toLowerCase());
    updateRow(k, { text, ref: found ? found.id : created ? created.ref : null });
  }
  function createIngredient(k: string, text: string) {
    const ref = `n${++seq}`;
    setNewMats((list) => [...list, { ref, name: text.trim(), costPerKg: "", stockKg: "" }]);
    updateRow(k, { ref });
  }

  const payload = JSON.stringify({
    id: initial.id,
    name: name.trim(),
    category: category.trim() || null,
    ivaRate: iva,
    newMaterials: newMats.filter((m) => validRecipe.some((r) => r.ref === m.ref)).map((m) => ({ ref: m.ref, name: m.name, costPerKg: num(m.costPerKg), stockKg: num(m.stockKg) })),
    recipe: validRecipe.map((r) => ({ ref: r.ref, parts: num(r.parts) })),
    presentations: pres.map((p) => ({
      id: p.id,
      format: p.format,
      grams: p.format === "unidad" && !num(p.grams) ? null : evaluate(p).grams || null,
      priceGross: num(p.priceGross),
      sku: p.sku.trim() || undefined,
      active: p.active,
      components: p.custom ? componentsOf(p).map((c) => ({ ref: c.ref, grams: c.grams })) : undefined,
    })),
  });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />

      <section className="card space-y-3">
        <h2 className="font-semibold">1. Producto</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="sm:col-span-3">
            <span className="label">Nombre (sin el peso)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Mixtura dulce" className="input" />
          </label>
          <label className="sm:col-span-2">
            <span className="label">Categoría</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} list="categorias" placeholder="Frutos secos y semillas" className="input" />
            <datalist id="categorias">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label>
            <span className="label">IVA</span>
            <select value={iva} onChange={(e) => setIva(Number(e.target.value))} className="input">
              <option value={0}>Sin IVA (0 %)</option>
              <option value={0.05}>5 %</option>
              <option value={0.19}>19 %</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">2. Receta</h2>
          <p className="text-sm text-muted">
            Un producto simple lleva un solo insumo. Para una mezcla agrega cada ingrediente con su proporción, por ejemplo
            maní salado 40, maní dulce 35 y uvas pasas 25. Se reparte sola en cada tamaño.
          </p>
        </div>
        <datalist id="insumos">{materials.map((m) => <option key={m.id} value={m.name} />)}</datalist>
        {recipe.map((r) => {
          const mat = typeof r.ref === "number" ? byId.get(r.ref) : null;
          const fresh = typeof r.ref === "string" ? newMats.find((m) => m.ref === r.ref) : null;
          return (
            <div key={r.key} className="space-y-2 rounded-xl border border-[var(--border)] p-3">
              <div className="grid grid-cols-[1fr_4.5rem_auto] items-end gap-2 sm:grid-cols-[1fr_6rem_auto]">
                <label className="min-w-0">
                  <span className="label">Insumo</span>
                  <input value={r.text} onChange={(e) => pickIngredient(r.key, e.target.value)} list="insumos" placeholder="Escribe para buscar" className="input" />
                </label>
                <label>
                  <span className="label">Proporción</span>
                  <input value={r.parts} onChange={(e) => updateRow(r.key, { parts: e.target.value })} inputMode="decimal" className="input" />
                </label>
                <button type="button" onClick={() => setRecipe((rows) => rows.filter((x) => x.key !== r.key))} className="btn-secondary" aria-label="Quitar insumo">✕</button>
              </div>
              <p className="text-xs text-muted">
                {partsTotal > 0 && num(r.parts) > 0 && `${Math.round((num(r.parts) / partsTotal) * 1000) / 10} % de la mezcla · `}
                {mat && `Costo ${fmtCOP(mat.costPerKg)}/kg · Existencia ${(mat.stockGrams / 1000).toLocaleString("es-CO")} kg`}
                {!mat && !fresh && r.text.trim().length > 1 && (
                  <button type="button" onClick={() => createIngredient(r.key, r.text)} className="font-medium text-brand-700 underline dark:text-brand-500">
                    Crear el insumo nuevo «{r.text.trim()}»
                  </button>
                )}
              </p>
              {fresh && (
                <div className="grid gap-2 rounded-lg bg-[var(--surface-2)] p-2 sm:grid-cols-2">
                  <p className="text-xs font-medium sm:col-span-2">Insumo nuevo: queda creado en inventario al guardar</p>
                  <label>
                    <span className="label">Costo por kilo (sin IVA)</span>
                    <input value={fresh.costPerKg} onChange={(e) => setNewMats((l) => l.map((m) => (m.ref === fresh.ref ? { ...m, costPerKg: e.target.value } : m)))} inputMode="numeric" placeholder="38000" className="input" />
                  </label>
                  <label>
                    <span className="label">Kilos que tienes hoy</span>
                    <input value={fresh.stockKg} onChange={(e) => setNewMats((l) => l.map((m) => (m.ref === fresh.ref ? { ...m, stockKg: e.target.value } : m)))} inputMode="decimal" placeholder="22,68" className="input" />
                  </label>
                </div>
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setRecipe((rows) => [...rows, { key: key(), ref: null, text: "", parts: "" }])} className="btn-secondary">
            + Agregar ingrediente
          </button>
          <span className="text-sm text-muted">Costo de la mezcla: <strong className="text-[var(--text)]">{blendedCostPerKg ? `${fmtCOP(blendedCostPerKg)}/kg` : "falta el costo de algún insumo"}</strong></span>
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">3. Presentaciones</h2>
          <p className="text-sm text-muted">Precio al público con IVA. El margen se calcula con el costo de la receta y el empaque; la meta mínima es {fmtPct(settings.margenMinimo)}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((g) => (
            <button key={g} type="button" onClick={() => addPresentation("bolsa", g)} className="btn-secondary">+ {fmtGrams(g)}</button>
          ))}
          <button type="button" onClick={() => addPresentation("papeleta", 20)} className="btn-secondary">+ Papeleta $1.000</button>
          <button type="button" onClick={() => addPresentation("bolsa", 0)} className="btn-secondary">+ Otro tamaño</button>
        </div>

        {pres.map((p) => {
          const ev = evaluate(p);
          const tone = ev.margin === null ? "var(--muted)" : ev.margin < settings.margenMinimo ? "var(--bad)" : "var(--good)";
          return (
            <div key={p.key} className={`space-y-2 rounded-xl border border-[var(--border)] p-3 ${p.active ? "" : "opacity-60"}`}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[8rem_7rem_9rem_1fr_auto]">
                <label>
                  <span className="label">Tipo</span>
                  <select value={p.format} onChange={(e) => update(p.key, { format: e.target.value as Format })} className="input">
                    {(Object.keys(FORMATS) as Format[]).map((f) => <option key={f} value={f}>{FORMATS[f]}</option>)}
                  </select>
                </label>
                <label>
                  <span className="label">Gramos</span>
                  <input value={p.custom ? String(ev.grams) : p.grams} disabled={!!p.custom} onChange={(e) => update(p.key, { grams: e.target.value })} inputMode="decimal" className="input" />
                </label>
                <label>
                  <span className="label">Precio público</span>
                  <input value={p.priceGross} onChange={(e) => update(p.key, { priceGross: e.target.value })} inputMode="numeric" placeholder={ev.suggested ? String(ev.suggested) : ""} className="input" />
                </label>
                <label className="col-span-2 sm:col-span-1">
                  <span className="label">Código (automático si lo dejas vacío)</span>
                  <input value={p.sku} onChange={(e) => update(p.key, { sku: e.target.value })} className="input font-mono text-sm" />
                </label>
                <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
                  {p.id ? (
                    <button type="button" onClick={() => update(p.key, { active: !p.active })} className="btn-secondary">{p.active ? "Dar de baja" : "Reactivar"}</button>
                  ) : (
                    <button type="button" onClick={() => setPres((l) => l.filter((x) => x.key !== p.key))} className="btn-secondary" aria-label="Quitar presentación">✕</button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span>Costo: <strong>{fmtCOP(ev.cost)}</strong></span>
                <span>Margen: <strong style={{ color: tone }}>{ev.margin === null ? "—" : fmtPct(ev.margin)}</strong></span>
                {ev.suggested && p.format !== "papeleta" && num(p.priceGross) !== ev.suggested && (
                  <button type="button" onClick={() => update(p.key, { priceGross: String(ev.suggested) })} className="text-brand-700 underline dark:text-brand-500">
                    Usar {fmtCOP(ev.suggested)} (margen {fmtPct(settings.margenMinimo)})
                  </button>
                )}
                {p.format === "papeleta" && ev.maxGrams !== null && (
                  <span className="text-muted">
                    Para {fmtPct(settings.margenMinimo)} de margen caben máximo <strong className="text-[var(--text)]">{ev.maxGrams} g</strong>
                    {!p.custom && num(p.grams) !== ev.maxGrams && (
                      <> · <button type="button" onClick={() => update(p.key, { grams: String(ev.maxGrams) })} className="text-brand-700 underline dark:text-brand-500">usar {ev.maxGrams} g</button></>
                    )}
                  </span>
                )}
                {!p.active && <span className="badge" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>De baja al guardar</span>}
              </div>
              {validRecipe.length > 1 && (
                <div className="text-xs text-muted">
                  {p.custom ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {validRecipe.map((r) => (
                        <label key={String(r.ref)}>
                          <span className="label">{labelOf(r.ref)} (g)</span>
                          <input
                            value={p.custom![String(r.ref)] ?? ""}
                            onChange={(e) => update(p.key, { custom: { ...p.custom!, [String(r.ref)]: e.target.value } })}
                            inputMode="decimal"
                            className="input"
                          />
                        </label>
                      ))}
                      <button type="button" onClick={() => update(p.key, { custom: null, grams: String(ev.grams) })} className="text-left underline sm:col-span-3">Volver a repartir según la receta</button>
                    </div>
                  ) : (
                    <>
                      Lleva {ev.comps.map((c) => `${labelOf(c.ref)} ${fmtGrams(c.grams)}`).join(" + ")} ·{" "}
                      <button type="button" onClick={() => update(p.key, { custom: Object.fromEntries(ev.comps.map((c) => [String(c.ref), String(c.grams)])) })} className="underline">
                        ajustar gramos a mano
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {pres.length === 0 && <p className="text-sm text-muted">Agrega las presentaciones con los botones de arriba.</p>}
      </section>

      {state.error && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{state.error}</p>}
      <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
        <button className="btn-primary shadow-lg" disabled={pending}>{pending ? "Guardando…" : initial.id ? "Guardar cambios" : "Crear producto"}</button>
      </div>
    </form>
  );
}
