/**
 * Text utilities shared by the plagiarism engine: word tokens with character offsets,
 * sentence spans, stopwords and a light stemmer for paraphrase comparison.
 */

export interface Token {
  /** Lower-cased word */
  w: string;
  start: number;
  end: number;
}

export interface SentenceSpan {
  start: number;
  end: number;
  /** Index of the first token of the sentence */
  t0: number;
  /** Index one past the last token of the sentence */
  t1: number;
}

const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}]+)?/gu;
/** Scripts written without spaces between words: a regex "word" there is a whole clause */
const SPACELESS_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

let segmenter: Intl.Segmenter | null | undefined;
function wordSegmenter(): Intl.Segmenter | null {
  if (segmenter === undefined) {
    try {
      segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    } catch {
      segmenter = null;
    }
  }
  return segmenter;
}

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text)) !== null) {
    const run = m[0];
    const seg = SPACELESS_RE.test(run) ? wordSegmenter() : null;
    if (seg) {
      // Split Chinese/Japanese/Thai… runs into dictionary words (single characters as a fallback)
      for (const part of seg.segment(run)) {
        if (!part.isWordLike) continue;
        const start = m.index + part.index;
        out.push({ w: part.segment.toLowerCase(), start, end: start + part.segment.length });
      }
      continue;
    }
    out.push({ w: run.toLowerCase().replace(/’/g, "'"), start: m.index, end: m.index + run.length });
  }
  return out;
}

/** Word count consistent with the tokenizer (used for minimums and percentages). */
export function countWords(text: string): number {
  return tokenize(text).length;
}

/** Sentence spans aligned to token indices (ends at . ! ? 。！？ or a line break). */
export function sentenceSpans(text: string, tokens: Token[]): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  // Includes CJK (。！？) and Devanagari (। ॥) sentence terminators
  const re = /[^.!?。！？।॥\n]+(?:[.!?。！？।॥]+["'”’)\]]*|\n|$)/g;
  let m: RegExpExecArray | null;
  let ti = 0;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const start = m.index;
    const end = m.index + m[0].length;
    while (ti < tokens.length && tokens[ti].start < start) ti++;
    const t0 = ti;
    while (ti < tokens.length && tokens[ti].start < end) ti++;
    if (ti > t0) spans.push({ start: tokens[t0].start, end: tokens[ti - 1].end, t0, t1: ti });
  }
  return spans;
}

export const STOPWORDS = new Set(
  (
    'a an the and or but if then else of to in on at by for with from as into onto over under about above below ' +
    'between through during before after up down out off again further once here there when where why how all any ' +
    'both each few more most other some such no nor not only own same so than too very can will just should now ' +
    'is are was were be been being have has had having do does did doing i me my we our you your he him his she her ' +
    'it its they them their what which who whom this that these those am would could might must shall may also it\'s ' +
    'de la le les el los las un una et en des du que y o e da do um uma der die das und ist'
  ).split(/\s+/)
);

export function isStop(w: string): boolean {
  // Single Latin letters/digits are noise; a single Han/kana character is often a full word
  return STOPWORDS.has(w) || (w.length < 2 && !SPACELESS_RE.test(w));
}

/** Very light suffix stripping so "trained"/"training"/"trains" compare equal for paraphrase checks. */
export function stem(w: string): string {
  if (w.length <= 4) return w;
  for (const suf of ['ational', 'ization', 'fulness', 'ousness', 'iveness', 'ations', 'ation', 'ments', 'ness', 'ment', 'ings', 'ing', 'ies', 'ied', 'ers', 'est', 'ed', 'es', 'er', 'ly', 's']) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) return w.slice(0, -suf.length);
  }
  return w;
}

/** Character ranges inside quotation marks ("…", “…”, «…»). */
export function quotedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /"[^"\n]{3,}?"|“[^”\n]{3,}?”|«[^»\n]{3,}?»/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}
