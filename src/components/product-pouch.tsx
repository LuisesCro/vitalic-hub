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



// Pseudo-aleatorio estable: el mismo producto siempre se ve igual.
const rnd = (i: number, salt: number) => { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };

/** Posiciones del montículo: filas que se van estrechando hacia arriba. */
function mound(kind: Kind) {
  const dense = kind === "dots";
  const rows = dense
    ? [[41, 11, 89, 26], [37, 12, 88, 25], [33, 15, 85, 22], [29, 18, 82, 20], [25, 22, 78, 17], [21, 27, 73, 14], [17, 33, 67, 10], [14, 40, 60, 6]]
    : [[39, 13, 87, 9], [33, 15, 85, 8], [27, 19, 81, 7], [22, 24, 76, 6], [17, 30, 70, 5], [13, 38, 62, 3]];
  const pts: { x: number; y: number; i: number }[] = [];
  let i = 0;
  for (const [y, x0, x1, n] of rows) {
    for (let k = 0; k < n; k++) {
      pts.push({ x: x0 + ((x1 - x0) * (k + 0.5)) / n + (rnd(i, 1) - 0.5) * 3, y: y + (rnd(i, 2) - 0.5) * 3, i });
      i++;
    }
  }
  return pts;
}

function Item({ kind, x, y, i, c1, c2 }: { kind: Kind; x: number; y: number; i: number; c1: string; c2: string }) {
  const fill = i % 2 ? c1 : c2;
  const rot = Math.round((rnd(i, 3) - 0.5) * 120);
  const g = `url(#sh-${kind})`;
  const t = `translate(${x} ${y}) rotate(${rot}) scale(1.25)`;
  switch (kind) {
    case "nut":
      return (<g transform={t}><path d="M-7 0 C-7 -6 5 -7 8 0 C5 6 -7 6 -7 0Z" fill={fill} /><path d="M-7 0 C-7 -6 5 -7 8 0 C5 6 -7 6 -7 0Z" fill={g} /><path d="M-4 -1.5 C-1 -3.5 3 -3.5 5 -1.2" stroke="#fff" strokeOpacity=".45" strokeWidth="1" fill="none" strokeLinecap="round" /></g>);
    case "round":
      return (<g transform={t}><circle r="5.6" fill={fill} /><circle r="5.6" fill={g} /><circle cx="-1.8" cy="-2" r="1.5" fill="#fff" fillOpacity=".5" /></g>);
    case "dots":
      return (<g transform={t}><ellipse rx="2.5" ry="1.8" fill={fill} /><ellipse cx="-.7" cy="-.6" rx="1" ry=".6" fill="#fff" fillOpacity=".4" /></g>);
    case "stick":
      return (<g transform={`translate(${x} ${y}) rotate(${Math.round((rnd(i, 3) - 0.5) * 50)}) scale(1.1)`}><rect x="-11" y="-2.6" width="22" height="5.2" rx="2.6" fill={fill} /><rect x="-11" y="-2.6" width="22" height="5.2" rx="2.6" fill={g} /><circle cx="11" cy="0" r="2.4" fill={c2} /><circle cx="11" cy="0" r="1" fill={c1} /><path d="M-8 -.6 H8" stroke="#fff" strokeOpacity=".3" strokeWidth=".8" /></g>);
    case "leaf":
      return (<g transform={t}><path d="M-8 0 C-4 -7 4 -7 8 0 C4 7 -4 7 -8 0Z" fill={fill} /><path d="M-7 0 H7" stroke="#fff" strokeOpacity=".35" strokeWidth=".9" /><path d="M-8 0 C-4 -7 4 -7 8 0 C4 7 -4 7 -8 0Z" fill={g} /></g>);
    case "kidney":
      return (<g transform={t}><path d="M-7 1 C-8 -5 0 -7 6 -4 C9 -2 8 2 4 3 C0 1 -3 4 -7 1Z" fill={fill} /><path d="M-7 1 C-8 -5 0 -7 6 -4 C9 -2 8 2 4 3 C0 1 -3 4 -7 1Z" fill={g} /><path d="M-4 -3 C-1 -5 3 -4 5 -3" stroke="#fff" strokeOpacity=".45" strokeWidth="1" fill="none" strokeLinecap="round" /></g>);
  }
}

/** Bowl de cerámica con el producto servido encima. */
export function ProductPouch({ name, size = 56 }: { name: string; size?: number }) {
  const { kind, c1, c2 } = pouchLook(name);
  const pts = mound(kind);
  return (
    <svg viewBox="0 0 100 80" width={size} height={size * 0.8} role="img" aria-label={name} className="shrink-0">
      <defs>
        <radialGradient id="sh-round" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#fff" stopOpacity=".25" /><stop offset="1" stopColor="#000" stopOpacity=".28" /></radialGradient>
        <linearGradient id="sh-nut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".18" /><stop offset="1" stopColor="#000" stopOpacity=".3" /></linearGradient>
        <linearGradient id="sh-kidney" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".18" /><stop offset="1" stopColor="#000" stopOpacity=".28" /></linearGradient>
        <linearGradient id="sh-leaf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".15" /><stop offset="1" stopColor="#000" stopOpacity=".25" /></linearGradient>
        <linearGradient id="sh-stick" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".2" /><stop offset="1" stopColor="#000" stopOpacity=".3" /></linearGradient>
        <linearGradient id="sh-dots" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".1" /><stop offset="1" stopColor="#000" stopOpacity=".2" /></linearGradient>
        <linearGradient id="bowl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#d9e8e4" /><stop offset=".35" stopColor="#ffffff" /><stop offset="1" stopColor="#c4d8d3" /></linearGradient>
      </defs>
      <ellipse cx="50" cy="75" rx="30" ry="3.2" fill="#000" opacity=".12" />
      <path d="M8 42 H92 C92 66 74 74 50 74 C26 74 8 66 8 42Z" fill="url(#bowl)" />
      <path d="M14 56 C30 64 70 64 86 56" stroke="#1c7a8c" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".85" />
      <ellipse cx="50" cy="42" rx="42" ry="7" fill="#eaf1ef" />
      <ellipse cx="50" cy="42" rx="40" ry="5.5" fill={c2} />
      <g>{pts.map((p) => <Item key={p.i} kind={kind} x={p.x} y={p.y} i={p.i} c1={c1} c2={c2} />)}</g>
      <path d="M8 42 Q50 52 92 42" fill="none" stroke="#fff" strokeWidth="1.4" opacity=".9" />
      <path d="M10 43 Q50 54 90 43 L89 46 Q50 57 11 46Z" fill="#f4f8f7" />
    </svg>
  );
}
