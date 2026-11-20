import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import type { BadgeColor } from 'api-contracts';
import { env } from '../../config/env';

/**
 * QR badge email delivery (Gmail SMTP in production).
 *
 * The transport is resolved lazily from `SMTP_*` variables. Without them the
 * mailer reports every send as failed (logged by the caller) so registration
 * still succeeds and the team can read its badges on the platform. Tests swap
 * in an in-memory transport with `setBadgeMailTransport`.
 */

export interface BadgeMailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments: Array<{ filename: string; content: Buffer; cid: string; contentType: string }>;
}

export interface BadgeMailTransport {
  sendMail(message: BadgeMailMessage): Promise<unknown>;
}

export interface BadgeEmail {
  to: string;
  participantName: string;
  teamName: string;
  color: BadgeColor | null;
  token: string;
}

const COLOR_STYLES: Record<BadgeColor, { label: string; hex: string; text: string }> = {
  blue: { label: 'Blue', hex: '#1a73e8', text: '#ffffff' },
  red: { label: 'Red', hex: '#d93025', text: '#ffffff' },
  yellow: { label: 'Yellow', hex: '#f9ab00', text: '#202124' },
  green: { label: 'Green', hex: '#188038', text: '#ffffff' },
};

let overrideTransport: BadgeMailTransport | null | undefined;
let smtpTransport: BadgeMailTransport | null | undefined;

/** Test hook: route badge emails to a custom transport (`null` = unconfigured). */
export function setBadgeMailTransport(transport: BadgeMailTransport | null | undefined): void {
  overrideTransport = transport;
}

function resolveTransport(): BadgeMailTransport | null {
  if (overrideTransport !== undefined) {
    return overrideTransport;
  }

  if (smtpTransport === undefined) {
    smtpTransport =
      env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS
        ? nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_PORT === 465,
            auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
            pool: true,
            maxConnections: 3,
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 20_000,
          })
        : null;
  }

  return smtpTransport;
}

export function isBadgeMailConfigured(): boolean {
  return resolveTransport() !== null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * QR module colors per badge group. They are darker than the brand colors so
 * every code keeps strong contrast on white and still scans reliably (the
 * yellow group uses a deep amber for that reason).
 */
const QR_MODULE_COLORS: Record<BadgeColor, string> = {
  blue: '#1a56c4',
  red: '#c5221f',
  yellow: '#a86200',
  green: '#137333',
};

function qrOptions(color: BadgeColor | null) {
  return {
    errorCorrectionLevel: 'M' as const,
    margin: 2,
    width: 360,
    color: { dark: color ? QR_MODULE_COLORS[color] : '#000000', light: '#ffffff' },
  };
}

/** PNG of the QR code for a badge token, drawn in the badge group color. */
export function renderQrPng(token: string, color: BadgeColor | null): Promise<Buffer> {
  return QRCode.toBuffer(token, { type: 'png', ...qrOptions(color) });
}

/** Data URL variant used by the team portal. */
export function renderQrDataUrl(token: string, color: BadgeColor | null): Promise<string> {
  return QRCode.toDataURL(token, qrOptions(color));
}

export async function buildBadgeEmail(email: BadgeEmail, from: string): Promise<BadgeMailMessage> {
  const style = email.color ? COLOR_STYLES[email.color] : null;
  const colorLabel = style?.label ?? 'Unassigned';
  const name = escapeHtml(email.participantName);
  const team = escapeHtml(email.teamName);
  const portalUrl = `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/login`;

  const text = [
    `Hi ${email.participantName},`,
    '',
    `Here is your personal QR badge for LilTech 2026 (team "${email.teamName}").`,
    `Your color group: ${colorLabel}.`,
    '',
    'Show the attached QR code at the entrance on November 21 at Campus EPI, Sousse.',
    'It is personal: do not share it outside your team.',
    `Your team can also display every badge after signing in at ${portalUrl}.`,
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#202124">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:${style?.hex ?? '#5f6368'};color:${style?.text ?? '#ffffff'};padding:16px 24px;font-size:18px;font-weight:bold">${escapeHtml(colorLabel)} group</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px">Hi ${name},</p>
<p style="margin:0 0 16px">Here is your personal QR badge for <strong>LilTech 2026</strong>, team <strong>${team}</strong>.</p>
<p style="text-align:center;margin:0 0 16px"><img src="cid:badge-qr" alt="Your QR badge" width="240" height="240" style="border:8px solid ${style?.hex ?? '#5f6368'};border-radius:8px"></p>
<p style="margin:0 0 8px">Show this QR code at the entrance on November 21 at Campus EPI, Sousse. It is personal: do not share it outside your team.</p>
<p style="margin:0">Your team can also display every badge after <a href="${escapeHtml(portalUrl)}">signing in</a>.</p>
</td></tr></table></body></html>`;

  return {
    from,
    to: email.to,
    subject: `Your LilTech 2026 QR badge (${colorLabel} group)`,
    text,
    html,
    attachments: [
      {
        filename: 'liltech-badge.png',
        content: await renderQrPng(email.token, email.color),
        cid: 'badge-qr',
        contentType: 'image/png',
      },
    ],
  };
}

/** Sends one badge email; resolves `true` on success, `false` when it could not be sent. */
export async function sendBadgeEmail(email: BadgeEmail): Promise<boolean> {
  const transport = resolveTransport();

  if (!transport) {
    return false;
  }

  const from = env.MAIL_FROM ?? env.SMTP_USER ?? 'LilTech 2026';
  await transport.sendMail(await buildBadgeEmail(email, from));
  return true;
}

/**
 * Sends a badge email with optional subject/body overrides for admin manual
 * dispatch. When overrides are provided the custom text replaces the default
 * copy; the QR image attachment is always included.
 */
export async function sendBadgeEmailWithTemplate(
  email: BadgeEmail,
  overrides: { subject?: string; body?: string } = {},
): Promise<boolean> {
  const transport = resolveTransport();

  if (!transport) {
    return false;
  }

  const from = env.MAIL_FROM ?? env.SMTP_USER ?? 'LilTech 2026';
  const base = await buildBadgeEmail(email, from);

  const message: BadgeMailMessage = {
    ...base,
    ...(overrides.subject ? { subject: overrides.subject } : {}),
    ...(overrides.body
      ? {
          text: overrides.body,
          html: `<!doctype html>\n<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#202124">\n<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">\n<tr><td style="padding:24px;white-space:pre-wrap">${escapeHtml(overrides.body)}</td></tr>\n</table></body></html>`,
        }
      : {}),
  };

  await transport.sendMail(message);
  return true;
}
