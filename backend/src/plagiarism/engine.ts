/**
 * Plagiarism scan orchestration (free sources only).
 *
 * Flow (same shape as commercial checkers such as Copyleaks, which QuillBot uses):
 *   distinctive phrases → search engines/indexes → candidate pages → download page text →
 *   compare with the document → identical / minor-changes / paraphrased passages → report.
 */
import { defaultCorpusManager } from '../corpus.js';
import { detectLanguageCode } from '../languageDetect.js';
import { config } from '../config.js';
import { TtlCache } from './cache.js';
import { htmlToText } from './htmlText.js';
import { compareWithSource, prepareInput, MatchType } from './matcher.js';
import { generateQueries, SearchQuery } from './queries.js';
import {
  Candidate,
  ProviderBlockedError,
  ProviderStatus,
  SearchProvider,
  SourceKind,
  configuredProviders,
  fetchWikipediaText
} from './providers.js';
import { safeFetch } from './safeFetch.js';
import { quotedRanges } from './text.js';

export interface PlagiarismSource {
  id: string;
  url: string;
  title: string;
  authorOrSource: string;
  kind: SourceKind;
  matchedPercent: number;
  matchedWords: number;
  identicalWords: number;
  minorChangesWords: number;
  paraphrasedWords: number;
  /** true when only the search-result snippet could be compared (page not downloadable) */
  snippetOnly: boolean;
  matchedText: string;
}

export interface PlagiarismSegment {
  text: string;
  start: number;
  end: number;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
  matchType: MatchType;
  sourceExcerpt: string;
}

export interface ProviderCoverage {
  id: string;
  label: string;
  status: ProviderStatus;
  queried: number;
  results: number;
  message?: string;
}

export interface PlagiarismReport {
  similarityScore: number;
  uniquenessScore: number;
  totalWordsChecked: number;
  matchedWords: number;
  breakdown: { identical: number; minorChanges: number; paraphrased: number };
  matchedSources: PlagiarismSource[];
  matchedSegments: PlagiarismSegment[];
  excludedQuotedWords: number;
  corpusStats: { indexedDocuments: number; totalCorpusShingles: number; searchedScope: string; note: string };
  coverage: {
    online: boolean;
    queries: string[];
    providers: ProviderCoverage[];
    sourcesFound: number;
    sourcesCompared: number;
    complete: boolean;
    durationMs: number;
    note: string;
  };
}

export interface ScanOptions {
  excludeQuotes?: boolean;
  signal?: AbortSignal;
  onStatus?: (message: string) => void;
  /** Force online search on/off (defaults: on, except NODE_ENV=test or PLAGIARISM_ONLINE=false) */
  online?: boolean;
  providers?: SearchProvider[];
}

const intEnv = (name: string, fallback: number, min: number, max: number) => {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const MAX_QUERIES = intEnv('PLAGIARISM_MAX_QUERIES', 8, 1, 40);
const ACADEMIC_QUERIES = 2;
const MAX_FETCH = intEnv('PLAGIARISM_MAX_PAGES', 14, 1, 60);
const SEARCH_BUDGET_MS = intEnv('PLAGIARISM_SEARCH_BUDGET_MS', 22000, 3000, 120000);
const FETCH_BUDGET_MS = intEnv('PLAGIARISM_FETCH_BUDGET_MS', 16000, 3000, 120000);
const MAX_SEGMENTS = 600;

const searchCache = new TtlCache<Candidate[]>(2000, 6 * 3600_000);
/** Providers that throttled/challenged us are rested (across scans) instead of being retried */
const cooldowns = new Map<string, { until: number; status: ProviderStatus; reason: string }>();
const UNREACHABLE_PAUSE_SEC = intEnv('PLAGIARISM_UNREACHABLE_PAUSE_SEC', 300, 10, 3600);

/** Timeouts and connection failures: the provider isn't answering this server (e.g. blocked from a cloud IP). */
function isUnreachable(err: any): boolean {
  const code = String(err?.code || err?.cause?.code || '');
  // Dropped connections (ECONNRESET / "socket hang up") are usually transient, so they don't count
  if (['ETIMEDOUT', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)) return true;
  return /timed out/i.test(String(err?.message || ''));
}
const pageCache = new TtlCache<string>(400, 3600_000, 60_000_000, s => s.length);

function linkedSignal(parent: AbortSignal | undefined, ms: number): { signal: AbortSignal; dispose: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  parent?.addEventListener('abort', onAbort, { once: true });
  if (parent?.aborted) ctrl.abort();
  return {
    signal: ctrl.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onAbort);
    }
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (ms <= 0 || signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = '';
    for (const p of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(p)) url.searchParams.delete(p);
    url.hostname = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
    url.protocol = 'https:';
    return url.toString().replace(/\/$/, '');
  } catch {
    return u;
  }
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    })
  );
}

interface FoundCandidate {
  c: Candidate;
  hits: number;
  firstQuery: number;
}

/**
 * One gate per provider, shared by every scan on this server: concurrency and the minimum interval
 * between requests hold even when several users scan at the same time.
 */
interface Gate {
  active: number;
  nextSlot: number;
  waiters: Array<() => void>;
}
const gates = new Map<string, Gate>();

async function acquire(p: SearchProvider, signal: AbortSignal): Promise<(() => void) | null> {
  let g = gates.get(p.id);
  if (!g) gates.set(p.id, (g = { active: 0, nextSlot: 0, waiters: [] }));
  const gate = g;
  while (gate.active >= p.concurrency) {
    if (signal.aborted) return null;
    await new Promise<void>(resolve => {
      gate.waiters.push(resolve);
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
  }
  if (signal.aborted) return null;
  gate.active++;
  const release = () => {
    gate.active--;
    // wake everyone; they re-check the limit (stale resolvers from aborted scans are harmless)
    const ws = gate.waiters;
    gate.waiters = [];
    ws.forEach(w => w());
  };
  const wait = gate.nextSlot - Date.now();
  gate.nextSlot = Math.max(Date.now(), gate.nextSlot) + p.minIntervalMs;
  await sleep(wait, signal);
  return release;
}

async function runProvider(
  p: SearchProvider,
  queries: SearchQuery[],
  lang: string,
  signal: AbortSignal,
  found: Map<string, FoundCandidate>,
  cov: ProviderCoverage
) {
  let next = 0;
  let stop = false;
  let answered = 0; // successful (or cached) answers, with or without results
  let errors = 0;
  const cd = cooldowns.get(p.id);
  const resting = (cd?.until || 0) - Date.now();
  if (cd && resting > 0) {
    // Skip instantly instead of waiting on a provider that throttled us or isn't answering
    cov.status = cd.status;
    cov.message = `${cd.reason}; skipped for another ${Math.ceil(resting / 1000)}s`;
    return;
  }
  if (p.maxQueries) queries = queries.slice(0, p.maxQueries);
  const worker = async () => {
    while (!stop && !signal.aborted && next < queries.length) {
      const qi = next++;
      const q = queries[qi].text;
      const cacheKey = `${p.id}:${lang}:${q}`;
      let results = searchCache.get(cacheKey);
      if (!results) {
        const release = await acquire(p, signal);
        if (!release) return;
        try {
          if (signal.aborted || stop || (cooldowns.get(p.id)?.until || 0) > Date.now()) return;
          cov.queried++;
          results = await p.search(q, { lang, signal });
          searchCache.set(cacheKey, results, results.length ? 6 * 3600_000 : 1800_000);
        } catch (err: any) {
          if (err instanceof ProviderBlockedError) {
            cov.status = err.status;
            cov.message = err.message;
            const restSec = Math.min(900, err.retryAfterSec ?? (err.status === 'blocked' ? 600 : 120));
            cooldowns.set(p.id, {
              until: Date.now() + restSec * 1000,
              status: err.status,
              reason: err.status === 'blocked' ? 'Asked for a human check' : 'Asked us to slow down'
            });
            stop = true; // never hammer a provider that throttled or challenged us
            return;
          }
          if (signal.aborted) return;
          // Only when it hasn't answered at all in this scan: a provider that just worked had a hiccup
          if (isUnreachable(err) && answered === 0) {
            // One timeout is enough: waiting ~7s per query on a provider that can't be reached from this
            // server made every scan ~20s slower. Pause it for all scans for a few minutes.
            cov.status = 'failed';
            cov.message = `Not responding (${String(err?.message || 'timeout').slice(0, 60)}); paused for ${UNREACHABLE_PAUSE_SEC}s`;
            cooldowns.set(p.id, { until: Date.now() + UNREACHABLE_PAUSE_SEC * 1000, status: 'failed', reason: 'Not responding from this server' });
            errors++;
            stop = true;
            return;
          }
          errors++;
          cov.message = String(err?.message || err).slice(0, 160);
          continue;
        } finally {
          release();
        }
      }
      answered++;
      cov.results += results.length;
      for (const c of results) {
        const key = normalizeUrl(c.url);
        const prev = found.get(key);
        if (prev) {
          prev.hits++;
          if (!prev.c.snippet && c.snippet) prev.c.snippet = c.snippet;
          else if (c.snippet && prev.c.snippet && !prev.c.snippet.includes(c.snippet)) prev.c.snippet += ` … ${c.snippet}`;
        } else {
          found.set(key, { c: { ...c }, hits: 1, firstQuery: qi });
        }
      }
    }
  };
  await Promise.all(Array.from({ length: p.concurrency }, worker));
  if (cov.status === 'rate_limited' || cov.status === 'blocked') return;
  // Decided once at the end: one transient error doesn't make the scan "partial" if other queries worked
  cov.status = cov.results > 0 ? 'ok' : answered > 0 ? 'no_results' : errors > 0 ? 'failed' : 'skipped';
  if (cov.status !== 'failed' && errors === 0) cov.message = undefined;
  if (signal.aborted && answered + errors < queries.length && cov.status !== 'failed') cov.message = 'Search time budget reached';
}

async function loadText(cand: Candidate, signal: AbortSignal): Promise<{ text: string; snippetOnly: boolean }> {
  if (cand.text) return { text: cand.text, snippetOnly: false };
  const key = normalizeUrl(cand.url);
  const cached = pageCache.get(key);
  if (cached !== undefined) return cached ? { text: cached, snippetOnly: false } : { text: cand.snippet || '', snippetOnly: true };
  let text = '';
  try {
    if (cand.kind === 'wikipedia' && cand.wikiPageId && cand.wikiLang) {
      text = await fetchWikipediaText(cand.wikiLang, cand.wikiPageId, signal);
    } else if (!/\.(pdf|docx?|pptx?|xlsx?|zip|mp4|mp3|jpg|png)(\?|$)/i.test(cand.url)) {
      const r = await safeFetch(cand.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ShivQuill-PlagiarismChecker/2.4)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9'
        },
        signal,
        timeoutMs: 8000,
        maxBytes: 2_500_000
      });
      if (r.status === 200 && /html|text\/plain|xml/.test(r.contentType || 'text/html')) {
        text = r.contentType.includes('text/plain') ? r.body : htmlToText(r.body).text;
      }
    }
  } catch {
    text = '';
  }
  if (signal.aborted && !text) return { text: cand.snippet || '', snippetOnly: true };
  pageCache.set(key, text, text ? 3600_000 : 600_000);
  return text ? { text, snippetOnly: false } : { text: cand.snippet || '', snippetOnly: true };
}

const pct = (part: number, whole: number) => (whole <= 0 || part <= 0 ? 0 : Math.max(1, Math.min(100, Math.round((part / whole) * 100))));

/**
 * Splits a rounded total (e.g. similarity 50%) across parts (identical/minor/paraphrased word counts)
 * so the parts add up exactly to it (largest remainder); any non-zero part shows at least 1% when possible.
 */
function splitPercent(parts: number[], total: number): number[] {
  const sum = parts.reduce((a, b) => a + b, 0);
  if (!sum || !total) return parts.map(() => 0);
  const exact = parts.map(p => (p / sum) * total);
  const out = exact.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => i).sort((a, b) => exact[b] - out[b] - (exact[a] - out[a]));
  for (const i of order) {
    if (rest <= 0) break;
    out[i]++;
    rest--;
  }
  // give tiny non-zero parts 1% taken from the largest part
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] > 0 && out[i] === 0) {
      const big = out.indexOf(Math.max(...out));
      if (out[big] > 1) {
        out[big]--;
        out[i] = 1;
      }
    }
  }
  return out;
}

export async function scanForPlagiarism(text: string, opts: ScanOptions = {}): Promise<PlagiarismReport> {
  const t0 = Date.now();
  const status = (m: string) => opts.onStatus?.(m);
  const input = prepareInput(text);
  const n = input.tokens.length;
  const online = opts.online ?? (process.env.PLAGIARISM_ONLINE !== 'false' && config.env !== 'test');

  // Optional: words inside quotation marks are not counted as plagiarism
  let excludeMask: Uint8Array | undefined;
  let excludedQuotedWords = 0;
  if (opts.excludeQuotes) {
    excludeMask = new Uint8Array(n);
    // Tokens and quote ranges are both sorted: walk them together (linear)
    const ranges = quotedRanges(text);
    let r = 0;
    input.tokens.forEach((t, i) => {
      while (r < ranges.length && ranges[r][1] <= t.start) r++;
      if (r < ranges.length && t.start >= ranges[r][0] && t.end <= ranges[r][1]) {
        excludeMask![i] = 1;
        excludedQuotedWords++;
      }
    });
  }

  const providers = opts.providers ?? configuredProviders();
  const coverage: ProviderCoverage[] = providers.map(p => ({ id: p.id, label: p.label, status: 'skipped' as ProviderStatus, queried: 0, results: 0 }));
  const found = new Map<string, FoundCandidate>();
  const queries = online && n >= 12 ? generateQueries(text, input.tokens, input.sentences, MAX_QUERIES) : [];
  const lang = detectLanguageCode(text);

  // ---- 1. search ------------------------------------------------------------------------
  if (queries.length) {
    status(`Searching the web, Wikipedia and scholarly indexes (${queries.length} phrases)…`);
    const { signal, dispose } = linkedSignal(opts.signal, SEARCH_BUDGET_MS);
    try {
      await Promise.all(
        providers.map((p, i) => runProvider(p, p.academic ? queries.slice(0, ACADEMIC_QUERIES) : queries, lang, signal, found, coverage[i]))
      );
    } finally {
      dispose();
    }
  }
  if (opts.signal?.aborted) throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });

  // ---- 2. candidates: rank by how many phrases led to them --------------------------------
  const ranked = [...found.values()].sort((a, b) => b.hits - a.hits || a.firstQuery - b.firstQuery);
  const withText = ranked.filter(f => f.c.text);
  const toFetch = ranked.filter(f => !f.c.text).slice(0, MAX_FETCH);
  const candidates: Array<{ c: Candidate; text: string; snippetOnly: boolean }> = withText.slice(0, 20).map(f => ({ c: f.c, text: f.c.text!, snippetOnly: false }));

  if (toFetch.length) {
    status(`Reading ${toFetch.length} matching pages…`);
    const { signal, dispose } = linkedSignal(opts.signal, FETCH_BUDGET_MS);
    try {
      await mapLimit(toFetch, 6, async f => {
        const loaded = await loadText(f.c, signal);
        if (loaded.text) candidates.push({ c: f.c, ...loaded });
      });
    } finally {
      dispose();
    }
  }
  if (opts.signal?.aborted) throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });

  // Local reference library (always available, also offline)
  const local = defaultCorpusManager.checkSimilarity(text, 5);
  const docs = new Map(defaultCorpusManager.getAllDocuments().map(d => [d.id, d]));
  for (const m of local.matchedSources.slice(0, 10)) {
    const d = docs.get(m.id);
    if (d) candidates.push({ c: { url: d.url, title: d.title, authorOrSource: d.authorOrSource, kind: 'local', text: d.text }, text: d.text, snippetOnly: false });
  }

  // ---- 3. compare -------------------------------------------------------------------------
  status(`Comparing your text with ${candidates.length} sources…`);
  type Scored = PlagiarismSource & { passages: ReturnType<typeof compareWithSource>['passages']; mask: Uint8Array };
  const sources: Scored[] = [];
  const seenUrl = new Set<string>();
  for (const cand of candidates) {
    const key = normalizeUrl(cand.c.url);
    if (seenUrl.has(key)) continue;
    seenUrl.add(key);
    const cmp = compareWithSource(input, cand.text, excludeMask);
    let identical = 0, minor = 0, para = 0;
    for (let i = 0; i < n; i++) {
      if (cmp.mask[i] === 3) identical++;
      else if (cmp.mask[i] === 2) minor++;
      else if (cmp.mask[i] === 1) para++;
    }
    const matched = identical + minor + para;
    if (matched < 8) continue;
    sources.push({
      id: '',
      url: cand.c.url,
      title: cand.c.title,
      authorOrSource: cand.c.authorOrSource,
      kind: cand.c.kind,
      matchedPercent: pct(matched, n),
      matchedWords: matched,
      identicalWords: identical,
      minorChangesWords: minor,
      paraphrasedWords: para,
      snippetOnly: cand.snippetOnly,
      matchedText: cmp.passages[0]?.sourceExcerpt || '',
      passages: cmp.passages.filter(p => !excludeMask || !excludeMask.subarray(p.t0, p.t1).every(Boolean)),
      mask: cmp.mask
    });
  }
  sources.sort((a, b) => b.matchedWords - a.matchedWords || b.identicalWords - a.identicalWords);
  const ranked30 = sources.slice(0, 30);

  // Share the passage budget round-robin so every listed source has highlights to show
  const perSource = new Map<Scored, PlagiarismSegment[]>(ranked30.map(s => [s, []]));
  let used = 0;
  for (let round = 0; used < MAX_SEGMENTS; round++) {
    let added = false;
    for (const s of ranked30) {
      const p = s.passages[round];
      if (!p || used >= MAX_SEGMENTS) continue;
      const start = input.tokens[p.t0].start;
      const end = input.tokens[p.t1 - 1].end;
      perSource.get(s)!.push({ text: text.slice(start, end), start, end, sourceId: '', sourceTitle: s.title, sourceUrl: s.url, matchType: p.type, sourceExcerpt: p.sourceExcerpt });
      used++;
      added = true;
    }
    if (!added) break;
  }
  const top = ranked30.filter(s => perSource.get(s)!.length > 0);
  const segments: PlagiarismSegment[] = [];
  top.forEach((s, i) => {
    s.id = `src-${i + 1}`;
    for (const seg of perSource.get(s)!) segments.push({ ...seg, sourceId: s.id });
  });
  segments.sort((a, b) => a.start - b.start);

  // The overall score only counts words explained by a listed source, once, at their strongest type
  const overall = new Uint8Array(n);
  for (const s of top) for (let i = 0; i < n; i++) if (s.mask[i] > overall[i]) overall[i] = s.mask[i];
  let identical = 0, minor = 0, para = 0;
  for (let i = 0; i < n; i++) {
    if (overall[i] === 3) identical++;
    else if (overall[i] === 2) minor++;
    else if (overall[i] === 1) para++;
  }
  const matchedWords = identical + minor + para;
  const similarity = pct(matchedWords, n);
  const [identicalPct, minorPct, paraPct] = splitPercent([identical, minor, para], similarity);

  const failed = coverage.filter(c => c.status === 'rate_limited' || c.status === 'blocked' || c.status === 'failed');
  const searched = coverage.filter(c => c.status === 'ok' || c.status === 'no_results').map(c => c.label);
  const note = !online
    ? 'Online search is turned off on this server; only the local reference library was checked.'
    : queries.length === 0
      ? 'Text is too short for a web search; only the local reference library was checked.'
      : failed.length
        ? `Partial scan: ${failed.map(f => `${f.label} (${f.status.replace('_', ' ')})`).join(', ')} could not be searched. Results may miss some sources.`
        : `Searched ${searched.join(', ')} and the local reference library.`;

  return {
    similarityScore: similarity,
    uniquenessScore: matchedWords ? 100 - similarity : 100,
    totalWordsChecked: n,
    matchedWords,
    breakdown: { identical: identicalPct, minorChanges: minorPct, paraphrased: paraPct },
    matchedSources: top.map(({ passages, mask, ...s }) => s),
    matchedSegments: segments,
    excludedQuotedWords,
    corpusStats: {
      indexedDocuments: defaultCorpusManager.getDocumentCount(),
      totalCorpusShingles: defaultCorpusManager.getTotalShinglesCount(),
      searchedScope: online ? `${coverage.map(c => c.label).join(', ')} + local library` : 'Local reference library',
      note
    },
    coverage: {
      online,
      queries: queries.map(q => q.text),
      providers: coverage,
      sourcesFound: found.size,
      sourcesCompared: seenUrl.size,
      complete: online ? failed.length === 0 && queries.length > 0 : false,
      durationMs: Date.now() - t0,
      note
    }
  };
}
