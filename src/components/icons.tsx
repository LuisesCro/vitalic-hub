// Íconos de trazo (estilo Lucide), dibujados en línea para no depender de librerías.
type P = { className?: string };
const base = (className = "size-5") => ({
  className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});

export const IconHome = ({ className }: P) => <svg {...base(className)}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></svg>;
export const IconCash = ({ className }: P) => <svg {...base(className)}><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9.5v5M18 9.5v5" /></svg>;
export const IconReceipt = ({ className }: P) => <svg {...base(className)}><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>;
export const IconBox = ({ className }: P) => <svg {...base(className)}><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="m3 7.5 9 4.5 9-4.5M12 12v9" /></svg>;
export const IconLayers = ({ className }: P) => <svg {...base(className)}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></svg>;
export const IconScale = ({ className }: P) => <svg {...base(className)}><path d="M12 3v18M7 21h10M5 7h14" /><path d="m5 7-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z" /></svg>;
export const IconBag = ({ className }: P) => <svg {...base(className)}><path d="M6 7h12l-1 14H7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>;
export const IconTag = ({ className }: P) => <svg {...base(className)}><path d="M3 12V3h9l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>;
export const IconLeaf = ({ className }: P) => <svg {...base(className)}><path d="M5 19c0-9 5-14 15-15-1 10-6 15-15 15z" /><path d="M5 19 13 11" /></svg>;
export const IconChart = ({ className }: P) => <svg {...base(className)}><path d="M3 3v18h18" /><path d="M7 15v3M11 11v7M15 13v5M19 7v11" /></svg>;
export const IconUpload = ({ className }: P) => <svg {...base(className)}><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>;
export const IconSettings = ({ className }: P) => <svg {...base(className)}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>;
export const IconKey = ({ className }: P) => <svg {...base(className)}><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M15 8l2 2" /></svg>;
export const IconMenu = ({ className }: P) => <svg {...base(className)}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
export const IconLogout = ({ className }: P) => <svg {...base(className)}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l-5-5 5-5M5 12h11" /></svg>;
export const IconX = ({ className }: P) => <svg {...base(className)}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const IconArrowRight = ({ className }: P) => <svg {...base(className)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const IconAlert = ({ className }: P) => <svg {...base(className)}><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></svg>;
export const IconCheck = ({ className }: P) => <svg {...base(className)}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>;
export const IconTrendUp = ({ className }: P) => <svg {...base(className)}><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>;
export const IconTrendDown = ({ className }: P) => <svg {...base(className)}><path d="m3 7 6 6 4-4 8 8" /><path d="M15 17h6v-6" /></svg>;
export const IconUsers = ({ className }: P) => <svg {...base(className)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></svg>;

/** Ícono oficial de Vitalic (espiga en cuadro turquesa). */
export function Logo({ className = "size-9" }: P) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/vitalic-icono.svg" alt="" className={className} />;
}

/** Logo horizontal oficial: ícono + "vitalic". Variante blanca para fondos turquesa. */
export function BrandLogo({ className = "h-8 w-auto", white = false }: P & { white?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={white ? "/brand/vitalic-horizontal-blanco.svg" : "/brand/vitalic-horizontal.svg"} alt="Vitalic" className={className} />;
}
