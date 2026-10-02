// Valores iniciales de los parámetros de negocio. Se editan desde la página de Ajustes.
export const DEFAULT_SETTINGS = {
  margenObjetivoFrutosSecos: 0.35,
  margenObjetivoEspecias: 0.5,
  margenMinimo: 0.2,
  posicionCompetencia: -0.03,
  redondeoPrecio: 500,
  mermaEmpaque: 0.01,
  permitirBajarPrecios: 0,
  // Costo de bolsa + etiqueta por presentación (COP). Se aplica según los gramos del producto.
  empaqueHasta50g: 0,
  empaqueHasta150g: 0,
  empaqueHasta300g: 0,
  empaqueMas300g: 0,
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = Record<SettingKey, number>;

export function packagingCostFor(grams: number | null, s: Settings): number {
  if (!grams) return 0;
  if (grams <= 50) return s.empaqueHasta50g;
  if (grams <= 150) return s.empaqueHasta150g;
  if (grams <= 300) return s.empaqueHasta300g;
  return s.empaqueMas300g;
}

export const SETTING_LABELS: Record<SettingKey, { label: string; kind: "pct" | "cop" | "bool" }> = {
  margenObjetivoFrutosSecos: { label: "Margen objetivo frutos secos y frutas deshidratadas", kind: "pct" },
  margenObjetivoEspecias: { label: "Margen objetivo especias, hierbas y otros", kind: "pct" },
  margenMinimo: { label: "Margen mínimo aceptable", kind: "pct" },
  posicionCompetencia: { label: "Posición frente al competidor más barato (negativo = más barato)", kind: "pct" },
  redondeoPrecio: { label: "Redondear precios a múltiplos de", kind: "cop" },
  mermaEmpaque: { label: "Merma estimada al empacar", kind: "pct" },
  permitirBajarPrecios: { label: "Permitir que el motor recomiende bajar precios", kind: "bool" },
  empaqueHasta50g: { label: "Bolsa y etiqueta hasta 50 g", kind: "cop" },
  empaqueHasta150g: { label: "Bolsa y etiqueta de 51 a 150 g", kind: "cop" },
  empaqueHasta300g: { label: "Bolsa y etiqueta de 151 a 300 g", kind: "cop" },
  empaqueMas300g: { label: "Bolsa y etiqueta de más de 300 g", kind: "cop" },
};
