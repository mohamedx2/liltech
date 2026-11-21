import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import {
  DEFAULT_BADGE_EMAIL_BODY,
  DEFAULT_BADGE_EMAIL_SUBJECT,
  type BadgeColor,
} from 'api-contracts';
import { emailBodyToText, parseEmailBody, type EmailInline } from 'shared';
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

/** Organizer-written subject and body; omitted fields use the defaults. */
export interface BadgeEmailTemplate {
  subject?: string;
  body?: string;
}

const BRAND = {
  ink: '#111114',
  red: '#d93025',
  muted: '#5f6368',
  line: '#e6e6ea',
  page: '#f3f3f6',
};

/**
 * Replaces the `[participant name]`, `[team name]` and `[color]` markers for
 * one recipient. The result is plain text; it is HTML-escaped when rendered.
 */
export function personalizeTemplate(template: string, email: BadgeEmail): string {
  const colorLabel = (email.color ? COLOR_STYLES[email.color] : null)?.label ?? 'Unassigned';
  return template
    .replaceAll('[participant name]', email.participantName)
    .replaceAll('[team name]', email.teamName)
    .replaceAll('[color]', colorLabel);
}

function renderInline(tokens: EmailInline[]): string {
  return tokens
    .map((token) =>
      token.kind === 'link'
        ? `<a href="${escapeHtml(token.href)}" style="color:${BRAND.red};font-weight:bold;text-decoration:underline;${token.label ? '' : 'word-break:break-all'}">${escapeHtml(token.label ?? token.href)}</a>`
        : escapeHtml(token.value),
    )
    .join('');
}

/** Paragraphs and bullet lists of the (already personalized) body, as email-safe HTML. */
function renderBody(body: string): string {
  return parseEmailBody(body)
    .map((block) =>
      block.kind === 'paragraph'
        ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.ink}">${block.lines.map(renderInline).join('<br>')}</p>`
        : `<ul style="margin:0 0 16px;padding:0 0 0 20px;font-size:15px;line-height:1.6;color:${BRAND.ink}">${block.items
            .map((item) => `<li style="margin:0 0 6px">${renderInline(item)}</li>`)
            .join('')}</ul>`,
    )
    .join('\n');
}

/**
 * Builds the badge email: organizer text (default or custom) in a branded
 * layout, then a card with the participant's personal QR code shown inline.
 * The raw token travels only inside the QR image, never in the text.
 */
export async function buildBadgeEmail(
  email: BadgeEmail,
  from: string,
  template: BadgeEmailTemplate = {},
): Promise<BadgeMailMessage> {
  const style = email.color ? COLOR_STYLES[email.color] : null;
  const colorLabel = style?.label ?? 'Unassigned';
  const groupHex = style?.hex ?? BRAND.muted;
  const groupText = style?.text ?? '#ffffff';
  const portalUrl = `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/login`;
  const subject = personalizeTemplate(
    template.subject?.trim() || DEFAULT_BADGE_EMAIL_SUBJECT,
    email,
  );
  const body = personalizeTemplate(template.body?.trim() || DEFAULT_BADGE_EMAIL_BODY, email);

  const text = [
    emailBodyToText(body),
    '',
    '----------------------------------------',
    `Your personal QR badge is attached (liltech-badge.png). Color group: ${colorLabel}.`,
    'Present it at the entrance to check in. It is personal: do not share it.',
    `Your team can also display every badge after signing in at ${portalUrl}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.page};font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.line}">
<tr><td style="background:${BRAND.ink};padding:28px 32px">
<div style="font-size:24px;font-weight:bold;color:#ffffff;letter-spacing:.5px">LilTech <span style="color:${BRAND.red}">2026</span></div>
<div style="margin-top:6px;font-size:13px;color:#c9c9d1;letter-spacing:.4px">ONE NIGHT · TWO CHALLENGES · NOVEMBER 21–22, 2026</div>
</td></tr>
<tr><td style="height:4px;background:${BRAND.red};line-height:4px;font-size:0">&nbsp;</td></tr>
<tr><td style="padding:32px 32px 8px">
${renderBody(body)}
</td></tr>
<tr><td style="padding:8px 32px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.line};border-radius:14px">
<tr><td align="center" style="padding:24px">
<div style="font-size:12px;font-weight:bold;letter-spacing:1px;color:${BRAND.muted};text-transform:uppercase">Your personal QR badge</div>
<div style="margin:10px 0 0"><span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${groupHex};color:${groupText};font-size:13px;font-weight:bold">${escapeHtml(colorLabel)} group</span></div>
<div style="margin:16px 0"><img src="cid:badge-qr" alt="Your personal QR badge" width="220" height="220" style="display:block;margin:0 auto;border:6px solid ${groupHex};border-radius:12px"></div>
<div style="font-size:15px;font-weight:bold;color:${BRAND.ink}">${escapeHtml(email.participantName)}</div>
<div style="font-size:13px;color:${BRAND.muted};margin-top:2px">Team ${escapeHtml(email.teamName)}</div>
<div style="font-size:13px;color:${BRAND.muted};margin-top:12px;line-height:1.5">Present this code at the entrance to check in.<br>It is personal — please do not share it.</div>
</td></tr></table>
</td></tr>
<tr><td style="background:#fafafb;border-top:1px solid ${BRAND.line};padding:20px 32px;font-size:12px;line-height:1.6;color:${BRAND.muted}">
Your team can also display every badge after <a href="${escapeHtml(portalUrl)}" style="color:${BRAND.red}">signing in to the platform</a>.<br>
LilTech 2026 · Organized by GDG on Campus EPI and ISITCom Google Club
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return {
    from,
    to: email.to,
    subject,
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

function senderAddress(): string {
  const address = env.MAIL_FROM ?? env.SMTP_USER;
  // A display name makes the email look like it comes from the event, not a bare inbox.
  return address && !address.includes('<')
    ? `LilTech 2026 <${address}>`
    : (address ?? 'LilTech 2026');
}

/** Sends one badge email with the default copy; resolves `false` when it could not be sent. */
export async function sendBadgeEmail(email: BadgeEmail): Promise<boolean> {
  return sendBadgeEmailWithTemplate(email);
}

/**
 * Sends one badge email with optional organizer-written subject and body
 * (admin dispatch). The QR card and layout are always the same.
 */
export async function sendBadgeEmailWithTemplate(
  email: BadgeEmail,
  template: BadgeEmailTemplate = {},
): Promise<boolean> {
  const transport = resolveTransport();

  if (!transport) {
    return false;
  }

  await transport.sendMail(await buildBadgeEmail(email, senderAddress(), template));
  return true;
}
