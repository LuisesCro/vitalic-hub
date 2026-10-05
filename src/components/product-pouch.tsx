type Kind = "nut" | "round" | "dots" | "stick" | "leaf" | "kidney";

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Dibujo y colores de cada producto según lo que contiene (por palabras del nombre). */
const LOOKS: { re: RegExp; kind: Kind; c1: string; c2: string }[] = [
  { re: /canela/, kind: "stick", c1: "#a4572b", c2: "#7a3b1a" },
  { re: /clavo/, kind: "dots", c1: "#5a3a26", c2: "#2f1d12" },
  { re: /pimienta|pepa/, kind: "dots", c1: "#3b2f2a", c2: "#1f1714" },
  { re: /chia/, kind: "dots", c1: "#6b6560", c2: "#3d3835" },
  { re: /ajonjoli|sesamo/, kind: "dots", c1: "#e8dcc0", c2: "#b89c63" },
  { re: /linaza/, kind: "dots", c1: "#8a5a2b", c2: "#5e3a17" },
  { re: /calabaza|girasol/, kind: "kidney", c1: "#6f9a4a", c2: "#476b2c" },
  { re: /espirulina|stevia/, kind: "dots", c1: "#2f6b3a", c2: "#1d4a27" },
  { re: /curcuma|curry|achiote|paprika|comino|polvo|molid/, kind: "dots", c1: "#e0a21b", c2: "#b87a0c" },
  { re: /jamaica/, kind: "leaf", c1: "#9b1b3d", c2: "#6e1029" },
  { re: /laurel|albahaca|perejil|oregano|romero|tomillo|hoja|hierba|cilantro/, kind: "leaf", c1: "#4f8a3c", c2: "#2f5e24" },
  { re: /anis|cardamomo|badian/, kind: "dots", c1: "#6b4a2e", c2: "#3d2a19" },
  { re: /marañon|maranon|anacardo/, kind: "kidney", c1: "#e6c58a", c2: "#b8924f" },
  { re: /macadamia/, kind: "round", c1: "#ecd9b0", c2: "#c9ad74" },
  { re: /brasil/, kind: "nut", c1: "#b88a5a", c2: "#7d5630" },
  { re: /almendra/, kind: "nut", c1: "#d6a56b", c2: "#a8773f" },
  { re: /pistacho/, kind: "round", c1: "#9bbf6a", c2: "#6f8f45" },
  { re: /avellana/, kind: "round", c1: "#a8743f", c2: "#6e4824" },
  { re: /mani|cacahuate/, kind: "nut", c1: "#d9a566", c2: "#b57d3c" },
  { re: /nuez/, kind: "round", c1: "#b8895a", c2: "#7d5630" },
  { re: /pasa|uva/, kind: "round", c1: "#5a2a45", c2: "#33142a" },
  { re: /arandano|cranberry|cereza/, kind: "round", c1: "#b3213a", c2: "#7a1226" },
  { re: /datil|ciruela|higo/, kind: "nut", c1: "#6b3f2a", c2: "#3f2316" },
  { re: /coco/, kind: "round", c1: "#f2ecdf", c2: "#d9cfb8" },
  { re: /mixtura|mezcla|mix/, kind: "nut", c1: "#c98b4a", c2: "#8a3b4f" },
];

export function pouchLook(name: string) {
  const n = norm(name);
  return LOOKS.find((l) => l.re.test(n)) ?? { kind: "round" as Kind, c1: "#9fb8ad", c2: "#6f8a7e" };
}

function sizeLabel(name: string): string {
  const m = norm(name).match(/(\d+(?:[.,]\d+)?)\s*(kg|gr|g)\b/);
  return m ? `${m[1]}${m[2] === "kg" ? "kg" : "g"}` : "";
}

function contents(kind: Kind, c1: string, c2: string) {
  switch (kind) {
    case "nut":
      return (<><ellipse cx="30" cy="62" rx="9" ry="6" fill={c1} transform="rotate(-20 30 62)" /><ellipse cx="46" cy="58" rx="9" ry="6" fill={c2} transform="rotate(15 46 58)" /><ellipse cx="38" cy="70" rx="9" ry="6" fill={c1} transform="rotate(-5 38 70)" /><ellipse cx="52" cy="70" rx="8" ry="5.5" fill={c2} transform="rotate(25 52 70)" /><ellipse cx="26" cy="74" rx="8" ry="5.5" fill={c2} /></>);
    case "round":
      return (<><circle cx="30" cy="62" r="7" fill={c1} /><circle cx="45" cy="58" r="7" fill={c2} /><circle cx="38" cy="72" r="7" fill={c1} /><circle cx="53" cy="70" r="6.5" fill={c2} /><circle cx="25" cy="75" r="6.5" fill={c2} /></>);
    case "dots":
      return <>{Array.from({ length: 34 }, (_, i) => <circle key={i} cx={20 + ((i * 17) % 38)} cy={55 + ((i * 11) % 26)} r="2.6" fill={i % 3 ? c1 : c2} />)}</>;
    case "stick":
      return (<><rect x="20" y="58" width="42" height="7" rx="3.5" fill={c1} transform="rotate(-12 40 62)" /><rect x="22" y="68" width="42" height="7" rx="3.5" fill={c2} transform="rotate(8 40 72)" /><rect x="24" y="78" width="38" height="6" rx="3" fill={c1} /></>);
    case "leaf":
      return (<><path d="M24 76 q6-22 16-14 q-2 14-16 14z" fill={c1} /><path d="M40 82 q4-22 18-14 q-4 14-18 14z" fill={c2} /><path d="M30 64 q10-10 18-2 q-6 10-18 2z" fill={c1} /></>);
    case "kidney":
      return (<><path d="M24 66 q6-10 14-4 q-4 10-14 4z" fill={c1} /><path d="M42 62 q8-8 14 0 q-6 10-14 0z" fill={c2} /><path d="M30 78 q6-10 14-4 q-4 10-14 4z" fill={c2} /><path d="M48 80 q8-8 12 0 q-6 8-12 0z" fill={c1} /></>);
  }
}

/** Ilustración de la bolsa Vitalic con el producto en la ventanita. */
export function ProductPouch({ name, size = 56 }: { name: string; size?: number }) {
  const { kind, c1, c2 } = pouchLook(name);
  const label = sizeLabel(name);
  return (
    <svg viewBox="0 0 76 100" width={size * 0.76} height={size} role="img" aria-label={name} className="shrink-0">
      <path d="M12 8h52l4 8-3 76q0 6-6 6H17q-6 0-6-6L8 16z" fill="#1c7a8c" />
      <path d="M12 8h52l4 8H8z" fill="#11505c" />
      <rect x="14" y="20" width="48" height="12" rx="3" fill="#fff" opacity=".95" />
      <text x="38" y="29.5" textAnchor="middle" fontFamily="Quicksand, sans-serif" fontWeight="700" fontSize="8" fill="#186878">vitalic</text>
      <rect x="16" y="40" width="44" height="46" rx="8" fill="#eef7f4" />
      <g>{contents(kind, c1, c2)}</g>
      {label && <text x="38" y="94" textAnchor="middle" fontSize="6" fontWeight="700" fill="#fff" fontFamily="sans-serif">{label}</text>}
    </svg>
  );
}
