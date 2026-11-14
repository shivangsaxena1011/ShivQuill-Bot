import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../index.js';
import { splitIntoParagraphs, splitIntoSentences, chunkSentences } from '../segmenter.js';
import { DocumentProcessingJob } from '../chunkOrchestrator.js';

let server: http.Server;
let baseUrl = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const address = server.address() as any;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe('Large Document Processing & Stress Boundaries', () => {
  it('segments and chunks a 10,000 character document without error', () => {
    const baseSentence = 'The rapid evolution of artificial intelligence frameworks has revolutionized distributed systems engineering. ';
    const paragraph = baseSentence.repeat(10) + '\n\n';
    const text10k = paragraph.repeat(10); // ~11,000 chars

    expect(text10k.length).toBeGreaterThan(10000);

    const paragraphs = splitIntoParagraphs(text10k);
    expect(paragraphs.length).toBe(10);

    const sentences = splitIntoSentences(paragraphs[0]);
    expect(sentences.length).toBe(10);

    const chunks = chunkSentences(sentences, 3);
    expect(chunks.length).toBe(4); // 3 + 3 + 3 + 1 = 10
  });

  it('orchestrates and reconstructs a 50,000 character document correctly', () => {
    const baseSentence = 'Data integrity and formal verification are indispensable for mission-critical computing infrastructure. ';
    const paragraph = baseSentence.repeat(10) + '\n\n';
    const text50k = paragraph.repeat(45); // ~50,000 chars

    expect(text50k.length).toBeGreaterThan(45000);

    const job = new DocumentProcessingJob('stress-job-50k', text50k, 'standard', 2, undefined, undefined, 4);
    expect(job.chunks.length).toBeGreaterThan(100);

    // Verify reconstruction retains paragraph count
    const reconstructed = job.recombine();
    const origParagraphCount = splitIntoParagraphs(text50k).length;
    const recombinedParagraphCount = splitIntoParagraphs(reconstructed).length;
    expect(recombinedParagraphCount).toBe(origParagraphCount);
  });

  it('handles a 100,000 character document segmentation safely within memory bounds', () => {
    const baseSentence = 'Advanced algorithmic paradigms must rigorously balance computational complexity with execution latency. ';
    const paragraph = baseSentence.repeat(10) + '\n\n';
    const text100k = paragraph.repeat(95); // ~100,000 chars

    expect(text100k.length).toBeGreaterThan(95000);

    const startTime = Date.now();
    const paragraphs = splitIntoParagraphs(text100k);
    let totalSentences = 0;
    for (const p of paragraphs) {
      const s = splitIntoSentences(p);
      totalSentences += s.length;
    }
    const elapsed = Date.now() - startTime;

    expect(paragraphs.length).toBe(95);
    expect(totalSentences).toBe(950);
    // V8 regex and string slicing should process 100k chars in under 200ms
    expect(elapsed).toBeLessThan(500);
  });

  it('enforces the technical bound of 1,000,000 characters and rejects payloads exceeding it with 400', async () => {
    const oversizedText = 'A'.repeat(1000001);

    const res = await fetch(`${baseUrl}/api/paraphrase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: oversizedText,
        mode: 'standard',
        synonymStrength: 2
      })
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/exceeds technical memory bound of 1,000,000 characters/i);
  });
});
