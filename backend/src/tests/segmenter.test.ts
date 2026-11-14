import { describe, it, expect } from 'vitest';
import { splitIntoParagraphs, splitIntoSentences, chunkSentences } from '../segmenter.js';

describe('Segmenter Engine', () => {
  it('correctly splits multi-paragraph text', () => {
    const raw = "Paragraph one with text.\n\nParagraph two with details.\r\n\r\nParagraph three.";
    const paras = splitIntoParagraphs(raw);
    expect(paras).toHaveLength(3);
    expect(paras[0]).toBe('Paragraph one with text.');
    expect(paras[1]).toBe('Paragraph two with details.');
    expect(paras[2]).toBe('Paragraph three.');
  });

  it('correctly segments sentences within a paragraph', () => {
    const paragraph = "The industry is booming. We achieved Fortune 500 status! Can you believe it?";
    const sentences = splitIntoSentences(paragraph);
    expect(sentences).toHaveLength(3);
    expect(sentences[0]).toBe('The industry is booming.');
    expect(sentences[1]).toBe('We achieved Fortune 500 status!');
    expect(sentences[2]).toBe('Can you believe it?');
  });

  it('defensively handles zero or negative chunk sizes without infinite loops', () => {
    const sentences = ['Sentence 1.', 'Sentence 2.', 'Sentence 3.', 'Sentence 4.'];
    
    // Test with 0 (which was the bug in Phrasing-Bot)
    const chunksZero = chunkSentences(sentences, 0);
    expect(chunksZero.length).toBeGreaterThan(0);
    expect(chunksZero[0].sentences.length).toBe(1); // Defaults to Math.max(1, 0) -> 1

    // Test with negative number
    const chunksNeg = chunkSentences(sentences, -5);
    expect(chunksNeg.length).toBeGreaterThan(0);
    expect(chunksNeg[0].sentences.length).toBe(1);

    // Test with valid chunk size 2
    const chunksValid = chunkSentences(sentences, 2);
    expect(chunksValid).toHaveLength(2);
    expect(chunksValid[0].sentences).toEqual(['Sentence 1.', 'Sentence 2.']);
    expect(chunksValid[1].sentences).toEqual(['Sentence 3.', 'Sentence 4.']);
  });
});
