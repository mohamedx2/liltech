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

/** Empty values (`SMTP_USER=`) count as unset. */
const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

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

  /** Lifetime of authentication session tokens, in hours. */
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(24),

  /**
   * Reverse-proxy hops in front of the API whose X-Forwarded-For is trusted
   * (1 behind Caddy in production, 0 when the API is reached directly).
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  /** Team registrations accepted per client IP per hour. */
  REGISTRATION_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).max(10_000).default(10),

  /** Serve Swagger UI and the OpenAPI JSON. Off by default in production. */
  API_DOCS_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),

  /**
   * 32-byte key (base64) encrypting stored QR badge tokens so a team can see
   * its badges again. Generate with:
   * `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
   * Rotating it makes existing badges unreadable (a resend reissues them).
   */
  QR_TOKEN_KEY: z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
    message: 'QR_TOKEN_KEY must be 32 bytes encoded as base64',
  }),

  /** SMTP delivery of QR badge emails (Gmail: smtp.gmail.com, 465, app password). */
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  /** Sender shown on badge emails, e.g. `LilTech 2026 <liltech@gmail.com>`. Defaults to SMTP_USER. */
  MAIL_FROM: optionalString,
  /** Public site URL linked from badge emails. */
  PUBLIC_APP_URL: z.url().default('https://liltechsousse.com'),
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

/** Swagger is public in development and test, opt-in in production. */
export const apiDocsEnabled = env.API_DOCS_ENABLED ?? !isProduction;
