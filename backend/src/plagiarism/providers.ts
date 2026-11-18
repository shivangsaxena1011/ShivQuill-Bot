/**
 * Free source-search providers for the plagiarism checker.
 *
 * Key-free (default): Wikipedia (official API), DuckDuckGo HTML results (best effort, public web),
 * arXiv, Crossref and OpenAlex (scholarly abstracts).
 * Optional, enabled by env vars (all have free tiers): SearXNG instance, Google Programmable Search, Brave Search.
 *
 * Providers never try to get around rate limits or bot checks: a blocked/throttled provider is reported in
 * the scan's coverage and skipped for the rest of that scan.
 */
import { safeFetch } from './safeFetch.js';
import { decodeEntities } from './htmlText.js';

export type SourceKind = 'web' | 'wikipedia' | 'academic' | 'local';

export interface Candidate {
  url: string;
  title: string;
  authorOrSource: string;
  kind: SourceKind;
  /** Full text when the provider returns it (abstracts, local docs); otherwise the page is fetched */
  text?: string;
  /** Search-result snippet, used when the page itself can't be fetched */
  snippet?: string;
  /** Wikipedia page id (text fetched through the API) */
  wikiPageId?: number;
  wikiLang?: string;
}

export type ProviderStatus = 'ok' | 'no_results' | 'rate_limited' | 'blocked' | 'failed' | 'skipped';

export class ProviderBlockedError extends Error {
  constructor(public readonly status: 'rate_limited' | 'blocked', message: string, public readonly retryAfterSec?: number) {
    super(message);
    this.name = 'ProviderBlockedError';
  }
}

export interface SearchProvider {
  id: string;
  label: string;
  /** academic providers are only asked a few of the queries (their indexes hold abstracts, not web pages) */
  academic?: boolean;
  /** max concurrent requests to this provider */
  concurrency: number;
  /** max queries sent to this provider per scan (default: all) */
  maxQueries?: number;
  /** minimum delay between requests (politeness) */
  minIntervalMs: number;
  search(query: string, ctx: { lang: string; signal: AbortSignal }): Promise<Candidate[]>;
}

const UA = `ShivQuill-PlagiarismChecker/2.4${process.env.PLAGIARISM_CONTACT ? ` (${process.env.PLAGIARISM_CONTACT})` : ''}`;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function getJson(url: string, signal: AbortSignal, headers: Record<string, string> = {}, timeoutMs = 9000): Promise<any> {
  const r = await safeFetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal, timeoutMs, maxBytes: 3_000_000 });
  if (r.status === 429) {
    const retry = parseInt(String(r.headers['retry-after'] || ''), 10);
    throw new ProviderBlockedError('rate_limited', 'Rate limited', Number.isFinite(retry) ? retry : undefined);
  }
  if (r.status === 403) throw new ProviderBlockedError('blocked', 'Access refused');
  if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(r.body);
}

const stripTags = (s: string) => decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------------------------------------
const WIKI_LANGS = new Set(['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'uk', 'pl', 'sv', 'tr', 'ar', 'fa', 'he', 'hi', 'bn', 'ur', 'mr', 'ta', 'te', 'gu', 'pa', 'zh', 'ja', 'ko', 'th', 'el', 'id', 'vi']);

export const wikipediaProvider: SearchProvider = {
  id: 'wikipedia',
  label: 'Wikipedia',
  // Wikimedia throttles bursty anonymous traffic: keep it gentle
  concurrency: 1,
  minIntervalMs: 250,
  maxQueries: 5,
  async search(query, { lang, signal }) {
    const wl = WIKI_LANGS.has(lang) ? lang : 'en';
    const url = `https://${wl}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srprop=snippet&srsearch=${encodeURIComponent(query)}`;
    const data = await getJson(url, signal);
    return (data?.query?.search || []).map((r: any) => ({
      url: `https://${wl}.wikipedia.org/wiki/${encodeURIComponent(String(r.title).replace(/ /g, '_'))}`,
      title: String(r.title),
      authorOrSource: 'Wikipedia',
      kind: 'wikipedia' as const,
      snippet: stripTags(r.snippet),
      wikiPageId: Number(r.pageid),
      wikiLang: wl
    }));
  }
};

/** Full plain text of a Wikipedia article through the official API (no HTML scraping). */
export async function fetchWikipediaText(lang: string, pageId: number, signal: AbortSignal): Promise<string> {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&format=json&pageids=${pageId}`;
  const data = await getJson(url, signal);
  return String(data?.query?.pages?.[pageId]?.extract || '');
}

// ------------------------------------------------------------------------------------------
export const duckDuckGoProvider: SearchProvider = {
  id: 'duckduckgo',
  label: 'Web (DuckDuckGo)',
  // Key-free and shared: keep each scan small and slow so normal use stays under its automation checks
  concurrency: 1,
  minIntervalMs: 1500,
  maxQueries: 6,
  async search(query, { signal }) {
    const r = await safeFetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      body: new URLSearchParams({ q: query, kl: 'wt-wt' }).toString(),
      headers: { 'User-Agent': BROWSER_UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
      signal,
      timeoutMs: 9000
    });
    if (r.status === 429) throw new ProviderBlockedError('rate_limited', 'Rate limited');
    // DuckDuckGo answers suspected automation with a challenge page; respect it instead of retrying around it
    if (r.status === 202 || r.status === 403 || /anomaly-modal|challenge-form|g-recaptcha/i.test(r.body)) {
      throw new ProviderBlockedError('blocked', 'Search engine asked for a human check');
    }
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const out: Candidate[] = [];
    const blocks = r.body.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/i).slice(1);
    for (const block of blocks) {
      if (/result--ad\b/.test(block.slice(0, 200))) continue;
      const a = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!a) continue;
      let href = decodeEntities(a[1]);
      const uddg = href.match(/[?&]uddg=([^&]+)/);
      if (uddg) href = decodeURIComponent(uddg[1]);
      if (href.startsWith('//')) href = 'https:' + href;
      if (!/^https?:\/\//i.test(href) || /duckduckgo\.com\/y\.js/.test(href)) continue;
      const snippet = block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1];
      let host = '';
      try {
        host = new URL(href).hostname.replace(/^www\./, '');
      } catch {
        continue;
      }
      out.push({ url: href, title: stripTags(a[2]) || host, authorOrSource: host, kind: 'web', snippet: stripTags(snippet || '') });
      if (out.length >= 6) break;
    }
    return out;
  }
};

// ------------------------------------------------------------------------------------------
export const arxivProvider: SearchProvider = {
  id: 'arxiv',
  label: 'arXiv',
  academic: true,
  concurrency: 1,
  minIntervalMs: 3000, // arXiv API etiquette: one request every 3 seconds
  async search(query, { signal }) {
    // arXiv ANDs every term: use only the most distinctive few (longest non-trivial words)
    const terms = [...new Set(query.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(w => w.length > 4))]
      .sort((a, b) => b.length - a.length)
      .slice(0, 4);
    if (terms.length < 3) return [];
    const url = `https://export.arxiv.org/api/query?max_results=3&search_query=${encodeURIComponent(terms.map(t => `all:${t}`).join(' AND '))}`;
    const r = await safeFetch(url, { headers: { 'User-Agent': UA }, signal, timeoutMs: 10000 });
    if (r.status === 429 || r.status === 503) throw new ProviderBlockedError('rate_limited', 'Rate limited');
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return r.body.split('<entry>').slice(1).map(entry => {
      const get = (tag: string) => stripTags(entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] || '');
      const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => stripTags(m[1])).slice(0, 4);
      const title = get('title');
      return {
        url: get('id').replace(/^http:/, 'https:'),
        title,
        authorOrSource: `${authors.join(', ')}${authors.length ? ' · ' : ''}arXiv`,
        kind: 'academic' as const,
        text: `${title}. ${get('summary')}`
      };
    }).filter(c => c.url && c.text.length > 80);
  }
};

// ------------------------------------------------------------------------------------------
export const crossrefProvider: SearchProvider = {
  id: 'crossref',
  label: 'Crossref',
  academic: true,
  // Crossref's public pool allows one concurrent request
  concurrency: 1,
  minIntervalMs: 300,
  async search(query, { signal }) {
    const mail = process.env.CROSSREF_MAILTO ? `&mailto=${encodeURIComponent(process.env.CROSSREF_MAILTO)}` : '';
    const url = `https://api.crossref.org/works?rows=4&select=DOI,title,abstract,URL,author,container-title&query=${encodeURIComponent(query)}${mail}`;
    const data = await getJson(url, signal);
    return (data?.message?.items || [])
      .filter((it: any) => it.abstract)
      .map((it: any) => {
        const title = stripTags(it.title?.[0] || '');
        const authors = (it.author || []).slice(0, 3).map((a: any) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean);
        return {
          url: it.URL || `https://doi.org/${it.DOI}`,
          title: title || it.DOI,
          authorOrSource: [authors.join(', '), it['container-title']?.[0]].filter(Boolean).join(' · ') || 'Crossref',
          kind: 'academic' as const,
          text: `${title}. ${stripTags(it.abstract)}`
        };
      });
  }
};

// ------------------------------------------------------------------------------------------
function openAlexAbstract(inv: Record<string, number[]> | null | undefined): string {
  if (!inv) return '';
  const words: string[] = [];
  for (const [w, positions] of Object.entries(inv)) for (const p of positions) words[p] = w;
  return words.filter(Boolean).join(' ');
}

export const openAlexProvider: SearchProvider = {
  id: 'openalex',
  label: 'OpenAlex',
  academic: true,
  concurrency: 2,
  minIntervalMs: 150,
  async search(query, { signal }) {
    const key = process.env.OPENALEX_API_KEY ? `&api_key=${encodeURIComponent(process.env.OPENALEX_API_KEY)}` : '';
    const url = `https://api.openalex.org/works?per-page=4&select=id,doi,display_name,abstract_inverted_index,authorships,primary_location&search=${encodeURIComponent(query)}${key}`;
    const data = await getJson(url, signal);
    return (data?.results || [])
      .map((w: any) => {
        const abstract = openAlexAbstract(w.abstract_inverted_index);
        const authors = (w.authorships || []).slice(0, 3).map((a: any) => a.author?.display_name).filter(Boolean);
        return {
          url: w.primary_location?.landing_page_url || w.doi || w.id,
          title: String(w.display_name || 'Untitled work'),
          authorOrSource: [authors.join(', '), w.primary_location?.source?.display_name].filter(Boolean).join(' · ') || 'OpenAlex',
          kind: 'academic' as const,
          text: `${w.display_name || ''}. ${abstract}`
        };
      })
      .filter((c: Candidate) => (c.text || '').length > 120);
  }
};

// ------------------------------------------------------------------------------------------
// Optional providers (free tiers) — enabled only when configured
function webResult(url: string, title: string, snippet: string): Candidate | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return { url, title: stripTags(title) || host, authorOrSource: host, kind: 'web', snippet: stripTags(snippet) };
  } catch {
    return null;
  }
}

export const searxngProvider = (base: string): SearchProvider => ({
  id: 'searxng',
  label: 'Web (SearXNG)',
  concurrency: 2,
  minIntervalMs: 300,
  async search(query, { signal }) {
    const data = await getJson(`${base.replace(/\/$/, '')}/search?format=json&q=${encodeURIComponent(query)}`, signal);
    return (data?.results || []).slice(0, 6).map((r: any) => webResult(r.url, r.title, r.content || '')).filter(Boolean) as Candidate[];
  }
});

export const googleProvider = (key: string, cx: string): SearchProvider => ({
  id: 'google',
  label: 'Web (Google)',
  concurrency: 2,
  minIntervalMs: 100,
  async search(query, { signal }) {
    const data = await getJson(`https://www.googleapis.com/customsearch/v1?num=6&key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}`, signal);
    return (data?.items || []).map((r: any) => webResult(r.link, r.title, r.snippet || '')).filter(Boolean) as Candidate[];
  }
});

export const braveProvider = (key: string): SearchProvider => ({
  id: 'brave',
  label: 'Web (Brave)',
  concurrency: 1,
  minIntervalMs: 1100, // free plan: 1 request / second
  async search(query, { signal }) {
    const data = await getJson(`https://api.search.brave.com/res/v1/web/search?count=6&q=${encodeURIComponent(query)}`, signal, { 'X-Subscription-Token': key });
    return (data?.web?.results || []).map((r: any) => webResult(r.url, r.title, r.description || '')).filter(Boolean) as Candidate[];
  }
});

/** Providers enabled by the environment. PLAGIARISM_WEB_SEARCH selects the web engine (default duckduckgo). */
export function configuredProviders(): SearchProvider[] {
  const list: SearchProvider[] = [wikipediaProvider];
  const web = (process.env.PLAGIARISM_WEB_SEARCH || 'auto').toLowerCase();
  const google = process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_ID ? googleProvider(process.env.GOOGLE_CSE_KEY, process.env.GOOGLE_CSE_ID) : null;
  const brave = process.env.BRAVE_SEARCH_API_KEY ? braveProvider(process.env.BRAVE_SEARCH_API_KEY) : null;
  const searx = process.env.SEARXNG_URL ? searxngProvider(process.env.SEARXNG_URL) : null;
  if (web !== 'off') {
    if (web === 'google' && google) list.push(google);
    else if (web === 'brave' && brave) list.push(brave);
    else if (web === 'searxng' && searx) list.push(searx);
    else if (web === 'duckduckgo') list.push(duckDuckGoProvider);
    else {
      // auto: any configured keyed engine, otherwise the key-free one
      const keyed = [google, brave, searx].filter(Boolean) as SearchProvider[];
      list.push(...(keyed.length ? keyed : [duckDuckGoProvider]));
    }
  }
  list.push(crossrefProvider, openAlexProvider, arxivProvider);
  return list;
}
