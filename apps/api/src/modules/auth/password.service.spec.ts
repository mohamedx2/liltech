import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.service';

describe('password service', () => {
  it('produces a salted, slow hash that verifies the original password', async () => {
    const hash = await hashPassword('a-deliberately-long-password');

    expect(hash).not.toContain('a-deliberately-long-password');
    expect(hash.startsWith('$2')).toBe(true);

    expect(await verifyPassword('a-deliberately-long-password', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('a-deliberately-long-password');

    expect(await verifyPassword('a-deliberately-long-passphrase', hash)).toBe(false);
  });

  it('salts per hash — identical passwords hash differently', async () => {
    const first = await hashPassword('same-input-password');
    const second = await hashPassword('same-input-password');

    expect(first).not.toBe(second);
    expect(await verifyPassword('same-input-password', first)).toBe(true);
    expect(await verifyPassword('same-input-password', second)).toBe(true);
  });
});
