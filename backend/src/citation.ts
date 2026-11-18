/**
 * Citation formatting for APA 7, MLA 9, Chicago (author-date) and Harvard.
 * Italics are marked with *asterisks* (the UI renders them; copy-as-text strips them).
 */

export interface CitationAuthor {
  given: string;
  family: string;
  /** Generational suffix: Jr., Sr., II, III, IV */
  suffix?: string;
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
const SUFFIX_RE = /^(jr|sr|ii|iii|iv)\.?$/i;
const normSuffix = (s: string) => (/^(jr|sr)/i.test(s) ? `${s.charAt(0).toUpperCase()}${s.charAt(1).toLowerCase()}.` : s.toUpperCase());

export function parseAuthorName(raw: string): CitationAuthor | null {
  let name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return null;
  // "Martin Luther King Jr." / "Martin Luther King, Jr." / "King, Martin Luther, Jr."
  let suffix: string | undefined;
  const tail = name.match(/,?\s+(Jr\.?|Sr\.?|II|III|IV)$/i);
  if (tail && name.length > tail[0].length) {
    suffix = normSuffix(tail[1]);
    name = name.slice(0, -tail[0].length).trim();
  }
  const withSuffix = (a: CitationAuthor): CitationAuthor => (suffix ? { ...a, suffix } : a);
  if (name.includes(',')) {
    const [family, ...rest] = name.split(',');
    const given = rest.map(r => r.trim()).filter(r => r && !SUFFIX_RE.test(r));
    const inlineSuffix = rest.map(r => r.trim()).find(r => SUFFIX_RE.test(r));
    if (inlineSuffix && !suffix) suffix = normSuffix(inlineSuffix.replace(/\.$/, ''));
    return withSuffix({ family: family.trim(), given: given.join(' ') });
  }
  const parts = name.split(' ');
  if (parts.length === 1) return withSuffix({ family: parts[0], given: '' });
  return withSuffix({ family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') });
}

/** "J.R.R." → "J. R. R.", "Jean-Paul" → "J.-P." (APA/Harvard initials) */
function initials(given: string): string {
  return given
    .split(/[\s.]+/)
    .filter(Boolean)
    .map(p =>
      p
        .split('-')
        .filter(Boolean)
        .map(h => `${h.charAt(0).toUpperCase()}.`)
        .join('-')
    )
    .join(' ');
}

/** Bare DOI ("10.1000/xyz") from a DOI, doi: prefix, or any doi.org URL form. */
export function normalizeDoi(doi?: string): string | undefined {
  if (!doi) return undefined;
  return (
    doi
      .trim()
      .replace(/^(?:https?:\/\/)?(?:dx\.|www\.)?doi\.org\//i, '')
      .replace(/^doi:?\s*/i, '')
      .trim() || undefined
  );
}
const cleanDoi = normalizeDoi;

const suffixAfter = (a: CitationAuthor) => (a.suffix ? `, ${a.suffix}` : '');

function link(src: CitationSource): string {
  const doi = cleanDoi(src.doi);
  if (doi) return `https://doi.org/${doi}`;
  return src.url?.trim() || '';
}

const end = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);

// ---------------- Author lists ----------------

function apaAuthors(authors: CitationAuthor[]): string {
  const fmt = (a: CitationAuthor) => (a.given ? `${a.family}, ${initials(a.given)}${suffixAfter(a)}` : a.family);
  if (authors.length === 1) return fmt(authors[0]);
  if (authors.length <= 20) {
    return `${authors.slice(0, -1).map(fmt).join(', ')}, & ${fmt(authors[authors.length - 1])}`;
  }
  // APA 7: first 19, ellipsis, final author
  return `${authors.slice(0, 19).map(fmt).join(', ')}, . . . ${fmt(authors[authors.length - 1])}`;
}

function mlaAuthors(authors: CitationAuthor[]): string {
  const first = authors[0];
  const firstFmt = first.given ? `${first.family}, ${first.given}${suffixAfter(first)}` : first.family;
  if (authors.length === 1) return firstFmt;
  if (authors.length === 2) {
    const b = authors[1];
    return `${firstFmt}, and ${b.given ? `${b.given} ${b.family}${b.suffix ? ` ${b.suffix}` : ''}` : b.family}`;
  }
  return `${firstFmt}, et al`;
}

function chicagoAuthors(authors: CitationAuthor[]): string {
  const full = (a: CitationAuthor) => (a.given ? `${a.given} ${a.family}${a.suffix ? ` ${a.suffix}` : ''}` : a.family);
  const first = authors[0].given ? `${authors[0].family}, ${authors[0].given}${suffixAfter(authors[0])}` : authors[0].family;
  if (authors.length === 1) return first;
  // Chicago 18th ed.: list up to six authors; for seven or more, the first three followed by et al.
  if (authors.length <= 6) {
    const rest = authors.slice(1).map(full);
    return rest.length === 1 ? `${first}, and ${rest[0]}` : `${first}, ${rest.slice(0, -1).join(', ')}, and ${rest[rest.length - 1]}`;
  }
  return `${first}, ${authors.slice(1, 3).map(full).join(', ')}, et al`;
}

function harvardAuthors(authors: CitationAuthor[]): string {
  const fmt = (a: CitationAuthor) => (a.given ? `${a.family}, ${initials(a.given)}${suffixAfter(a)}` : a.family);
  if (authors.length === 1) return fmt(authors[0]);
  if (authors.length <= 3) return `${authors.slice(0, -1).map(fmt).join(', ')} and ${fmt(authors[authors.length - 1])}`;
  return `${fmt(authors[0])} et al.`;
}

// ---------------- In-text ----------------

function inText(style: CitationStyle, src: CitationSource): string {
  const a = src.authors;
  const shortTitle = src.title.length > 40 ? `${src.title.slice(0, 40).trim()}…` : src.title;
  // No author: APA italicises the title of a stand-alone work (book, web page), quotes an article's
  const untitled = style === 'APA' && src.sourceType !== 'journal' ? `*${shortTitle}*` : `"${shortTitle}"`;
  const lead = a.length === 0
    ? untitled
    : a.length === 1
      ? a[0].family
      : a.length === 2
        ? `${a[0].family} ${style === 'APA' ? '&' : 'and'} ${a[1].family}`
        : a.length === 3 && style === 'Harvard'
          ? `${a[0].family}, ${a[1].family} and ${a[2].family}` // Harvard (Cite Them Right): et al. from four authors
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

  // MLA 9 leaves an unknown date out instead of writing "n.d."
  const year = /^n\.?\s?d\.?$/i.test(src.year.trim()) ? '' : src.year;
  if (src.sourceType === 'book') {
    parts.push(`*${end(src.title)}*`);
    const pub = [src.publisher, year].filter(Boolean).join(', ');
    if (pub) parts.push(end(pub));
  } else {
    parts.push(`"${end(src.title)}"`);
    const tail = [
      src.containerTitle ? `*${src.containerTitle}*` : src.publisher ? `*${src.publisher}*` : '',
      src.volume ? `vol. ${src.volume}` : '',
      src.issue ? `no. ${src.issue}` : '',
      year,
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
  // end(): a title ending in ?/! must not get an extra period ("*What Is Life?*." → "*What Is Life?*")
  if (src.sourceType === 'book') {
    body = `*${end(src.title)}*${src.publisher ? ` ${end(src.publisher)}` : ''}`;
  } else if (src.sourceType === 'journal') {
    const vol = src.volume ? `, ${src.volume}` : '';
    const iss = src.issue ? `(${src.issue})` : '';
    const pages = src.pages ? `, pp. ${src.pages}` : '';
    body = `'${src.title}'${src.containerTitle ? `, *${src.containerTitle}*${vol}${iss}${pages}` : ''}.`;
  } else {
    body = `*${end(src.title)}*${src.containerTitle || src.publisher ? ` ${end(src.containerTitle || src.publisher!)}` : ''}`;
  }
  const available = url ? ` Available at: ${url}` : '';
  return `${who}(${src.year}) ${body}${available}${available ? '.' : ''}`.trim();
}

export function formatCitation(style: CitationStyle, src: CitationSource): { inTextCitation: string; fullBibliographyEntry: string } {
  const entry = style === 'APA' ? apa(src) : style === 'MLA' ? mla(src) : style === 'Chicago' ? chicago(src) : harvard(src);
  return { inTextCitation: inText(style, src), fullBibliographyEntry: entry };
}
