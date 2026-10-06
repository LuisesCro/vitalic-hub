import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { loadComponents } from "@/lib/components";
import { requireSession } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { SachetGuide, type GuideItem } from "./guide";

export const metadata = { title: "Guía de sachets · Vitalic Hub" };

export default async function SachetGuidePage() {
  await requireSession();
  const s = await getSettings();
  const recipes = await loadComponents();
  const rows = await db.select().from(products).where(and(eq(products.active, true), eq(products.format, "sachet"))).orderBy(asc(products.name));

  const items: GuideItem[] = rows
    .map((p) => {
      const grams = (recipes.get(p.id) ?? []).reduce((t, c) => t + c.grams, 0);
      return { id: p.id, name: p.name.replace(/\s*sachet\s*$/i, "").replace(/\s*\d+\s*(g|gr)\s*$/i, "").trim(), grams };
    })
    .filter((i) => i.grams > 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Guía de sachets" subtitle={`Cuántos gramos lleva cada sachet. Todos pesan ${s.sachetGramos} g, menos las especias caras, que llevan menos.`} />
      <SachetGuide items={items} full={s.sachetGramos} />
    </div>
  );
}
