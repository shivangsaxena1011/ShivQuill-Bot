import { z } from 'zod';
import { executeLlmCompletion } from './llm.js';
import { extractJson, JsonExtractionError } from './jsonExtract.js';
import { isAbortError } from './requestAbort.js';

/** Thrown when the model's reply could not be turned into the expected structure, even after a retry. */
export class MalformedModelResponseError extends Error {
  constructor(public readonly raw: string, message: string) {
    super(message);
    this.name = 'MalformedModelResponseError';
  }
}

const MAX_ATTEMPTS = 2;

/**
 * Requests a JSON reply, extracts it tolerantly and validates it against `schema`.
 * A malformed reply is retried once (a fresh sample usually conforms) before giving up.
 */
export async function completeStructured<S extends z.ZodTypeAny>(
  schema: S,
  systemPrompt: string,
  userPrompt: string,
  model: string | undefined,
  temperature: number,
  signal?: AbortSignal,
  prefer: 'object' | 'array' = 'object'
): Promise<z.output<S>> {
  let lastRaw = '';
  let lastError = 'Unknown parse failure';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const raw = await executeLlmCompletion(systemPrompt, userPrompt, model, temperature, signal, undefined, { json: true });
    lastRaw = raw;
    try {
      const result = schema.safeParse(extractJson(raw, prefer));
      if (result.success) return result.data;
      lastError = result.error.errors.map(e => `${e.path.join('.') || '(root)'}: ${e.message}`).join('; ');
    } catch (err: any) {
      if (isAbortError(err) || signal?.aborted) throw err;
      lastError = err instanceof JsonExtractionError ? err.message : String(err?.message || err);
    }
    if (attempt < MAX_ATTEMPTS) {
      console.warn(`[ShivQuill] Malformed structured reply (attempt ${attempt}), retrying: ${lastError.slice(0, 200)}`);
    }
  }

  throw new MalformedModelResponseError(lastRaw, lastError);
}

// ---------------------------------------------------------------------------
// Lenient field helpers: accept what models commonly send instead of rejecting a usable answer.
// ---------------------------------------------------------------------------

/** A number that may arrive as a string ("85", "85%"); missing/invalid values become `fallback`. */
export const looseNumber = (fallback = 0) =>
  z.preprocess(v => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
    if (typeof v === 'string') {
      const n = parseFloat(v.replace('%', ''));
      return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
  }, z.number());

/** An optional non-negative integer offset; null/strings/negatives become undefined. */
export const looseOffset = z.preprocess(v => {
  const n = typeof v === 'string' ? parseInt(v, 10) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : undefined;
}, z.number().int().nonnegative().optional());

/** A string that may be null/number; trimmed and clipped to `max` characters instead of rejected. */
export const looseString = (max = 10_000, fallback = '') =>
  z.preprocess(v => (v === null || v === undefined ? fallback : String(v)), z.string())
    .transform(s => s.trim().slice(0, max));
