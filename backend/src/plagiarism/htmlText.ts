/** Extracts readable body text from an HTML page (no DOM library; linear-time regex passes). */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ',
  ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', middot: '·', bull: '•', deg: '°', shy: ''
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ent: string) => {
    if (ent[0] === '#') {
      const n = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
    }
    return NAMED[ent.toLowerCase()] ?? whole;
  });
}

const BLOCK_TAGS = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|section|article|blockquote|pre|dd|dt|figcaption)\b[^>]*>/gi;

function stripBlocks(html: string, tags: string[]): string {
  let out = html;
  for (const tag of tags) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), ' ');
  }
  return out;
}

function toText(html: string): string {
  return decodeEntities(html.replace(BLOCK_TAGS, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v ]+/g, ' ')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2)
    .join('\n');
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim()).slice(0, 300);
  let body = html.replace(/<!--[\s\S]*?-->/g, ' ');
  body = stripBlocks(body, ['script', 'style', 'noscript', 'svg', 'template', 'head', 'iframe', 'canvas']);

  // Prefer the main content container when it holds most of the text
  const main = body.match(/<(article|main)\b[^>]*>([\s\S]*)<\/\1\s*>/i)?.[2];
  if (main) {
    const mainText = toText(stripBlocks(main, ['nav', 'aside', 'form', 'footer']));
    if (mainText.length > 400) return { title, text: mainText };
  }
  const text = toText(stripBlocks(body, ['nav', 'footer', 'header', 'aside', 'form']));
  return { title, text };
}
