const NAMED: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  dollar: '$',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  bull: '•',
  middot: '·',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  zwnj: '',
  zwj: '',
  shy: '',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return NAMED[name.toLowerCase()] ?? whole;
  });
}

/**
 * Readable text from an email's HTML: block ends become line breaks, table cells become spaces (so
 * "Amount due" and "$120.00" in neighbouring cells read as one line), entities are decoded and the
 * invisible padding characters email builders put in preheaders are removed.
 */
export function htmlToText(html: string): string {
  const s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|ul|ol|h[1-6]|table|section|header|footer|center|blockquote)\s*>/gi, '\n')
    .replace(/<\/(td|th|span|a|b|strong|em|i|font)\s*>/gi, (m) => (/t[dh]/i.test(m) ? ' ' : ''))
    .replace(/<[^>]+>/g, ' ');
  return tidy(decodeEntities(s));
}

/** Collapses spaces, drops zero-width characters, keeps line breaks. */
export function tidy(text: string): string {
  return text
    .replace(/[​-‍⁠﻿͏­]/g, '')
    .replace(/[ \t   ]+/g, ' ')
    .replace(/ *\r?\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
