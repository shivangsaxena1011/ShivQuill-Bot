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
