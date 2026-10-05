/** Fotos de producto en bowl (public/productos). Se asignan por el nombre del producto. */

const PHOTOS: [string, string][] = [
  ["Laurel molido", "laurel-molido.webp"],
  ["Tomillo picado", "tomillo-picado.webp"],
  ["Comino molido", "comino-molido.webp"],
  ["Orégano molido", "oregano-molido.webp"],
  ["Ají", "aji.webp"],
  ["Ablanda carne", "ablanda-carne.webp"],
  ["Comino entero", "comino-entero.webp"],
  ["Achiote molido", "achiote-molido.webp"],
  ["Triguisar", "triguisar.webp"],
  ["Sal de ajo", "sal-de-ajo.webp"],
  ["Bicarbonato", "bicarbonato.webp"],
  ["Achiote Grano", "achiote-grano.webp"],
  ["Color", "color.webp"],
  ["Paprika", "paprika.webp"],
  ["Cúrcuma", "curcuma.webp"],
  ["Glutemato", "glutemato.webp"],
  ["Té verde", "te-verde.webp"],
  ["Curry molido", "curry-molido.webp"],
  ["Canela molida", "canela-molida.webp"],
  ["Tomillo molida", "tomillo-molida.webp"],
  ["Albahaca", "albahaca.webp"],
  ["Laurel picado", "laurel-picado.webp"],
  ["Perejil picado", "perejil-picado.webp"],
  ["Gelatina Sin Sabor", "gelatina-sin-sabor.webp"],
  ["Sen", "sen.webp"],
  ["Pimienta negra molida", "pimienta-negra-molida.webp"],
  ["Pimienta blanca molida", "pimienta-blanca-molida.webp"],
  ["Pimienta cayena molida", "pimienta-cayena-molida.webp"],
  ["Flor de jamaica", "flor-de-jamaica.webp"],
  ["Pimienta cayena", "pimienta-cayena.webp"],
  ["Pimienta negra entera", "pimienta-negra-entera.webp"],
  ["Pimienta blanca entera", "pimienta-blanca-entera.webp"],
  ["Romero", "romero.webp"],
  ["Cardamomo", "cardamomo.webp"],
  ["Clavo molido", "clavo-molido.webp"],
  ["Orégano picado", "oregano-picado.webp"],
  ["Linaza", "linaza.webp"],
  ["Clavo entero", "clavo-entero.webp"],
  ["Laurel entero", "laurel-entero.webp"],
  ["Boldo en hoja", "boldo-en-hoja.webp"],
  ["Acacia", "acacia.webp"],
  ["Jengibre molido", "jengibre-molido.webp"],
  ["Fenogreco", "fenogreco.webp"],
  ["Canela entera", "canela-entera.webp"],
  ["Avena molida", "avena-molida.webp"],
  ["Anis estrellado", "anis-estrellado.webp"],
  ["Harina integral", "harina-integral.webp"],
  ["Mostaza amarilla", "mostaza-amarilla.webp"],
  ["Soya en pepa", "soya-en-pepa.webp"],
  ["Semilla cilantro", "semilla-cilantro.webp"],
  ["Avena en hojuelas", "avena-en-hojuelas.webp"],
  ["Harina de almendras", "harina-de-almendras.webp"],
  ["Cebada molida", "cebada-molida.webp"],
  ["Granola", "granola.webp"],
  ["Marañón", "maranon.webp"],
  ["Maní sin piel", "mani-sin-piel.webp"],
  ["Avellana natural", "avellana-natural.webp"],
  ["Almendra laminada", "almendra-laminada.webp"],
  ["Pistachos", "pistachos.webp"],
  ["Almendra entera", "almendra-entera.webp"],
  ["Maní mixtura dulce", "mani-mixtura-dulce.webp"],
  ["Maní mixtura especial", "mani-mixtura-especial.webp"],
  ["Nuez del brasil", "nuez-del-brasil.webp"],
  ["Maní con cáscara", "mani-con-cascara.webp"],
  ["Maní dulce", "mani-dulce.webp"],
  ["Macadamia", "macadamia.webp"],
  ["Maní triturado", "mani-triturado.webp"],
  ["Nuez del brasil partida", "nuez-del-brasil-partida.webp"],
  ["Nuez pecan", "nuez-pecan.webp"],
  ["Nuez moscada entera", "nuez-moscada-entera.webp"],
  ["Nuez nogal", "nuez-nogal.webp"],
  ["Nuez moscada molida", "nuez-moscada-molida.webp"],
  ["Arándanos", "arandanos.webp"],
  ["Uvas pasas", "uvas-pasas.webp"],
  ["Dátiles enteros", "datiles-enteros.webp"],
  ["Mixta", "mixta.webp"],
  ["Sal marina delgada", "sal-marina-delgada.webp"],
  ["Sal himalaya gruesa", "sal-himalaya-gruesa.webp"],
  ["Sal limón", "sal-limon.webp"],
  ["Sal himalaya delgada", "sal-himalaya-delgada.webp"],
  ["Amaranto", "amaranto.webp"],
  ["Ajonjolí negro", "ajonjoli-negro.webp"],
  ["Semilla amapola", "semilla-amapola.webp"],
  ["Semilla calabaza", "semilla-calabaza.webp"],
  ["Quinoa", "quinoa.webp"],
  ["Semilla de anís", "semilla-de-anis.webp"],
  ["Semillas de girasol", "semillas-de-girasol.webp"],
  ["Ajonjolí descortezado", "ajonjoli-descortezado.webp"],
  ["Ajonjolí", "ajonjoli-descortezado.webp"],
  ["Quinua", "quinoa.webp"],
];

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STOP = new Set(["de", "del", "la", "el", "en", "con", "x", "peso", "fruit", "is", "life", "ss", "vitalic", "3a", "premium", "natural", "kanawi", "adher", "emiga"]);
// Palabras que describen la presentación y no el producto: "almendra" ≈ "almendra entera".
const FORM = new Set(["entera", "entero", "enteros", "enteras", "molida", "molido", "molidos", "molidas", "picado", "picada", "grano", "pepa", "polvo", "tostado", "tostada"]);

// Productos que no son la materia prima de la foto (aceite de linaza, crema de macadamia…).
const NOT_THE_FOOD = new Set(["aceite", "crema", "salsa", "vinagre", "extracto", "esencia", "miel", "nachili", "nchili", "turron", "propoleo", "propoleos"]);

const isGround = (w: string) => w.startsWith("molid") || w === "polvo";

function tokens(name: string): string[] {
  return norm(name)
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|gr|g|ml|cc)\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w))
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

const ENTRIES = PHOTOS.map(([title, file]) => ({ file, all: tokens(title), base: tokens(title).filter((w) => !FORM.has(w)) }));

/** Foto del producto, o null si el catálogo no tiene una para ese nombre. */
export function photoFor(productName: string): string | null {
  const p = tokens(productName);
  if (p.length === 0) return null;
  if (p.some((w) => NOT_THE_FOOD.has(w))) return null;
  const set = new Set(p);
  // 1) Todas las palabras del título están en el producto (gana el título más específico).
  let best: { file: string; n: number } | null = null;
  for (const e of ENTRIES) {
    const clash = (p.some(isGround) && e.all.some((w) => w.startsWith("enter"))) || (!p.some(isGround) && p.some((w) => w.startsWith("enter") || w === "grano") && e.all.some(isGround));
    if (!clash && e.all.every((w) => set.has(w)) && (!best || e.all.length > best.n)) best = { file: e.file, n: e.all.length };
  }
  if (best) return `/productos/${best.file}`;
  // 2) Mismo producto sin contar entero/molido/etc.: prefiere "entera" salvo que pida molido.
  const pBase = p.filter((w) => !FORM.has(w));
  if (pBase.length === 0) return null;
  const wantsGround = p.some(isGround);
  const hasForm = p.some((w) => FORM.has(w));
  const same = ENTRIES.filter(
    (e) => e.base.length === pBase.length && e.base.every((w) => pBase.includes(w)) && (!hasForm || e.all.some(isGround) === wantsGround),
  );
  if (same.length === 0) return null;
  const pick = same.find((e) => e.all.some((w) => (wantsGround ? isGround(w) : w.startsWith("enter")))) ?? same[0];
  return `/productos/${pick.file}`;
}
