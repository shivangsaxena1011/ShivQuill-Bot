import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../index.js';
import { splitIntoBatches, joinBatchOutputs } from '../batching.js';
import { isModelAllowed, getDefaultModel } from '../llm.js';
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
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

describe('Model allowlist', () => {
  it('allows the default model and an omitted model', () => {
    expect(isModelAllowed(undefined)).toBe(true);
    expect(isModelAllowed(getDefaultModel())).toBe(true);
  });

  it('rejects arbitrary client-selected models with 400 on every AI route', async () => {
    const routes: Array<[string, object]> = [
      ['/api/paraphrase', { text: 'Hello world.' }],
      ['/api/grammar', { text: 'Hello world.' }],
      ['/api/humanize', { text: 'Hello world.' }],
      ['/api/summarize', { text: 'Hello world.' }],
      ['/api/translate', { text: 'Hello world.' }],
      ['/api/suggestions', { text: 'Hello world.' }],
      ['/api/chat', { messages: [{ role: 'user', content: 'hi' }] }]
    ];
    for (const [route, body] of routes) {
      const res = await post(route, { ...body, model: 'gpt-4-32k-very-expensive' });
      expect(res.status, route).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/not allowed/);
    }
  });

  it('rejects non-string model values', async () => {
    const res = await post('/api/grammar', { text: 'Hello world.', model: { evil: true } });
    expect(res.status).toBe(400);
  });
});

describe('Input batching', () => {
  it('keeps every batch within the limit and reassembles the exact original layout', () => {
    const para = 'This is a sentence that repeats for testing purposes. '.repeat(20).trim();
    const text = `  ${para}\n\n${para}\n${para}\n\n\n${para}  `;
    const batched = splitIntoBatches(text, 1500);

    expect(batched.batches.length).toBeGreaterThan(1);
    for (const b of batched.batches) {
      expect(b.text.length).toBeLessThanOrEqual(1500);
      expect(text.slice(b.start, b.start + b.text.length)).toBe(b.text);
    }
    // Identity transform must reproduce the input exactly
    expect(joinBatchOutputs(batched, batched.batches.map(b => b.text))).toBe(text);
  });

  it('hard-splits a single token longer than the limit without looping forever', () => {
    const text = 'x'.repeat(5000);
    const batched = splitIntoBatches(text, 1000);
    expect(batched.batches.map(b => b.text).join('')).toBe(text);
  });

  it('grammar on a multi-batch document maps offsets to the original text', async () => {
    const filler = 'The quarterly results were reviewed carefully by the whole committee today. '.repeat(40).trim();
    const paragraphs = Array.from({ length: 8 }, (_, i) => `Paragraph ${i} mentions teh plan. ${filler}`);
    const text = paragraphs.join('\n\n');
    expect(text.length).toBeGreaterThan(12000);

    const res = await post('/api/grammar', { text });
    expect(res.status).toBe(200);
    const json = await res.json();

    // The mock engine reports the first typo per request, so >1 issue proves several batches ran
    expect(json.issues.length).toBeGreaterThan(1);
    for (const issue of json.issues) {
      expect(text.slice(issue.start, issue.end)).toBe('teh');
    }
    expect(new Set(json.issues.map((i: any) => i.start)).size).toBe(json.issues.length);
    expect(new Set(json.issues.map((i: any) => i.id)).size).toBe(json.issues.length);
    expect(json.correctedText).not.toContain('teh');
    expect(json.correctedText.split('\n\n').length).toBe(8);
  });

  it('summarizes documents larger than one request', async () => {
    const text = Array.from({ length: 400 }, (_, i) => `Finding number ${i} was recorded in the lab notebook.`).join(' ');
    expect(text.length).toBeGreaterThan(12000);
    const res = await post('/api/summarize', { text, format: 'paragraph', length: 'short' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary.length).toBeGreaterThan(0);
    expect(json.summary.length).toBeLessThan(text.length);
  });
});

describe('Async paraphrase jobs', () => {
  it('returns the full result (diff spans, invariance) from /api/tasks/:id once completed', async () => {
    const res = await post('/api/paraphrase', {
      text: 'We need big help. It is important.\n\nSecond paragraph here.',
      mode: 'standard',
      async: true
    });
    expect(res.status).toBe(202);
    const { jobId } = await res.json();

    let task: any;
    for (let i = 0; i < 50; i++) {
      task = await (await fetch(`${baseUrl}/api/tasks/${jobId}`)).json();
      if (task.status === 'completed') break;
      await new Promise(r => setTimeout(r, 20));
    }
    expect(task.status).toBe('completed');
    expect(task.progressPercent).toBe(100);
    expect(task.result.paraphrasedText).toBeDefined();
    expect(Array.isArray(task.result.diffSpans)).toBe(true);
    expect(task.result.semanticConsistency).toBeDefined();
  });

  it('does not expose half-finished text while a job is still processing', () => {
    const job = new DocumentProcessingJob('job-progress', 'One. Two. Three. Four.', 'standard', 2, undefined, undefined, 1);
    job.status = 'processing';
    job.partialRecovery = true;
    expect(job.getProgress().recombinedText).toBeUndefined();
  });
});
