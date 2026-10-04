import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { editorOptions } from "../editor-data";
import { FamilyEditor } from "../family-editor";

export const metadata = { title: "Nuevo producto · Vitalic Hub" };

export default async function NuevoProductoPage() {
  await requireAdmin();
  const settings = await getSettings();
  const { materials, categories } = await editorOptions();
  return (
    <div>
      <PageHeader title="Nuevo producto" subtitle={<Link href="/catalogo" className="underline">← Volver al catálogo</Link>} />
      <FamilyEditor
        initial={{ name: "", category: "", ivaRate: 0.19, recipe: [], presentations: [] }}
        materials={materials}
        categories={categories}
        settings={settings}
      />
    </div>
  );
}
