import { describe, it, expect } from 'vitest';
import { emailBodyToText, parseEmailBody, parseEmailInline } from './email-text.js';

describe('email text', () => {
  it('parses named links and bare links, leaving sentence punctuation outside', () => {
    expect(
      parseEmailInline('See [the form](https://example.com/f) or https://example.com/x.'),
    ).toEqual([
      { kind: 'text', value: 'See ' },
      { kind: 'link', href: 'https://example.com/f', label: 'the form' },
      { kind: 'text', value: ' or ' },
      { kind: 'link', href: 'https://example.com/x', label: null },
      { kind: 'text', value: '.' },
    ]);
  });

  it('splits paragraphs on blank lines and turns bullet lines into a list', () => {
    const blocks = parseEmailBody(
      'Dear Sarra,\r\nWelcome!\r\n\r\nDetails:\r\n• Date: Nov 21\r\n* * Time: 14:00\r\n\r\nBye',
    );
    expect(blocks.map((block) => block.kind)).toEqual([
      'paragraph',
      'paragraph',
      'list',
      'paragraph',
    ]);
    expect(blocks[0]).toEqual({
      kind: 'paragraph',
      lines: [[{ kind: 'text', value: 'Dear Sarra,' }], [{ kind: 'text', value: 'Welcome!' }]],
    });
    expect(blocks[2]).toEqual({
      kind: 'list',
      items: [[{ kind: 'text', value: 'Date: Nov 21' }], [{ kind: 'text', value: 'Time: 14:00' }]],
    });
  });

  it('spells out named links in the plain-text version', () => {
    expect(emailBodyToText('Open [Maps](https://maps.example.com)\nBye')).toBe(
      'Open Maps: https://maps.example.com\nBye',
    );
  });
});
