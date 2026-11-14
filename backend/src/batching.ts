/**
 * Splits large inputs into provider-sized batches aligned to paragraph / line / sentence / word
 * boundaries, while remembering the exact whitespace between batches so outputs can be
 * reassembled with the document's original layout.
 */

export interface TextBatch {
  /** Batch content (no leading/trailing whitespace from the cut points) */
  text: string;
  /** Character offset of `text` within the original input */
  start: number;
  /** Whitespace that followed this batch in the original input */
  separator: string;
}

export interface BatchedText {
  /** Leading whitespace of the original input */
  leading: string;
  batches: TextBatch[];
}

function findCut(window: string): number {
  const minCut = Math.floor(window.length * 0.3);
  const candidates: RegExp[] = [/\n\s*\n/g, /\n/g, /[.!?]["')\]]?\s/g, /\s/g];

  for (const pattern of candidates) {
    let last = -1;
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(window)) !== null) {
      // For sentence endings keep the punctuation inside the batch
      const idx = pattern.source.startsWith('[.!?]') ? m.index + m[0].trimEnd().length : m.index;
      if (idx >= minCut) last = idx;
      if (m[0].length === 0) pattern.lastIndex++;
    }
    if (last > 0) return last;
  }
  return window.length; // hard cut (e.g. a single giant token)
}

export function splitIntoBatches(text: string, maxChars: number): BatchedText {
  const limit = Math.max(1, Math.floor(maxChars));
  const leadingMatch = text.match(/^\s*/);
  const leading = leadingMatch ? leadingMatch[0] : '';
  const batches: TextBatch[] = [];

  let pos = leading.length;
  const n = text.length;

  while (pos < n) {
    const remaining = n - pos;
    let cut: number;
    if (remaining <= limit) {
      cut = remaining;
    } else {
      cut = findCut(text.slice(pos, pos + limit));
    }

    let content = text.slice(pos, pos + cut);
    // Move any trailing whitespace in the content into the separator
    const trimmed = content.replace(/\s+$/, '');
    let sepStart = pos + trimmed.length;
    content = trimmed;

    let sepEnd = sepStart;
    while (sepEnd < n && /\s/.test(text[sepEnd])) sepEnd++;

    if (content.length > 0) {
      batches.push({ text: content, start: pos, separator: text.slice(sepStart, sepEnd) });
    } else if (batches.length > 0) {
      batches[batches.length - 1].separator += text.slice(sepStart, sepEnd);
    }

    // Guarantee forward progress
    pos = Math.max(sepEnd, pos + 1);
  }

  return { leading, batches };
}

/**
 * Reassembles per-batch outputs using the original inter-batch whitespace.
 */
export function joinBatchOutputs(batched: BatchedText, outputs: string[]): string {
  let result = batched.leading;
  for (let i = 0; i < batched.batches.length; i++) {
    result += (outputs[i] ?? batched.batches[i].text).trim() + batched.batches[i].separator;
  }
  return result;
}

/**
 * Runs `fn` over each batch sequentially (preserving rolling order and provider rate limits),
 * stopping immediately if the signal aborts.
 */
export async function mapBatches<T>(
  batched: BatchedText,
  fn: (batch: TextBatch, index: number) => Promise<T>,
  signal?: AbortSignal
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < batched.batches.length; i++) {
    if (signal?.aborted) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }
    results.push(await fn(batched.batches[i], i));
  }
  return results;
}
