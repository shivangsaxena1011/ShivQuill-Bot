/**
 * Citation formatting for APA 7, MLA 9, Chicago (author-date) and Harvard.
 * Italics are marked with *asterisks* (the UI renders them; copy-as-text strips them).
 */

export interface CitationAuthor {
  given: string;
  family: string;
}

export interface CitationSource {
  sourceType: 'website' | 'journal' | 'book';
  title: string;
  authors: CitationAuthor[];
  year: string;
  containerTitle?: string; // journal / website name
  publisher?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
}

export type CitationStyle = 'APA' | 'MLA' | 'Chicago' | 'Harvard';

/** Parses "Given Family", "Family, Given" or a single name into structured parts. */
export function parseAuthorName(raw: string): CitationAuthor | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return null;
  if (name.includes(',')) {
    const [family, ...rest] = name.split(',');
    return { family: family.trim(), given: rest.join(',').trim() };
  }
  const parts = name.split(' ');
  if (parts.length === 1) return { family: parts[0], given: '' };
  return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') };
}

function initials(given: string): string {
  return given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(p => `${p.charAt(0).toUpperCase()}.`)
    .join(' ');
}

function cleanDoi(doi?: string): string | undefined {
  if (!doi) return undefined;
  return doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '') || undefined;
}

function link(src: CitationSource): string {
  const doi = cleanDoi(src.doi);
  if (doi) return `https://doi.org/${doi}`;
  return src.url?.trim() || '';
}

const end = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);

// ---------------- Author lists ----------------

function apaAuthors(authors: CitationAuthor[]): string {
  const fmt = (a: CitationAuthor) => (a.given ? `${a.family}, ${initials(a.given)}` : a.family);
  if (authors.length === 1) return fmt(authors[0]);
  if (authors.length <= 20) {
    return `${authors.slice(0, -1).map(fmt).join(', ')}, & ${fmt(authors[authors.length - 1])}`;
  }
  // APA 7: first 19, ellipsis, final author
  return `${authors.slice(0, 19).map(fmt).join(', ')}, . . . ${fmt(authors[authors.length - 1])}`;
}

function mlaAuthors(authors: CitationAuthor[]): string {
  const first = authors[0];
  const firstFmt = first.given ? `${first.family}, ${first.given}` : first.family;
  if (authors.length === 1) return firstFmt;
  if (authors.length === 2) {
    const b = authors[1];
    return `${firstFmt}, and ${b.given ? `${b.given} ${b.family}` : b.family}`;
  }
  return `${firstFmt}, et al`;
}

function chicagoAuthors(authors: CitationAuthor[]): string {
  const full = (a: CitationAuthor) => (a.given ? `${a.given} ${a.family}` : a.family);
  const first = authors[0].given ? `${authors[0].family}, ${authors[0].given}` : authors[0].family;
  if (authors.length === 1) return first;
  if (authors.length <= 10) {
    const rest = authors.slice(1).map(full);
    return rest.length === 1 ? `${first}, and ${rest[0]}` : `${first}, ${rest.slice(0, -1).join(', ')}, and ${rest[rest.length - 1]}`;
  }
  return `${first}, ${authors.slice(1, 7).map(full).join(', ')}, et al`;
}

function harvardAuthors(authors: CitationAuthor[]): string {
  const fmt = (a: CitationAuthor) => (a.given ? `${a.family}, ${initials(a.given)}` : a.family);
  if (authors.length === 1) return fmt(authors[0]);
  if (authors.length <= 3) return `${authors.slice(0, -1).map(fmt).join(', ')} and ${fmt(authors[authors.length - 1])}`;
  return `${fmt(authors[0])} et al.`;
}

// ---------------- In-text ----------------

function inText(style: CitationStyle, src: CitationSource): string {
  const a = src.authors;
  const shortTitle = src.title.length > 40 ? `${src.title.slice(0, 40).trim()}…` : src.title;
  const lead = a.length === 0
    ? `"${shortTitle}"`
    : a.length === 1
      ? a[0].family
      : a.length === 2
        ? `${a[0].family} ${style === 'APA' ? '&' : 'and'} ${a[1].family}`
        : `${a[0].family} et al.`;

  switch (style) {
    case 'APA':
    case 'Harvard':
      return `(${lead}, ${src.year})`;
    case 'MLA':
      return `(${lead}${src.pages ? ` ${src.pages}` : ''})`;
    case 'Chicago':
      return `(${lead} ${src.year})`;
  }
}

// ---------------- Bibliography ----------------

function apa(src: CitationSource): string {
  const url = link(src);
  let title: string;
  let source = '';

  if (src.sourceType === 'journal') {
    title = end(src.title);
    if (src.containerTitle) {
      const vol = src.volume ? `, *${src.volume}*` : '';
      const iss = src.issue ? `(${src.issue})` : '';
      const pages = src.pages ? `, ${src.pages}` : '';
      source = `*${src.containerTitle}*${vol}${iss}${pages}.`;
    }
  } else if (src.sourceType === 'book') {
    title = `*${end(src.title)}*`;
    source = src.publisher ? end(src.publisher) : '';
  } else {
    title = `*${end(src.title)}*`;
    source = src.containerTitle || src.publisher ? end(src.containerTitle || src.publisher!) : '';
  }

  // APA: "Author. (Year). Title. Source." — with no author the title moves into the author position
  const parts = src.authors.length
    ? [end(apaAuthors(src.authors)), `(${src.year}).`, title, source]
    : [title, `(${src.year}).`, source];
  return [...parts, url].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function mla(src: CitationSource): string {
  const who = src.authors.length ? `${end(mlaAuthors(src.authors))} ` : '';
  const url = link(src).replace(/^https?:\/\//, src.doi ? 'https://' : '');
  const parts: string[] = [];

  if (src.sourceType === 'book') {
    parts.push(`*${end(src.title)}*`);
    const pub = [src.publisher, src.year].filter(Boolean).join(', ');
    if (pub) parts.push(end(pub));
  } else {
    parts.push(`"${end(src.title)}"`);
    const tail = [
      src.containerTitle ? `*${src.containerTitle}*` : src.publisher ? `*${src.publisher}*` : '',
      src.volume ? `vol. ${src.volume}` : '',
      src.issue ? `no. ${src.issue}` : '',
      src.year,
      src.pages ? `pp. ${src.pages}` : '',
      url
    ].filter(Boolean).join(', ');
    if (tail) parts.push(end(tail));
  }
  return `${who}${parts.join(' ')}`.trim();
}

function chicago(src: CitationSource): string {
  const who = src.authors.length ? `${end(chicagoAuthors(src.authors))} ` : '';
  const url = link(src);
  let body: string;
  if (src.sourceType === 'book') {
    body = `*${end(src.title)}*${src.publisher ? ` ${end(src.publisher)}` : ''}`;
  } else if (src.sourceType === 'journal') {
    const vol = src.volume ? ` ${src.volume}` : '';
    const iss = src.issue ? ` (${src.issue})` : '';
    const pages = src.pages ? `: ${src.pages}` : '';
    body = `"${end(src.title)}"${src.containerTitle ? ` *${src.containerTitle}*${vol}${iss}${pages}.` : ''}`;
  } else {
    body = `"${end(src.title)}"${src.containerTitle || src.publisher ? ` ${end(src.containerTitle || src.publisher!)}` : ''}`;
  }
  return `${who}${src.year}. ${body}${url ? ` ${url}.` : ''}`.replace(/\.\.$/, '.').trim();
}

function harvard(src: CitationSource): string {
  const who = src.authors.length ? `${harvardAuthors(src.authors)} ` : '';
  const url = link(src);
  let body: string;
  if (src.sourceType === 'book') {
    body = `*${src.title}*.${src.publisher ? ` ${end(src.publisher)}` : ''}`;
  } else if (src.sourceType === 'journal') {
    const vol = src.volume ? `, ${src.volume}` : '';
    const iss = src.issue ? `(${src.issue})` : '';
    const pages = src.pages ? `, pp. ${src.pages}` : '';
    body = `'${src.title}'${src.containerTitle ? `, *${src.containerTitle}*${vol}${iss}${pages}` : ''}.`;
  } else {
    body = `*${src.title}*.${src.containerTitle || src.publisher ? ` ${end(src.containerTitle || src.publisher!)}` : ''}`;
  }
  const available = url ? ` Available at: ${url}` : '';
  return `${who}(${src.year}) ${body}${available}${available ? '.' : ''}`.trim();
}

export function formatCitation(style: CitationStyle, src: CitationSource): { inTextCitation: string; fullBibliographyEntry: string } {
  const entry = style === 'APA' ? apa(src) : style === 'MLA' ? mla(src) : style === 'Chicago' ? chicago(src) : harvard(src);
  return { inTextCitation: inText(style, src), fullBibliographyEntry: entry };
}
