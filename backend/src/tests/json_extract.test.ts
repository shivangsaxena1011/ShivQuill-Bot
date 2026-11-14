import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { extractJson, JsonExtractionError } from '../jsonExtract.js';
import { looseNumber, looseString, looseOffset } from '../structuredCompletion.js';

describe('extractJson', () => {
  it('parses a plain object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON inside a markdown fence with surrounding prose', () => {
    expect(extractJson('Here you go:\n```json\n{"alternatives":["x","y"]}\n```\nHope it helps!'))
      .toEqual({ alternatives: ['x', 'y'] });
  });

  it('ignores <think> blocks and braces in leading prose', () => {
    expect(extractJson('<think>maybe {weird}</think>Sure {not json} -> {"ok":true}')).toEqual({ ok: true });
  });

  it('tolerates comments copied from the schema and trailing commas', () => {
    const raw = `{
      "primaryTone": "Formal", // one or two words
      "tones": [{ "name": "Formal", "score": 90 },],
      /* block */ "summary": "Reads like a report. // not a comment",
    }`;
    expect(extractJson(raw)).toEqual({
      primaryTone: 'Formal',
      tones: [{ name: 'Formal', score: 90 }],
      summary: 'Reads like a report. // not a comment'
    });
  });

  it('handles braces inside string values', () => {
    expect(extractJson('{"text":"use {curly} and } brace"}')).toEqual({ text: 'use {curly} and } brace' });
  });

  it('can return a bare array', () => {
    expect(extractJson('["a","b"]', 'array')).toEqual(['a', 'b']);
  });

  it('throws JsonExtractionError when nothing parses', () => {
    expect(() => extractJson('no json here')).toThrow(JsonExtractionError);
    expect(() => extractJson('')).toThrow(JsonExtractionError);
  });
});

describe('lenient schema helpers', () => {
  it('looseNumber accepts numeric strings and percentages', () => {
    const s = looseNumber(5);
    expect(s.parse('85')).toBe(85);
    expect(s.parse('72%')).toBe(72);
    expect(s.parse(null)).toBe(5);
    expect(s.parse('n/a')).toBe(5);
  });

  it('looseString clips instead of rejecting long values', () => {
    expect(looseString(5).parse('  abcdefgh ')).toBe('abcde');
    expect(looseString(5).parse(null)).toBe('');
  });

  it('looseOffset drops invalid offsets', () => {
    const s = z.object({ start: looseOffset });
    expect(s.parse({ start: '12' }).start).toBe(12);
    expect(s.parse({ start: -1 }).start).toBeUndefined();
    expect(s.parse({ start: null }).start).toBeUndefined();
    expect(s.parse({}).start).toBeUndefined();
  });
});
