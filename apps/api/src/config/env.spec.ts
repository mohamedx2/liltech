import { describe, expect, it } from 'vitest';
import { CTF_PEPPER_MIN_LENGTH, loadEnv, type EnvSource } from './env';

const validSource = (): EnvSource => ({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/liltech_test',
  QR_TOKEN_KEY: Buffer.alloc(32, 1).toString('base64'),
  CTF_ANSWER_PEPPER: 'p'.repeat(CTF_PEPPER_MIN_LENGTH),
});

describe('CTF environment configuration', () => {
  it('accepts a production-strength answer pepper', () => {
    expect(loadEnv(validSource()).CTF_ANSWER_PEPPER).toHaveLength(CTF_PEPPER_MIN_LENGTH);
  });

  it('rejects a missing answer pepper during startup validation', () => {
    const source = validSource();
    delete source.CTF_ANSWER_PEPPER;

    expect(() => loadEnv(source)).toThrow(/CTF_ANSWER_PEPPER/);
  });

  it('rejects an answer pepper that is too short', () => {
    expect(() =>
      loadEnv({ ...validSource(), CTF_ANSWER_PEPPER: 'p'.repeat(CTF_PEPPER_MIN_LENGTH - 1) }),
    ).toThrow(/at least 32 characters/);
  });
});
