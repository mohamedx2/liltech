import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep `next dev` from generating a nested AGENTS.md in the worktree.
  agentRules: false,
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
