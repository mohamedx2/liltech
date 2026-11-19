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
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgresql://localhost:5432/vitest_placeholder',
      // Test-only key (32 zero bytes); real keys come from the environment.
      QR_TOKEN_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      // Test-only pepper; the real one is a server-only secret (AGENTS.md §9).
      CTF_ANSWER_PEPPER: process.env.CTF_ANSWER_PEPPER ?? 'vitest-test-pepper-0123456789',
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
    // CI runs every project's lint/typecheck/test/build in parallel on a small
    // runner; bcrypt hashing and database round-trips then exceed Vitest's 5 s
    // default. A timed-out test keeps running while the next one resets the
    // shared database, so a too-short timeout also causes cascading failures.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
