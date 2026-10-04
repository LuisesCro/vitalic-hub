import type { MetadataRoute } from "next";

// Para "Agregar a pantalla de inicio": nombre, colores e ícono de Vitalic.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vitalic Hub",
    short_name: "Vitalic",
    description: "Caja, inventario, catálogo, precios y resultados de Vitalic",
    start_url: "/",
    display: "standalone",
    background_color: "#F3F7F6",
    theme_color: "#2BA1B8",
    icons: [
      { src: "/brand/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icono-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
