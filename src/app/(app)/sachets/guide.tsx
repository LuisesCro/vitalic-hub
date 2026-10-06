"use client";

import { useState } from "react";
import { ProductPouch } from "@/components/product-pouch";

export type GuideItem = { id: number; name: string; grams: number };

const fmt = (g: number) => g.toLocaleString("es-CO", { maximumFractionDigits: 1 });
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function SachetGuide({ items, full }: { items: GuideItem[]; full: number }) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState(false);
  const list = items.filter((i) => norm(i.name).includes(norm(q)) && (!only || i.grams < full));
  const less = items.filter((i) => i.grams < full).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" type="search" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />
          Solo los que llevan menos de {full} g ({less})
        </label>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {list.map((i) => {
          const low = i.grams < full;
          const pct = Math.min(100, Math.max(4, (i.grams / full) * 100));
          return (
            <li key={i.id} className="card flex flex-col items-center gap-2 p-3 text-center" style={low ? { outline: "2px solid var(--warn, #d97706)" } : undefined}>
              <ProductPouch name={i.name} size={96} />
              <span className="text-sm font-medium leading-tight">{i.name}</span>
              <span className="text-3xl font-bold tabular-nums">{fmt(i.grams)} g</span>
              <span className="block h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]" aria-hidden>
                <span className="block h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
              </span>
              <span className="text-xs text-muted">{low ? `Menos de lo normal (${fmt(full)} g)` : "Cantidad normal"}</span>
            </li>
          );
        })}
      </ul>
      {list.length === 0 && <p className="text-sm text-muted">No hay sachets con ese nombre.</p>}
    </div>
  );
}
