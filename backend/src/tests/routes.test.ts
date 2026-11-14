import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../index.js';
import http from 'http';

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

describe('API Route Integration', () => {
  it('GET /api/health returns 200 and healthy status', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('healthy');
  });

  it('POST /api/paraphrase rewrites text and returns diffSpans', async () => {
    const res = await fetch(`${baseUrl}/api/paraphrase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'This is a big step to help our team.',
        mode: 'standard',
        synonymStrength: 2
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paraphrasedText).toBeDefined();
    expect(json.diffSpans).toBeInstanceOf(Array);
    expect(json.wordCountOriginal).toBeGreaterThan(0);
  });

  it('POST /api/grammar detects spelling and grammar mistakes', async () => {
    const res = await fetch(`${baseUrl}/api/grammar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'The industry is boom and teh team works hard.'
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.correctedText).toBeDefined();
    expect(json.issues).toBeInstanceOf(Array);
  });

  it('POST /api/humanize enhances natural flow and calculates burstiness', async () => {
    const res = await fetch(`${baseUrl}/api/humanize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Furthermore, it is important to remember that we utilize AI.'
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.humanizedText).toBeDefined();
    expect(json.readabilityScore.burstiness).toBeDefined();
  });

  it('POST /api/summarize condenses text into paragraphs or bullet points', async () => {
    const res = await fetch(`${baseUrl}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Artificial intelligence is transforming writing. Machine learning allows faster iteration. Natural language processing models have reached parity with human writers in many domains.',
        format: 'bullet',
        length: 'short'
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary).toBeDefined();
    expect(json.reductionRatio).toBeGreaterThanOrEqual(0);
  });

  it('POST /api/translate performs translation and language detection', async () => {
    const res = await fetch(`${baseUrl}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Hello world! Welcome to the AI writing platform.',
        sourceLang: 'auto',
        targetLang: 'es'
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.translatedText).toBeDefined();
    expect(json.detectedSourceLang).toBeDefined();
  });

  it('POST /api/originality/detector provides AI likelihood scoring', async () => {
    const res = await fetch(`${baseUrl}/api/originality/detector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Furthermore, it is crucial to remember that delving into this tapestry serves as a testament to our ongoing development.'
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.aiPercentage).toBeGreaterThanOrEqual(0);
    expect(json.sentences).toBeInstanceOf(Array);
    expect(json.disclaimer).toBeDefined();
  });

  it('POST /api/originality/citation formats bibliographic references', async () => {
    const res = await fetch(`${baseUrl}/api/originality/citation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Deep Residual Learning for Image Recognition',
        authors: ['Kaiming He', 'Xiangyu Zhang'],
        year: '2016',
        style: 'APA',
        publisher: 'IEEE'
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.inTextCitation).toBe('(He, 2016)');
    expect(json.fullBibliographyEntry).toContain('Kaiming He (2016)');
  });

  it('POST /api/chat responds to conversational writing prompts', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Give me 3 tips for writing an engaging introduction.' }],
        documentContext: 'A paper on artificial neural networks.'
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.role).toBe('assistant');
    expect(json.content).toBeDefined();
  });
});
