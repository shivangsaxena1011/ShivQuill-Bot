/**
 * Extracts readable body text from an HTML page without a DOM library.
 * Every pass only moves forward (unclosed comments/tags are cut to the end of the input once),
 * so hostile or broken HTML can't trigger quadratic regex backtracking.
 */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ',
  ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', middot: '·', bull: '•', deg: '°', shy: ''
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,8}|#\d{1,9}|[a-z]{2,10});/gi, (whole, ent: string) => {
    if (ent[0] === '#') {
      const n = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
    }
    return NAMED[ent.toLowerCase()] ?? whole;
  });
}

/** Removes <!-- comments -->; an unclosed comment removes the rest of the document. */
function stripComments(html: string): string {
  let out = '';
  let pos = 0;
  for (;;) {
    const open = html.indexOf('<!--', pos);
    if (open === -1) return out + html.slice(pos);
    out += html.slice(pos, open) + ' ';
    const close = html.indexOf('-->', open + 4);
    if (close === -1) return out;
    pos = close + 3;
  }
}

/** Removes <tag …>…</tag> blocks for the given tag names in one forward pass. */
function stripBlocks(html: string, tags: string[]): string {
  const openRe = new RegExp(`<(${tags.join('|')})\\b`, 'gi');
  let out = '';
  let pos = 0;
  for (;;) {
    openRe.lastIndex = pos;
    const m = openRe.exec(html);
    if (!m) return out + html.slice(pos);
    out += html.slice(pos, m.index) + ' ';
    const tagEnd = html.indexOf('>', m.index);
    if (tagEnd === -1) return out;
    const closeRe = new RegExp(`</${m[1]}\\s*>`, 'gi');
    closeRe.lastIndex = tagEnd + 1;
    const c = closeRe.exec(html);
    if (!c) return out;
    pos = c.index + c[0].length;
  }
}

/** Inner HTML of the first <article>/<main> up to its last closing tag (linear: one search each way). */
function mainContent(html: string): string | null {
  const open = /<(article|main)\b[^<>]*>/i.exec(html);
  if (!open) return null;
  const closeRe = new RegExp(`</${open[1]}\\s*>`, 'gi');
  closeRe.lastIndex = open.index + open[0].length;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = closeRe.exec(html)) !== null) last = m;
  return last ? html.slice(open.index + open[0].length, last.index) : null;
}

// [^<>]* (not [^>]*) so a stray "<" without ">" can't make each match scan to the end of the input
const BLOCK_TAGS = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|section|article|blockquote|pre|dd|dt|figcaption)\b[^<>]*>/gi;

function toText(html: string): string {
  return decodeEntities(html.replace(BLOCK_TAGS, '\n').replace(/<[^<>]*>/g, ' '))
    .replace(/[ \t\f\v ]+/g, ' ')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2)
    .join('\n');
}

export function htmlToText(html: string): { title: string; text: string } {
  const titleOpen = /<title\b[^<>]*>/i.exec(html);
  let title = '';
  if (titleOpen) {
    const closeRe = /<\/title/gi;
    closeRe.lastIndex = titleOpen.index;
    const end = closeRe.exec(html)?.index ?? -1;
    if (end !== -1) title = decodeEntities(html.slice(titleOpen.index + titleOpen[0].length, end).replace(/\s+/g, ' ').trim()).slice(0, 300);
  }
  let body = stripComments(html);
  body = stripBlocks(body, ['script', 'style', 'noscript', 'svg', 'template', 'head', 'iframe', 'canvas']);

  // Prefer the main content container when it holds most of the text
  const main = mainContent(body);
  if (main) {
    const mainText = toText(stripBlocks(main, ['nav', 'aside', 'form', 'footer']));
    if (mainText.length > 400) return { title, text: mainText };
  }
  const text = toText(stripBlocks(body, ['nav', 'footer', 'header', 'aside', 'form']));
  return { title, text };
}
