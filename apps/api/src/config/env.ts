import { z } from 'zod';

/**
 * Environment configuration for the API.
 *
 * Variables are validated once at startup. The process must fail fast when the
 * configuration is invalid — an API that starts with a half-valid environment
 * is worse than one that does not start at all.
 *
 * All variables are documented in the root `.env.example`.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Port the API listens on. */
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().min(1).default('0.0.0.0'),

  /** Comma-separated list of allowed origins for CORS, e.g. `http://localhost:3000`. */
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /** PostgreSQL connection string used by Prisma. Server-only — never expose to the frontend. */
  DATABASE_URL: z.string().startsWith('postgresql://', {
    message: 'DATABASE_URL must be a valid PostgreSQL connection string',
  }),
});

export type Env = z.infer<typeof envSchema>;

export type EnvSource = NodeJS.ProcessEnv;

/**
 * Parse and validate environment variables.
 * Exposed separately from `env` to allow testability with custom sources.
 */
export function loadEnv(source: EnvSource = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}

/** Validated environment. Import this in feature code instead of `process.env`. */
export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

/** Allowed CORS origins, parsed from the comma-separated `CORS_ORIGIN` variable. */
export function corsOrigins(): string[] {
  return env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
