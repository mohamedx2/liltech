/**
 * Turns the plain text of an organizer-written email into blocks that both the
 * API (HTML email) and the web (admin preview) render the same way.
 *
 * - blank lines separate paragraphs;
 * - lines starting with `*`, `•` or `-` (optionally repeated, e.g. `* *`)
 *   become list items;
 * - `[label](https://…)` becomes a named link, and a bare `https://…` link
 *   is kept as a link too.
 *
 * Pure and environment-independent: no HTML is produced here.
 */

export type EmailInline =
  { kind: 'text'; value: string } | { kind: 'link'; href: string; label: string | null };

export type EmailBlock =
  { kind: 'paragraph'; lines: EmailInline[][] } | { kind: 'list'; items: EmailInline[][] };

const BULLET = /^\s*(?:[*•-]\s*)+/;
/** `[label](url)` or a bare URL. */
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+)/g;
/** Trailing punctuation that ends a sentence rather than a bare URL. */
const TRAILING = /[.,;:!?)\]]+$/;

/** Splits one line into text and link tokens. */
export function parseEmailInline(line: string): EmailInline[] {
  const tokens: EmailInline[] = [];
  let last = 0;
  for (const match of line.matchAll(LINK)) {
    const start = match.index ?? 0;
    let length = match[0].length;
    let token: EmailInline;
    if (match[1] !== undefined && match[2] !== undefined) {
      token = { kind: 'link', href: match[2], label: match[1].trim() };
    } else {
      const raw = match[3] ?? '';
      const trailing = raw.match(TRAILING)?.[0] ?? '';
      const href = raw.slice(0, raw.length - trailing.length);
      length = href.length;
      token = { kind: 'link', href, label: null };
    }
    if (start > last) tokens.push({ kind: 'text', value: line.slice(last, start) });
    tokens.push(token);
    last = start + length;
  }
  if (last < line.length) tokens.push({ kind: 'text', value: line.slice(last) });
  return tokens;
}

/** Plain-text form of a line: a named link becomes `label: url`. */
export function emailInlineToText(tokens: EmailInline[]): string {
  return tokens
    .map((token) =>
      token.kind === 'text'
        ? token.value
        : token.label
          ? `${token.label}: ${token.href}`
          : token.href,
    )
    .join('');
}

/** Plain-text version of a whole body (named links spelled out). */
export function emailBodyToText(body: string): string {
  return body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => emailInlineToText(parseEmailInline(line)))
    .join('\n');
}

/** Parses an email body into paragraphs and bullet lists. */
export function parseEmailBody(body: string): EmailBlock[] {
  const blocks: EmailBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length)
      blocks.push({ kind: 'paragraph', lines: paragraph.map(parseEmailInline) });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ kind: 'list', items: list.map(parseEmailInline) });
    list = [];
  };

  for (const raw of body.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    if (BULLET.test(line)) {
      flushParagraph();
      list.push(line.replace(BULLET, '').trim());
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}
