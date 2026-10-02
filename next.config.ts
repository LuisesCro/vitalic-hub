import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Fotos de facturas y exportaciones de Vendty pueden pesar varios MB.
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
