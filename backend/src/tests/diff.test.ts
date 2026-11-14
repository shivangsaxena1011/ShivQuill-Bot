import { describe, it, expect } from 'vitest';
import { generateDiffSpans } from '../diff.js';

describe('Diff Engine', () => {
  it('correctly tags unchanged words', () => {
    const text = 'The quick brown fox jumps.';
    const spans = generateDiffSpans(text, text);
    expect(spans).toHaveLength(1);
    expect(spans[0].type).toBe('unchanged');
    expect(spans[0].value).toBe(text);
  });

  it('identifies word replacement / synonym substitution', () => {
    const orig = 'The big fox.';
    const rewritten = 'The large fox.';
    const spans = generateDiffSpans(orig, rewritten);
    
    const synonymSpan = spans.find(s => s.type === 'synonym');
    expect(synonymSpan).toBeDefined();
    expect(synonymSpan?.value.trim()).toBe('large');
    expect(synonymSpan?.original?.trim()).toBe('big');
  });

  it('detects insertions and deletions', () => {
    const orig = 'He ran to the store.';
    const rewritten = 'He quickly ran to the local store today.';
    const spans = generateDiffSpans(orig, rewritten);
    
    expect(spans.some(s => s.type === 'added' || s.type === 'synonym')).toBe(true);
  });
});
