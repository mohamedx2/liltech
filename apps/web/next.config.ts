import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Produces a self-contained server bundle for Docker deployments
  // (see apps/web/Dockerfile).
  output: 'standalone',
  turbopack: {
    resolveAlias: {
      'api-contracts': '../../libs/api-contracts/dist/index.js',
      shared: '../../libs/shared/dist/index.js',
    },
  },
};

export default nextConfig;
