"use client";

import { useActionState } from "react";
import { importVendtyRecipes, type CatalogState } from "./actions";

/** Pegar el informe "Productos compuestos" de Vendty para traer los gramos reales de cada receta. */
export function RecipesImport() {
  const [state, action, pending] = useActionState<CatalogState, FormData>(importVendtyRecipes, {});
  return (
    <details className="card">
      <summary className="cursor-pointer font-semibold">Traer recetas desde Vendty</summary>
      <form action={action} className="mt-3 space-y-3">
        <p className="text-sm text-muted">
          En Vendty abre <strong>Inventario → Productos compuestos</strong>, selecciona todo el informe, cópialo y pégalo
          aquí. Se cargan los gramos reales de cada insumo por presentación (incluidas mixturas y sachets).
        </p>
        <textarea name="text" required rows={6} className="input font-mono text-xs" placeholder="Nombre producto	Precio de compra	Precio de venta	Ingredientes…" />
        <button className="btn-primary" disabled={pending}>{pending ? "Cargando…" : "Cargar recetas"}</button>
        {state.ok && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--good-bg)", color: "var(--good)" }}>{state.ok}</p>}
        {state.error && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{state.error}</p>}
      </form>
    </details>
  );
}
