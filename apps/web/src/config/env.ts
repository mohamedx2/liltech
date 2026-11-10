import { z } from 'zod';

/**
 * Public (browser-exposed) environment variables.
 *
 * Only variables prefixed with `NEXT_PUBLIC_` reach the browser — they must
 * never contain secrets, database credentials, or CTF flags.
 * Server-only configuration lives exclusively in the API.
 */

const publicEnvSchema = z.object({
  /** Base URL of the API, e.g. `http://localhost:4000/api`. */
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000/api'),
  /** `real` talks to the API; `mock` uses the built-in mock adapter (UI development without a backend). */
  NEXT_PUBLIC_API_MODE: z.enum(['real', 'mock']).default('real'),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

function loadPublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_API_MODE: process.env.NEXT_PUBLIC_API_MODE,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment configuration:\n${parsed.error.issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n')}`,
    );
  }

  return parsed.data;
}

/** Validated public environment. Import this instead of `process.env`. */
export const env = loadPublicEnv();
