/**
 * Google Drive URL policy for Mini-CTF stage resources.
 *
 * Organizers paste folder links into the provisioning file; participants get
 * them back through the API. Only https links on Google Drive/Docs hosts are
 * accepted, so a compromised or careless configuration cannot turn the stage
 * card into an open redirect or a phishing surface.
 */

export const ALLOWED_DRIVE_HOSTS = ['drive.google.com', 'docs.google.com'] as const;

export class InvalidDriveUrlError extends Error {
  constructor(stageSlug: string, reason: string) {
    super(`${stageSlug}: assetDriveUrl ${reason}`);
    this.name = 'InvalidDriveUrlError';
  }
}

export function assertCtfDriveUrl(stageSlug: string, raw: string): string {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new InvalidDriveUrlError(stageSlug, 'is not a valid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new InvalidDriveUrlError(stageSlug, 'must use https');
  }

  if (!(ALLOWED_DRIVE_HOSTS as readonly string[]).includes(parsed.hostname)) {
    throw new InvalidDriveUrlError(
      stageSlug,
      `must point at one of ${ALLOWED_DRIVE_HOSTS.join(', ')}`,
    );
  }

  return parsed.toString();
}
