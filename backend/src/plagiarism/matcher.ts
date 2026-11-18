/**
 * Compares the input document with one candidate source text.
 *
 * 1. Seeds: shared word 4-grams (ignoring n-grams made only of stopwords).
 * 2. Passages: seed runs joined across small gaps (≤ 3 words), so lightly edited text stays one passage.
 *    A passage with no gaps is "identical"; otherwise "minor" (minor changes).
 * 3. Paraphrase: input sentences not already matched are compared with source sentences by stemmed
 *    content-word overlap (Dice); close ones are "paraphrased".
 * Offsets are character offsets in the input text.
 */
import { Token, SentenceSpan, tokenize, sentenceSpans, isStop, stem } from './text.js';

export type MatchType = 'identical' | 'minor' | 'paraphrased';

export interface MatchedPassage {
  /** token range in the input */
  t0: number;
  t1: number;
  type: MatchType;
  /** excerpt of the source text that matched */
  sourceExcerpt: string;
}

export interface SourceComparison {
  passages: MatchedPassage[];
  /** per-input-token match type: 0 none, 1 paraphrased, 2 minor, 3 identical */
  mask: Uint8Array;
}

const SEED = 4;
const MAX_GAP = 3;
const MIN_PASSAGE_WORDS = 8;
const MAX_POSITIONS = 40;

export interface PreparedInput {
  text: string;
  tokens: Token[];
  sentences: SentenceSpan[];
  /** stemmed content-word sets per sentence */
  sentenceWords: Set<string>[];
}

function contentSet(tokens: Token[], t0: number, t1: number): Set<string> {
  const s = new Set<string>();
  for (let i = t0; i < t1; i++) if (!isStop(tokens[i].w)) s.add(stem(tokens[i].w));
  return s;
}

export function prepareInput(text: string): PreparedInput {
  const tokens = tokenize(text);
  const sentences = sentenceSpans(text, tokens);
  return { text, tokens, sentences, sentenceWords: sentences.map(s => contentSet(tokens, s.t0, s.t1)) };
}

function gramKey(tokens: Token[], i: number): string | null {
  let allStop = true;
  for (let k = 0; k < SEED; k++) if (!isStop(tokens[i + k].w)) allStop = false;
  if (allStop) return null;
  return tokens[i].w + ' ' + tokens[i + 1].w + ' ' + tokens[i + 2].w + ' ' + tokens[i + 3].w;
}

function excerpt(text: string, tokens: Token[], c0: number, c1: number): string {
  if (c0 < 0 || c1 <= c0) return '';
  const s = tokens[c0].start;
  const e = tokens[Math.min(c1, tokens.length) - 1].end;
  const raw = text.slice(s, e).replace(/\s+/g, ' ').trim();
  return raw.length > 400 ? raw.slice(0, 397) + '…' : raw;
}

export function compareWithSource(input: PreparedInput, sourceText: string, excludeMask?: Uint8Array): SourceComparison {
  const A = input.tokens;
  const n = A.length;
  const mask = new Uint8Array(n);
  const passages: MatchedPassage[] = [];
  if (n < SEED || !sourceText) return { passages, mask };

  const B = tokenize(sourceText);
  if (B.length < SEED) return { passages, mask };

  // --- 1. exact 4-gram seeds -------------------------------------------------------------
  const index = new Map<string, number[]>();
  for (let j = 0; j + SEED <= B.length; j++) {
    const key = gramKey(B, j);
    if (!key) continue;
    const list = index.get(key);
    if (!list) index.set(key, [j]);
    else if (list.length < MAX_POSITIONS) list.push(j);
  }

  const covered = new Uint8Array(n);
  // For each input token: a source token position it aligned to (for excerpts)
  const srcPos = new Int32Array(n).fill(-1);
  for (let i = 0; i + SEED <= n; i++) {
    const key = gramKey(A, i);
    if (!key) continue;
    const hits = index.get(key);
    if (!hits) continue;
    // Prefer the hit that continues the previous alignment (same diagonal)
    let j = hits[0];
    if (i > 0 && srcPos[i - 1] >= 0) {
      const want = srcPos[i - 1] + 1;
      const cont = hits.find(h => h === want);
      if (cont !== undefined) j = cont;
    }
    for (let k = 0; k < SEED; k++) {
      covered[i + k] = 1;
      if (srcPos[i + k] < 0) srcPos[i + k] = j + k;
    }
  }

  // --- 2. join runs across small gaps into passages ---------------------------------------
  let i = 0;
  while (i < n) {
    if (!covered[i]) {
      i++;
      continue;
    }
    const start = i;
    let end = i;
    let gaps = 0;
    let j = i;
    while (j < n) {
      if (covered[j]) {
        end = j + 1;
        j++;
        continue;
      }
      // look ahead for the run to continue within MAX_GAP words
      let g = 0;
      while (j + g < n && !covered[j + g] && g <= MAX_GAP) g++;
      if (g <= MAX_GAP && j + g < n && covered[j + g]) {
        gaps += g;
        j += g;
        continue;
      }
      break;
    }
    if (end - start >= MIN_PASSAGE_WORDS) {
      const type: MatchType = gaps === 0 ? 'identical' : 'minor';
      // Word-level: exactly matched words are identical, the changed words in between are minor changes
      for (let t = start; t < end; t++) mask[t] = Math.max(mask[t], covered[t] ? 3 : 2);
      // Excerpt from the passage's dominant alignment (source pos − input pos), so a stray seed on a
      // common phrase elsewhere in the source ("one of the most") can't stretch it over unrelated text
      const diagCount = new Map<number, number>();
      for (let t = start; t < end; t++) if (srcPos[t] >= 0) diagCount.set(srcPos[t] - t, (diagCount.get(srcPos[t] - t) || 0) + 1);
      let mainDiag = 0;
      let best = -1;
      for (const [d, c] of diagCount) if (c > best) [mainDiag, best] = [d, c];
      let c0 = Infinity;
      let c1 = -1;
      for (let t = start; t < end; t++) {
        if (srcPos[t] >= 0 && Math.abs(srcPos[t] - t - mainDiag) <= MAX_GAP + 1) {
          c0 = Math.min(c0, srcPos[t]);
          c1 = Math.max(c1, srcPos[t] + 1);
        }
      }
      passages.push({ t0: start, t1: end, type, sourceExcerpt: excerpt(sourceText, B, c0 === Infinity ? -1 : c0, c1) });
    }
    i = Math.max(end, start + 1);
  }

  // --- 3. paraphrase: sentence-level content-word similarity -------------------------------
  const bSentences = sentenceSpans(sourceText, B);
  if (bSentences.length) {
    const bSets = bSentences.map(s => contentSet(B, s.t0, s.t1));
    const inverted = new Map<string, number[]>();
    bSets.forEach((set, idx) => {
      for (const w of set) {
        const l = inverted.get(w);
        if (!l) inverted.set(w, [idx]);
        else if (l.length < 400) l.push(idx);
      }
    });

    input.sentences.forEach((s, si) => {
      const len = s.t1 - s.t0;
      if (len < 8) return;
      let already = 0;
      for (let t = s.t0; t < s.t1; t++) if (mask[t]) already++;
      if (already / len > 0.5) return;
      const aSet = input.sentenceWords[si];
      if (aSet.size < 5) return;

      const shared = new Map<number, number>();
      for (const w of aSet) for (const idx of inverted.get(w) || []) shared.set(idx, (shared.get(idx) || 0) + 1);
      let bestIdx = -1;
      let bestDice = 0;
      for (const [idx, common] of shared) {
        if (common < 5) continue;
        const dice = (2 * common) / (aSet.size + bSets[idx].size);
        if (dice > bestDice) {
          bestDice = dice;
          bestIdx = idx;
        }
      }
      if (bestIdx >= 0 && bestDice >= 0.6) {
        for (let t = s.t0; t < s.t1; t++) mask[t] = Math.max(mask[t], 1);
        const bs = bSentences[bestIdx];
        passages.push({ t0: s.t0, t1: s.t1, type: 'paraphrased', sourceExcerpt: excerpt(sourceText, B, bs.t0, bs.t1) });
      }
    });
  }

  if (excludeMask) {
    for (let t = 0; t < n; t++) if (excludeMask[t]) mask[t] = 0;
  }
  passages.sort((a, b) => a.t0 - b.t0);
  return { passages, mask };
}
