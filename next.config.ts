import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Versión publicada (Netlify entrega COMMIT_REF al compilar); se ve en /api/salud.
  env: { BUILD_COMMIT: (process.env.COMMIT_REF ?? "local").slice(0, 7) },
  experimental: {
    serverActions: {
      // Fotos de facturas y exportaciones de Vendty pueden pesar varios MB.
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
