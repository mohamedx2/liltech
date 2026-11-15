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
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgresql://localhost:5432/vitest_placeholder',
      // Test-only key (32 zero bytes); real keys come from the environment.
      QR_TOKEN_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      // Suites register many teams from one IP; the limiter itself is unit-tested.
      REGISTRATION_RATE_LIMIT_PER_HOUR: '10000',
      // Never reach a real mailbox from tests, even when a local .env has SMTP
      // credentials (empty values count as unset).
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASS: '',
    },
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    // Integration suites share one test database and reset it between tests,
    // so test files must not run concurrently.
    fileParallelism: false,
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
