const ANALYSIS_WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}]+)?/gu;
const SPACELESS_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
let segmenter: Intl.Segmenter | null | undefined;

/**
 * Word count exactly like the server's analysis tokenizer (letters/digits runs; Chinese, Japanese,
 * Thai… split into dictionary words), so "minimum words" gates agree with the backend.
 */
export function analysisWordCount(text: string): number {
  if (!text) return 0;
  let count = 0;
  ANALYSIS_WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ANALYSIS_WORD_RE.exec(text)) !== null) {
    if (!SPACELESS_RE.test(m[0])) {
      count++;
      continue;
    }
    if (segmenter === undefined) {
      try {
        segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
      } catch {
        segmenter = null;
      }
    }
    if (!segmenter) {
      count += m[0].length; // rough fallback: one word per character
      continue;
    }
    for (const part of segmenter.segment(m[0])) if (part.isWordLike) count++;
  }
  return count;
}

/** Fast word count without allocating a big array (matters for 1M-char documents). */
export function wordCount(text: string): number {
  if (!text) return 0;
  let count = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const space = c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 160;
    if (space) inWord = false;
    else if (!inWord) {
      inWord = true;
      count++;
    }
  }
  return count;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export interface OffsetEdit {
  id: string;
  start: number;
  end: number;
  original: string;
  replacement: string;
  located?: boolean;
}

/**
 * Finds where an edit applies in the current text. Uses the recorded offsets when they still
 * match; otherwise looks for the closest occurrence of the original text (the text may have
 * shifted because of earlier edits). Returns -1 when it can't be found.
 */
export function locateEdit(text: string, edit: OffsetEdit): number {
  if (edit.located !== false && text.slice(edit.start, edit.end) === edit.original) return edit.start;
  if (!edit.original) return -1;
  // Whole-word matches only: "a" must not match inside "Today", "its" not inside "suits"
  const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);
  const needStartBoundary = isWordChar(edit.original[0]);
  const needEndBoundary = isWordChar(edit.original[edit.original.length - 1]);
  let best = -1;
  let bestDist = Infinity;
  let idx = text.indexOf(edit.original);
  while (idx !== -1) {
    const okStart = !needStartBoundary || !isWordChar(text[idx - 1]);
    const okEnd = !needEndBoundary || !isWordChar(text[idx + edit.original.length]);
    const dist = Math.abs(idx - edit.start);
    if (okStart && okEnd && dist < bestDist) {
      best = idx;
      bestDist = dist;
    }
    idx = text.indexOf(edit.original, idx + 1);
  }
  return best;
}

/**
 * Re-bases edit offsets after the text changed from `before` to `after` by a user edit (typing, undo,
 * paste). The changed region is found by common prefix/suffix: edits before it keep their offsets, edits
 * after it shift by the length change, and edits whose text was overwritten are dropped (no longer valid).
 */
export function rebaseEdits<T extends OffsetEdit>(before: string, after: string, edits: T[]): T[] {
  if (before === after) return edits;
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before.charCodeAt(p) === after.charCodeAt(p)) p++;
  let s = 0;
  while (s < max - p && before.charCodeAt(before.length - 1 - s) === after.charCodeAt(after.length - 1 - s)) s++;
  const oldEnd = before.length - s; // changed region in `before` is [p, oldEnd)
  const delta = after.length - before.length;
  const out: T[] = [];
  for (const e of edits) {
    if (e.end <= p) out.push(e);
    else if (e.start >= oldEnd) out.push({ ...e, start: e.start + delta, end: e.end + delta });
    // otherwise the user edited inside this suggestion's text: drop it
  }
  return out;
}

/**
 * Applies one edit and shifts the offsets of the remaining edits that come after it,
 * so accepting suggestions one by one always changes the right place.
 */
export function applyEdit<T extends OffsetEdit>(text: string, edit: T, remaining: T[]): { text: string; remaining: T[]; applied: boolean } {
  const at = locateEdit(text, edit);
  if (at === -1) return { text, remaining: remaining.filter(e => e.id !== edit.id), applied: false };
  const endAt = at + edit.original.length;
  const delta = edit.replacement.length - edit.original.length;
  const newText = text.slice(0, at) + edit.replacement + text.slice(endAt);
  const shifted = remaining
    .filter(e => e.id !== edit.id)
    .map(e => (e.start >= endAt ? { ...e, start: e.start + delta, end: e.end + delta } : e));
  return { text: newText, remaining: shifted, applied: true };
}

/** Applies all non-overlapping edits from the end of the text backwards (offsets stay valid). */
export function applyAllEdits<T extends OffsetEdit>(text: string, edits: T[]): { text: string; appliedIds: Set<string> } {
  // Pick non-overlapping edits in reading order (earlier edit wins a conflict)…
  const positioned = edits
    .map(e => ({ e, at: locateEdit(text, e) }))
    .filter(x => x.at !== -1)
    .sort((a, b) => a.at - b.at);
  const chosen: typeof positioned = [];
  let lastEnd = -1;
  for (const p of positioned) {
    if (p.at < lastEnd) continue; // overlaps an earlier chosen edit
    chosen.push(p);
    lastEnd = p.at + p.e.original.length;
  }

  // …then apply from the end backwards so earlier offsets stay valid
  let result = text;
  const appliedIds = new Set<string>();
  for (let i = chosen.length - 1; i >= 0; i--) {
    const { e, at } = chosen[i];
    result = result.slice(0, at) + e.replacement + result.slice(at + e.original.length);
    appliedIds.add(e.id);
  }
  return { text: result, appliedIds };
}

/** Splits "*italic*" markup into renderable parts (no v-html needed). */
export function italicParts(text: string): Array<{ text: string; italic: boolean }> {
  return text.split(/(\*[^*]+\*)/g).filter(Boolean).map(part =>
    part.startsWith('*') && part.endsWith('*') && part.length > 2
      ? { text: part.slice(1, -1), italic: true }
      : { text: part, italic: false }
  );
}

export const stripItalics = (text: string) => text.replace(/\*([^*]+)\*/g, '$1');

/** Builds highlighted segments for ranges over a text (ranges may be unsorted/overlapping). */
export function highlightRanges(text: string, ranges: Array<{ start: number; end: number; title?: string }>, max = 400) {
  const sorted = ranges
    .filter(r => r.end > r.start && r.start >= 0 && r.end <= text.length)
    .sort((a, b) => a.start - b.start)
    .slice(0, max);
  const parts: Array<{ text: string; mark: boolean; title?: string }> = [];
  let pos = 0;
  for (const r of sorted) {
    // Overlapping range: highlight only the part past what is already marked (don't drop it)
    if (r.end <= pos) continue;
    const start = Math.max(r.start, pos);
    if (start > pos) parts.push({ text: text.slice(pos, start), mark: false });
    parts.push({ text: text.slice(start, r.end), mark: true, title: r.title });
    pos = r.end;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), mark: false });
  return parts;
}
