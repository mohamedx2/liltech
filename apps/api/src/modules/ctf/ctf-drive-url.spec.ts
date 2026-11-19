import { describe, expect, it } from 'vitest';
import { assertCtfDriveUrl, ALLOWED_DRIVE_HOSTS, InvalidDriveUrlError } from './ctf-drive-url';

describe('assertCtfDriveUrl', () => {
  it('accepts https Drive and Docs links', () => {
    expect(assertCtfDriveUrl('s1', 'https://drive.google.com/drive/folders/abc123')).toBe(
      'https://drive.google.com/drive/folders/abc123',
    );
    expect(assertCtfDriveUrl('s1', 'https://docs.google.com/document/d/xyz/view')).toBe(
      'https://docs.google.com/document/d/xyz/view',
    );
  });

  it('rejects non-Google hosts', () => {
    expect(() => assertCtfDriveUrl('s1', 'https://example.com/drive/folders/abc')).toThrow(
      InvalidDriveUrlError,
    );
    expect(() => assertCtfDriveUrl('s1', 'https://drive.google.com.evil.test/x')).toThrow(
      InvalidDriveUrlError,
    );
  });

  it('rejects non-https schemes and garbage', () => {
    expect(() => assertCtfDriveUrl('s1', 'http://drive.google.com/drive/folders/abc')).toThrow(
      InvalidDriveUrlError,
    );
    expect(() => assertCtfDriveUrl('s1', 'javascript:alert(1)')).toThrow(InvalidDriveUrlError);
    expect(() => assertCtfDriveUrl('s1', 'not a url')).toThrow(InvalidDriveUrlError);
  });

  it('documents the allowlist it enforces', () => {
    expect(ALLOWED_DRIVE_HOSTS).toEqual(['drive.google.com', 'docs.google.com']);
  });
});
