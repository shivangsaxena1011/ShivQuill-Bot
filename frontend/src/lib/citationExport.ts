import type { CitationResult } from '../api';

type Resolved = CitationResult['resolved'];

export interface BibliographyItem {
  id: string;
  style: string;
  entry: string; // formatted reference (may contain *italic* markers)
  inText: string;
  resolved: Resolved;
  addedAt: number;
}

const bibEscape = (s: string) => s.replace(/[{}\\]/g, '').replace(/([&%$#_])/g, '\\$1');

function citeKey(r: Resolved): string {
  const family = (r.authors[0]?.family || 'anon').toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '') || 'anon';
  const word = (r.title.split(/\s+/).find(w => w.length > 3) || 'work').toLowerCase().replace(/[^a-z]/g, '');
  return `${family}${r.year && /^\d{4}$/.test(r.year) ? r.year : ''}${word}`;
}

export function toBibTeX(r: Resolved): string {
  const type = r.sourceType === 'journal' ? 'article' : r.sourceType === 'book' ? 'book' : 'misc';
  const fields: Array<[string, string | undefined]> = [
    ['title', r.title],
    ['author', r.authors.map(a => (a.given ? `${a.family}, ${a.given}` : a.family)).join(' and ')],
    ['year', /^\d{4}$/.test(r.year) ? r.year : undefined],
    [type === 'article' ? 'journal' : 'howpublished', r.containerTitle],
    ['publisher', r.publisher],
    ['volume', r.volume],
    ['number', r.issue],
    ['pages', r.pages?.replace(/[–—]/g, '--')],
    ['doi', r.doi],
    ['url', r.url]
  ];
  const body = fields
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `  ${k} = {${k === 'url' || k === 'doi' ? v : bibEscape(v!)}}`)
    .join(',\n');
  return `@${type}{${citeKey(r)},\n${body}\n}`;
}

export function toRIS(r: Resolved): string {
  const type = r.sourceType === 'journal' ? 'JOUR' : r.sourceType === 'book' ? 'BOOK' : 'ELEC';
  const lines = [`TY  - ${type}`, `TI  - ${r.title}`];
  for (const a of r.authors) lines.push(`AU  - ${a.given ? `${a.family}, ${a.given}` : a.family}`);
  if (/^\d{4}$/.test(r.year)) lines.push(`PY  - ${r.year}`);
  if (r.containerTitle) lines.push(`${type === 'JOUR' ? 'JO' : 'T2'}  - ${r.containerTitle}`);
  if (r.publisher) lines.push(`PB  - ${r.publisher}`);
  if (r.volume) lines.push(`VL  - ${r.volume}`);
  if (r.issue) lines.push(`IS  - ${r.issue}`);
  if (r.pages) {
    const [sp, ep] = r.pages.split(/[–—-]/);
    if (sp) lines.push(`SP  - ${sp.trim()}`);
    if (ep) lines.push(`EP  - ${ep.trim()}`);
  }
  if (r.doi) lines.push(`DO  - ${r.doi}`);
  if (r.url) lines.push(`UR  - ${r.url}`);
  lines.push('ER  - ');
  return lines.join('\n');
}

/** Sorts references alphabetically like a reference list (by text, ignoring italics markers). */
export function sortBibliography(items: BibliographyItem[]): BibliographyItem[] {
  return [...items].sort((a, b) => a.entry.replace(/\*/g, '').localeCompare(b.entry.replace(/\*/g, ''), undefined, { sensitivity: 'base' }));
}
