/**
 * Tolerant extraction of a JSON value from an LLM completion.
 *
 * Models (especially reasoning models such as gpt-oss) frequently wrap JSON in markdown fences,
 * prefix it with prose, leave `<think>` blocks, copy `// comments` from the prompt's schema, or add
 * trailing commas. This module recovers the intended object instead of failing the whole request.
 */

export class JsonExtractionError extends Error {
  constructor(public readonly raw: string, message: string) {
    super(message);
    this.name = 'JsonExtractionError';
  }
}

/** Removes `//` line comments and `/* *\/` block comments that sit outside string literals. */
function stripComments(src: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += src[++i] ?? '';
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      i = close === -1 ? src.length : close + 1;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Removes commas that directly precede a closing brace/bracket (outside strings). */
function stripTrailingCommas(src: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      out += ch;
      if (ch === '\\') out += src[++i] ?? '';
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === '}' || src[j] === ']') continue;
    }
    out += ch;
  }
  return out;
}

/** Returns every balanced top-level `{...}` / `[...]` span in the text, in order of appearance. */
function balancedSpans(src: string, open: '{' | '['): string[] {
  const close = open === '{' ? '}' : ']';
  const spans: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"' && depth > 0) {
      inString = true;
    } else if (ch === open) {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === close && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        spans.push(src.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return spans;
}

function tryParse(candidate: string): { ok: true; value: unknown } | { ok: false } {
  for (const variant of [candidate, stripTrailingCommas(stripComments(candidate))]) {
    try {
      return { ok: true, value: JSON.parse(variant) };
    } catch {
      /* try the next variant */
    }
  }
  return { ok: false };
}

/**
 * Extracts the first parseable JSON value from a model completion.
 * When `prefer` is 'object' (the default), objects are tried before arrays.
 */
export function extractJson(raw: string, prefer: 'object' | 'array' = 'object'): unknown {
  // Drop reasoning blocks, including a trailing <think> that was never closed (cut-off reply)
  let text = (raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '').trim();
  if (!text) throw new JsonExtractionError(raw, 'Empty model response');

  // Prefer the contents of a fenced block when present
  const fence = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  const candidates: string[] = [];
  if (fence) candidates.push(fence[1].trim());
  candidates.push(text);

  for (const block of candidates) {
    const direct = tryParse(block);
    if (direct.ok && direct.value !== null && typeof direct.value === 'object') return direct.value;

    const order: Array<'{' | '['> = prefer === 'object' ? ['{', '['] : ['[', '{'];
    for (const open of order) {
      for (const span of balancedSpans(block, open)) {
        const parsed = tryParse(span);
        if (parsed.ok) return parsed.value;
      }
    }
    // A stray, unmatched bracket in prose ("use { braces. {...}") swallows the real value into a
    // span that never closes; rescan from each later bracket so the real value is still found.
    for (const open of order) {
      let from = block.indexOf(open);
      for (let tries = 0; from !== -1 && tries < 50; tries++) {
        const next = block.indexOf(open, from + 1);
        if (next === -1) break;
        const span = balancedSpans(block.slice(next), open)[0];
        if (span) {
          const parsed = tryParse(span);
          if (parsed.ok) return parsed.value;
        }
        from = next;
      }
    }
  }

  text = text.slice(0, 300);
  throw new JsonExtractionError(raw, `No parseable JSON found in model output: ${text}`);
}
