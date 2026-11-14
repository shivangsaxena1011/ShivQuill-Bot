#!/usr/bin/env node
/**
 * Builds backend/corpus/arxiv-abstracts.json from the public arXiv API.
 * arXiv metadata (titles, authors, abstracts) is released under CC0.
 *
 * Etiquette: one request at a time, >= 3 s between requests, max_results <= 100.
 * No third-party dependencies: Atom XML is parsed with simple string/regex handling.
 *
 * Usage: node scripts/fetch-corpus.mjs   (or: npm run corpus:fetch)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, '../corpus/arxiv-abstracts.json');

const API = 'http://export.arxiv.org/api/query';
const USER_AGENT = 'ShivQuill-corpus-builder/1.0';
const DELAY_MS = 3500;
const PER_CATEGORY = 28;
const MIN_ABSTRACT_CHARS = 300;

const CATEGORIES = [
  'cs.CL',
  'cs.LG',
  'cs.CV',
  'cs.CR',
  'cs.DC',
  'physics.optics',
  'q-bio.NC',
  'econ.EM',
  'math.CO',
  'astro-ph.GA',
  'stat.ML'
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

const collapse = (s) => decodeEntities(s).replace(/\s+/g, ' ').trim();

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : '';
}

function parseEntries(xml) {
  const entries = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const body = m[1];
    const rawId = collapse(tag(body, 'id')); // e.g. http://arxiv.org/abs/2101.00001v2
    const idMatch = rawId.match(/arxiv\.org\/abs\/(.+)$/);
    if (!idMatch) continue;
    const arxivId = idMatch[1].replace(/v\d+$/, '');
    const title = collapse(tag(body, 'title'));
    const abstract = collapse(tag(body, 'summary'));
    const authors = [];
    const aRe = /<author>([\s\S]*?)<\/author>/g;
    let a;
    while ((a = aRe.exec(body)) !== null) {
      const name = collapse(tag(a[1], 'name'));
      if (name) authors.push(name);
    }
    if (!arxivId || !title || authors.length === 0) continue;
    const authorStr = authors.slice(0, 3).join(', ') + (authors.length > 3 ? ', et al.' : '');
    entries.push({
      id: `arxiv-${arxivId.replace(/[./]/g, '-')}`,
      title,
      authorOrSource: `${authorStr} (arXiv)`,
      url: `https://arxiv.org/abs/${arxivId}`,
      text: abstract
    });
  }
  return entries;
}

async function fetchCategory(cat) {
  const params = new URLSearchParams({
    search_query: `cat:${cat}`,
    start: '0',
    max_results: String(PER_CATEGORY + 7), // a little headroom for short abstracts / dupes
    sortBy: 'relevance',
    sortOrder: 'descending'
  });
  const url = `${API}?${params.toString()}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseEntries(await res.text());
    } catch (err) {
      console.warn(`  [${cat}] attempt ${attempt} failed: ${err.message}`);
      if (attempt === 3) throw err;
      await sleep(DELAY_MS * attempt * 2);
    }
  }
  return [];
}

async function main() {
  const byId = new Map();
  const seenTitles = new Set();
  let first = true;

  for (const cat of CATEGORIES) {
    if (!first) await sleep(DELAY_MS);
    first = false;
    console.log(`Fetching ${cat} ...`);
    const entries = await fetchCategory(cat);
    let added = 0;
    for (const e of entries) {
      if (added >= PER_CATEGORY) break;
      if (e.text.length < MIN_ABSTRACT_CHARS) continue;
      const titleKey = e.title.toLowerCase();
      if (byId.has(e.id) || seenTitles.has(titleKey)) continue;
      byId.set(e.id, e);
      seenTitles.add(titleKey);
      added++;
    }
    console.log(`  ${cat}: ${entries.length} received, ${added} kept`);
  }

  if (byId.size === 0) {
    throw new Error('No documents fetched; refusing to write an empty corpus file.');
  }

  const docs = Array.from(byId.values()).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(docs, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${docs.length} documents to ${OUTPUT}`);
}

main().catch((err) => {
  console.error('fetch-corpus failed:', err.message);
  process.exit(1);
});
