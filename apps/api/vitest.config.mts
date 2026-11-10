import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api',
  resolve: {
    conditions: ['liltech-platform'],
  },
  test: {
    name: 'api',
    watch: false,
    globals: true,
    environment: 'node',
    // The API validates its environment at import time. Tests use a placeholder
    // DATABASE_URL; real database integration is covered by api-e2e / docker compose.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost:5432/vitest_placeholder',
    },
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
