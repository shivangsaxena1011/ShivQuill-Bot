import { describe, it, expect } from 'vitest';
import { executeLlmCompletion } from '../llm.js';
import { checkCorpusSimilarity, REFERENCE_CORPUS } from '../corpus.js';

describe('AI Provider Security & Error Handling Audit', () => {
  it('throws an explicit error when real provider is requested without an API key', async () => {
    // In MOCK mode, it uses the test engine, but if we change config.requestType to 'OPENAI' with no key:
    const { config } = await import('../config.js');
    const originalType = config.requestType;
    
    try {
      config.requestType = 'OPENAI';
      config.openai.apiKey = '';

      await expect(
        executeLlmCompletion('You are a helpful assistant', 'Hello world')
      ).rejects.toThrow(/no API key is configured/i);
    } finally {
      config.requestType = originalType;
    }
  });

  it('genuinely detects matches against reference corpus', () => {
    // Exact quote from reference corpus document
    const snippet = REFERENCE_CORPUS[0].text;
    const result = checkCorpusSimilarity(snippet, 4);

    expect(result.similarityScore).toBeGreaterThan(50);
    expect(result.matchedSources.length).toBeGreaterThan(0);
    expect(result.matchedSources[0].title).toBe(REFERENCE_CORPUS[0].title);
    expect(result.matchedSources[0].url).toBe(REFERENCE_CORPUS[0].sourceUrl);
  });

  it('correctly returns 0% similarity for completely original text without fabricating matches', () => {
    const originalText = 'The astronaut observed a celestial body traversing the outer perimeter of Jupiter with unusual velocity.';
    const result = checkCorpusSimilarity(originalText, 5);

    expect(result.similarityScore).toBe(0);
    expect(result.uniquenessScore).toBe(100);
    expect(result.matchedSources).toHaveLength(0);
    expect(result.matchedSegments).toHaveLength(0);
  });
});
