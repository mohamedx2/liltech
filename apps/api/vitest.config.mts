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
    // The API validates its environment at import time. Unit tests use a
    // placeholder DATABASE_URL; database-backed integration tests additionally
    // require TEST_DATABASE_URL (see docs/backend/DEVELOPMENT.md) — when it is
    // absent, integration tests skip so the suite still runs database-free.
    // Integration suites share one Postgres database and each resets it, so
    // files must not run in parallel or they would delete each other's fixtures.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgresql://localhost:5432/vitest_placeholder',
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
