import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Produces a self-contained server bundle for Docker deployments
  // (see apps/web/Dockerfile).
  output: 'standalone',
};

export default nextConfig;
