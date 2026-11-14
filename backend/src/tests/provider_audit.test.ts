import { describe, it, expect } from 'vitest';
import { executeLlmCompletion, executeSimulatedLlmCompletion } from '../llm.js';
import { defaultCorpusManager } from '../corpus.js';
import { assertProductionReadiness, config } from '../config.js';

describe('AI Provider Security & Error Handling Audit', () => {
  it('throws an explicit error when real provider is requested without an API key', async () => {
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

  it('throws an explicit error when running in UNCONFIGURED mode', async () => {
    const originalType = config.requestType;
    
    try {
      config.requestType = 'UNCONFIGURED';

      await expect(
        executeLlmCompletion('You are a helpful assistant', 'Hello world')
      ).rejects.toThrow(/ShivQuill is running in unconfigured mode/i);
    } finally {
      config.requestType = originalType;
    }
  });

  it('ZERO-MOCK POLICY: assertProductionReadiness rejects MOCK or UNCONFIGURED in production', () => {
    const origEnv = config.env;
    const origType = config.requestType;

    try {
      config.env = 'production';
      config.requestType = 'MOCK';
      expect(() => assertProductionReadiness()).toThrow(/Cannot start production server with provider 'MOCK'/i);

      config.requestType = 'UNCONFIGURED';
      expect(() => assertProductionReadiness()).toThrow(/Cannot start production server with provider 'UNCONFIGURED'/i);
    } finally {
      config.env = origEnv;
      config.requestType = origType;
    }
  });

  it('ZERO-MOCK POLICY: executeSimulatedLlmCompletion strictly forbids execution in production', () => {
    const origEnv = config.env;
    try {
      config.env = 'production';
      expect(() => executeSimulatedLlmCompletion('system', 'user')).toThrow(/ZERO-MOCK POLICY/i);
    } finally {
      config.env = origEnv;
    }
  });

  it('genuinely detects matches against verified open-access reference corpus', () => {
    const docs = defaultCorpusManager.getAllDocuments();
    expect(docs.length).toBeGreaterThan(0);

    // Exact quote from verified reference document (ResNet paper)
    const snippet = docs[0].text;
    const result = defaultCorpusManager.checkSimilarity(snippet, 5);

    expect(result.similarityScore).toBeGreaterThan(50);
    expect(result.matchedSources.length).toBeGreaterThan(0);
    expect(result.matchedSources[0].title).toBe(docs[0].title);
    expect(result.matchedSources[0].url).toBe(docs[0].url);
  });

  it('correctly returns 0% similarity for completely original text without fabricating matches', () => {
    const originalText = 'The astronaut observed a celestial body traversing the outer perimeter of Jupiter with unusual velocity.';
    const result = defaultCorpusManager.checkSimilarity(originalText, 5);

    expect(result.similarityScore).toBe(0);
    expect(result.uniquenessScore).toBe(100);
    expect(result.matchedSources).toHaveLength(0);
    expect(result.matchedSegments).toHaveLength(0);
  });
});
