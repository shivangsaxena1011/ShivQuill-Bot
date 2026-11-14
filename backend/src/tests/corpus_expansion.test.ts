import { describe, it, expect } from 'vitest';
import { defaultCorpusManager } from '../corpus.js';

describe('Expanded open-access corpus (arXiv abstracts)', () => {
  const arxivDocs = defaultCorpusManager
    .getAllDocuments()
    .filter(d => d.authorOrSource.endsWith('(arXiv)'));

  it('loads the bundled arXiv abstracts on top of the seed documents', () => {
    expect(defaultCorpusManager.getDocumentCount()).toBeGreaterThan(100);
    expect(arxivDocs.length).toBeGreaterThan(100);
    for (const d of arxivDocs) {
      expect(d.url.startsWith('https://arxiv.org/abs/')).toBe(true);
    }
  });

  it('records a single bulk audit entry instead of one per abstract', () => {
    const logs = defaultCorpusManager.getAuditLogs();
    expect(logs.filter(l => l.docId === 'bulk:arxiv-abstracts')).toHaveLength(1);
    expect(logs.length).toBeLessThan(20);
  });

  it('detects a verbatim sentence copied from a loaded arXiv abstract', () => {
    const doc = arxivDocs[Math.floor(arxivDocs.length / 2)];
    // Take the longest sentence of the abstract (at least ~12 words) as the copied passage
    const sentences = doc.text.split(/(?<=[.!?])\s+/).sort((a, b) => b.length - a.length);
    const copied = sentences[0];
    expect(copied.split(/\s+/).length).toBeGreaterThanOrEqual(12);

    const result = defaultCorpusManager.checkSimilarity(copied, 5);
    expect(result.similarityScore).toBeGreaterThan(50);
    expect(result.matchedSources[0].url).toBe(doc.url);
  });

  it('still scores clearly original text at 0', () => {
    const original =
      'My grandmother kept three stubborn goats behind the bakery and named each one after a famous violinist.';
    const result = defaultCorpusManager.checkSimilarity(original, 5);
    expect(result.similarityScore).toBe(0);
    expect(result.matchedSources).toHaveLength(0);
  });
});
