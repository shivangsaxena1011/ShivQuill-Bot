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
  let best = -1;
  let bestDist = Infinity;
  let idx = text.indexOf(edit.original);
  while (idx !== -1) {
    const dist = Math.abs(idx - edit.start);
    if (dist < bestDist) {
      best = idx;
      bestDist = dist;
    }
    idx = text.indexOf(edit.original, idx + 1);
  }
  return best;
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
  const positioned = edits
    .map(e => ({ e, at: locateEdit(text, e) }))
    .filter(x => x.at !== -1)
    .sort((a, b) => b.at - a.at);

  let result = text;
  let lowestStart = Infinity;
  const appliedIds = new Set<string>();
  for (const { e, at } of positioned) {
    const endAt = at + e.original.length;
    if (endAt > lowestStart) continue; // overlaps an edit already applied
    result = result.slice(0, at) + e.replacement + result.slice(endAt);
    lowestStart = at;
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
    if (r.start < pos) continue;
    if (r.start > pos) parts.push({ text: text.slice(pos, r.start), mark: false });
    parts.push({ text: text.slice(r.start, r.end), mark: true, title: r.title });
    pos = r.end;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), mark: false });
  return parts;
}
