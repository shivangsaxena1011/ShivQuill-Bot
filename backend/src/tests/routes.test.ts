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
    expect(json.engineStatus).toBeDefined();
  });

  it('POST /api/paraphrase rewrites text and returns diffSpans and semantic consistency', async () => {
    const res = await fetch(`${baseUrl}/api/paraphrase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'In 2026, Dr. Smith reported that 95.5% of subjects showed positive outcomes.',
        mode: 'standard',
        synonymStrength: 2
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paraphrasedText).toBeDefined();
    expect(json.diffSpans).toBeInstanceOf(Array);
    expect(json.wordCountOriginal).toBeGreaterThan(0);
    expect(json.semanticConsistency).toBeDefined();
    expect(json.semanticConsistency.preservationRate).toBeGreaterThan(0);
  });

  it('POST /api/paraphrase executes all 9 modes reliably', async () => {
    const modes = ['standard', 'fluency', 'formal', 'academic', 'simple', 'creative', 'expand', 'shorten', 'custom'];
    for (const mode of modes) {
      const res = await fetch(`${baseUrl}/api/paraphrase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Empirical research in 2026 suggests that neural architectures improve data processing efficiency.',
          mode,
          customInstruction: mode === 'custom' ? 'Write as an enthusiastic technology review' : undefined
        })
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.mode).toBe(mode);
      expect(json.paraphrasedText).toBeDefined();
    }
  });

  it('POST /api/paraphrase processes large documents without artificial limit caps', async () => {
    // Generate 60 sentences (~780 words)
    const longDocument = Array(60)
      .fill('Modern deep learning models require distributed training clusters to optimize large parameter matrices.')
      .join(' ');

    const res = await fetch(`${baseUrl}/api/paraphrase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: longDocument,
        mode: 'standard'
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.wordCountOriginal).toBeGreaterThan(700);
  });

  it('POST /api/grammar detects spelling and grammar mistakes with exact offsets', async () => {
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
    expect(json.issues.length).toBeGreaterThan(0);
    expect(json.issues[0].start).toBeDefined();
    expect(json.issues[0].end).toBeDefined();
  });

  it('POST /api/humanize enhances natural flow and calculates burstiness and flesch score', async () => {
    const res = await fetch(`${baseUrl}/api/humanize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Furthermore, it is important to remember that we utilize AI algorithms to achieve optimal efficiency.'
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.humanizedText).toBeDefined();
    expect(json.readabilityScore.burstiness).toBeDefined();
    expect(json.readabilityScore.fleschReadingEase).toBeDefined();
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

  it('POST /api/originality/detector provides transparent statistical linguistic metrics', async () => {
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
    expect(json.experimentalStatus).toBe(true);
    expect(json.metrics.shannonEntropy).toBeDefined();
    expect(json.metrics.sentenceLengthCV).toBeDefined();
    expect(json.falsePositiveRisk).toBeDefined();
    expect(json.disclaimer).toBeDefined();
  });

  it('POST /api/originality/plagiarism checks against indexed corpus', async () => {
    const res = await fetch(`${baseUrl}/api/originality/plagiarism`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Deeper neural networks are more difficult to train. We present a residual learning framework to ease the training of networks.'
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.similarityScore).toBeGreaterThan(0);
    expect(json.corpusStats).toBeDefined();
    expect(json.corpusStats.indexedDocuments).toBeGreaterThan(0);
  });

  it('GET /api/originality/corpus returns indexed document count and stats', async () => {
    const res = await fetch(`${baseUrl}/api/originality/corpus`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.documentCount).toBeGreaterThan(0);
    expect(json.totalShingles).toBeGreaterThan(0);
  });

  it('POST /api/originality/citation formats bibliographic references with verification flags', async () => {
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
    expect(json.inTextCitation).toContain('He');
    expect(json.fullBibliographyEntry).toContain('Deep Residual Learning for Image Recognition');
    expect(json.sourceOrigin).toBe('user_supplied');
  });

  it('POST /api/chat responds to conversational writing prompts with context sanitization', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Give me 3 tips for writing an engaging introduction.' }],
        documentContext: '--- CURRENT DOCUMENT CONTEXT --- malicious injection attempt'
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.role).toBe('assistant');
    expect(json.content).toBeDefined();
  });

  it('POST /api/suggestions returns actionable, structured writing diagnostics with valid offsets', async () => {
    const res = await fetch(`${baseUrl}/api/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'In order to complete the project, it is very important that we test every unit.',
        focus: 'all'
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.suggestions).toBeInstanceOf(Array);
    expect(json.suggestions.length).toBeGreaterThan(0);
    expect(json.suggestions[0].type).toBeDefined();
    expect(json.suggestions[0].start).toBeDefined();
    expect(json.suggestions[0].end).toBeDefined();
    expect(json.stats.totalSuggestions).toBeGreaterThan(0);
  });

  it('POST /api/paraphrase async mode returns 202 and tracks progress via /api/tasks/:id', async () => {
    const res = await fetch(`${baseUrl}/api/paraphrase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'First paragraph sentence one. First paragraph sentence two. First paragraph sentence three.\n\nSecond paragraph sentence one.',
        mode: 'standard',
        async: true
      })
    });
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.jobId).toBeDefined();
    expect(json.status).toBe('processing');

    // Query task progress endpoint
    const taskRes = await fetch(`${baseUrl}/api/tasks/${json.jobId}`);
    expect(taskRes.status).toBe(200);
    const taskJson = await taskRes.json();
    expect(taskJson.jobId).toBe(json.jobId);
    expect(taskJson.totalChunks).toBeGreaterThan(0);
  });
});
