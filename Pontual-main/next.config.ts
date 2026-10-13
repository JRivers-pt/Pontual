// Force Vercel Deploy - 2026-02-15
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      {
        source: '/timesheet/corrections',
        destination: '/corrections',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
