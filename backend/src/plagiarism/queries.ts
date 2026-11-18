/**
 * Picks distinctive phrases from the document to use as search-engine queries.
 * The document is split into equal parts and the most distinctive sentence of each part is used,
 * so the whole text is covered (not just its opening).
 */
import { Token, SentenceSpan, isStop } from './text.js';

export interface SearchQuery {
  text: string;
  /** Token range of the sentence the query came from */
  t0: number;
  t1: number;
}

const QUERY_WORDS = 14;

export function generateQueries(text: string, tokens: Token[], sentences: SentenceSpan[], maxQueries: number): SearchQuery[] {
  if (tokens.length === 0) return [];
  const df = new Map<string, number>();
  for (const t of tokens) df.set(t.w, (df.get(t.w) || 0) + 1);

  const candidates = sentences.filter(s => s.t1 - s.t0 >= 7);
  if (candidates.length === 0) {
    // One long run-on text without punctuation: use evenly spaced windows
    const windows: SearchQuery[] = [];
    const step = Math.max(QUERY_WORDS, Math.floor(tokens.length / Math.max(1, maxQueries)));
    for (let i = 0; i < tokens.length && windows.length < maxQueries; i += step) {
      const t1 = Math.min(tokens.length, i + QUERY_WORDS);
      if (t1 - i >= 6) windows.push({ text: tokens.slice(i, t1).map(t => t.w).join(' '), t0: i, t1 });
    }
    return windows;
  }

  // ~1 phrase per 60 words (min 2): enough to find copied passages without flooding free search services
  const wanted = Math.min(maxQueries, Math.max(2, Math.ceil(tokens.length / 60)), candidates.length);
  const per = candidates.length / wanted;

  const score = (s: SentenceSpan): number => {
    let sum = 0;
    let n = 0;
    for (let i = s.t0; i < s.t1; i++) {
      const w = tokens[i].w;
      if (isStop(w)) continue;
      // Rare-in-document and longer words are more distinctive
      sum += Math.log(1 + tokens.length / (df.get(w) || 1)) * Math.min(1.5, w.length / 6);
      n++;
    }
    return n >= 3 ? sum / Math.sqrt(s.t1 - s.t0) + n * 0.15 : 0;
  };

  const queries: SearchQuery[] = [];
  const seen = new Set<string>();
  for (let q = 0; q < wanted; q++) {
    const part = candidates.slice(Math.floor(q * per), Math.max(Math.floor((q + 1) * per), Math.floor(q * per) + 1));
    const best = part.reduce((a, b) => (score(b) > score(a) ? b : a), part[0]);
    if (!best) continue;
    // Use the original wording (keeps capitalisation/hyphens) of up to QUERY_WORDS words
    const t1 = Math.min(best.t1, best.t0 + QUERY_WORDS);
    const phrase = text
      .slice(tokens[best.t0].start, tokens[t1 - 1].end)
      .replace(/[\s ]+/g, ' ')
      .replace(/["“”«»]/g, '')
      .trim();
    const key = phrase.toLowerCase();
    if (phrase.length < 20 || seen.has(key)) continue;
    seen.add(key);
    queries.push({ text: phrase, t0: best.t0, t1 });
  }
  return queries;
}
