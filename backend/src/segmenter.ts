/**
 * Sentence and Paragraph Segmentation Engine
 * Uses native Intl.Segmenter with defensive guards against zero-value increments
 */

export interface SentenceChunk {
  sentences: string[];
  combinedText: string;
  paragraphIndex: number;
}

export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

export function splitIntoSentences(paragraph: string, locale = 'en-US'): string[] {
  if (!paragraph || paragraph.trim().length === 0) {
    return [];
  }

  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
    const segmenter = new (Intl as any).Segmenter(locale, { granularity: 'sentence' });
    const segments = [...segmenter.segment(paragraph)];
    return segments
      .map(s => s.segment.trim())
      .filter(s => s.length > 0);
  }

  // Fallback regex if Intl.Segmenter is unavailable
  const matches = paragraph.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g);
  if (matches) {
    return matches.map(s => s.trim()).filter(s => s.length > 0);
  }

  return [paragraph.trim()];
}

export function chunkSentences(
  sentences: string[],
  chunkSize: number,
  paragraphIndex = 0
): SentenceChunk[] {
  // Defensive guard against zero or negative chunk size (Addresses SEC-01)
  const safeSize = chunkSize !== undefined && Number.isFinite(chunkSize) && chunkSize > 0 
    ? Math.floor(chunkSize) 
    : 1;
  const chunks: SentenceChunk[] = [];

  for (let i = 0; i < sentences.length; i += safeSize) {
    const slice = sentences.slice(i, i + safeSize);
    chunks.push({
      sentences: slice,
      combinedText: slice.join(' '),
      paragraphIndex
    });
  }

  return chunks;
}

export interface ParagraphLayout {
  /** Whitespace before the first paragraph */
  leading: string;
  /** Trimmed paragraph texts */
  paragraphs: string[];
  /** Exact whitespace that followed each paragraph (same length as `paragraphs`) */
  separators: string[];
}

/**
 * Splits text into paragraphs (one per non-empty line) while recording the exact whitespace
 * between them, so a rewritten document can be reassembled with its original line breaks,
 * blank lines and indentation.
 */
export function splitParagraphsWithLayout(text: string): ParagraphLayout {
  const leading = (text.match(/^\s*/) || [''])[0];
  const paragraphs: string[] = [];
  const separators: string[] = [];
  const re = /[^\r\n]+/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const line = m[0];
    const trimmed = line.trim();
    if (!trimmed) continue;
    const contentStart = m.index + line.indexOf(trimmed);
    const contentEnd = contentStart + trimmed.length;
    paragraphs.push(trimmed);
    // Separator = whitespace from content end up to the next non-whitespace char
    let sepEnd = contentEnd;
    while (sepEnd < text.length && /\s/.test(text[sepEnd])) sepEnd++;
    separators.push(text.slice(contentEnd, sepEnd));
    re.lastIndex = Math.max(re.lastIndex, sepEnd);
  }

  return { leading: paragraphs.length ? leading : '', paragraphs, separators };
}
