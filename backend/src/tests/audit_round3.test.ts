import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../index.js';
import { DocumentJobRegistry, DocumentProcessingJob, findMissingFrozenTerms } from '../chunkOrchestrator.js';
import { createThinkFilter } from '../llm.js';
import { extractJson } from '../jsonExtract.js';
import { splitIntoBatches, joinBatchOutputs } from '../batching.js';

describe('DocumentJobRegistry capacity', () => {
  it('reports full instead of cancelling another running job', () => {
    const registry = new DocumentJobRegistry(5, 1);
    const running: DocumentProcessingJob[] = [];
    for (let i = 0; i < 5; i++) {
      const job = new DocumentProcessingJob(`run-${i}`, 'Some text to rewrite.', 'standard');
      job.status = 'processing';
      registry.register(job);
      running.push(job);
    }
    expect(registry.isFull()).toBe(true);
    expect(running.every(j => j.status === 'processing')).toBe(true);
    expect(registry.size).toBe(5);
    registry.clearAll();
  });

  it('frees slots held by finished jobs', () => {
    const registry = new DocumentJobRegistry(5, 1);
    for (let i = 0; i < 5; i++) {
      const job = new DocumentProcessingJob(`done-${i}`, 'Some text.', 'standard');
      job.status = i === 0 ? 'completed' : 'processing';
      registry.register(job);
    }
    expect(registry.isFull()).toBe(false);
    expect(registry.get('done-0')).toBeUndefined();
    registry.clearAll();
  });
});

describe('frozen term detection', () => {
  it('matches whole terms only, not substrings', () => {
    expect(findMissingFrozenTerms(['AI'], 'AI is useful.', 'It is said to be useful.')).toEqual(['AI']);
    expect(findMissingFrozenTerms(['AI'], 'AI is useful.', 'AI helps.')).toEqual([]);
  });

  it('flags a changed spelling of a kept term', () => {
    expect(findMissingFrozenTerms(['Apple'], 'Apple shipped it.', 'apple shipped it.')).toEqual(['Apple']);
  });

  it('ignores terms that were never in the input', () => {
    expect(findMissingFrozenTerms(['Zebra'], 'No animals here.', 'None here.')).toEqual([]);
  });
});

describe('think-tag stream filter', () => {
  it('drops reasoning even when tags are split across deltas', () => {
    const out: string[] = [];
    const emit = createThinkFilter(d => out.push(d));
    for (const d of ['Hel', 'lo <th', 'ink>secret plan</thi', 'nk> world', '!']) emit(d);
    emit.flush();
    expect(out.join('')).toBe('Hello  world!');
  });

  it('passes through text without think tags, including a lone "<"', () => {
    const out: string[] = [];
    const emit = createThinkFilter(d => out.push(d));
    emit('a < b and ');
    emit('c <');
    emit.flush();
    expect(out.join('')).toBe('a < b and c <');
  });
});

describe('JSON extraction robustness', () => {
  it('finds the real object after a stray unmatched brace in prose', () => {
    expect(extractJson('Note: use { braces. {"a":1}')).toEqual({ a: 1 });
  });

  it('ignores an unclosed (cut-off) think block', () => {
    expect(extractJson('{"ok":true}<think>the model kept reasoning and was cut')).toEqual({ ok: true });
  });
});

describe('batching', () => {
  it('never splits a surrogate pair on a hard cut', () => {
    const text = '😀'.repeat(50); // 100 UTF-16 code units, no whitespace
    const batched = splitIntoBatches(text, 7);
    for (const b of batched.batches) {
      expect(b.text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
    expect(joinBatchOutputs(batched, batched.batches.map(b => b.text))).toBe(text);
  });

  it('cuts CJK text at sentence terminators', () => {
    const text = '这是第一句。这是第二句。这是第三句。';
    const batched = splitIntoBatches(text, 10);
    expect(batched.batches[0].text.endsWith('。')).toBe(true);
  });
});

describe('route fixes', () => {
  let server: http.Server;
  let baseUrl = '';
  beforeAll(async () => {
    await new Promise<void>(resolve => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
        resolve();
      });
    });
  });
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('missing build assets return 404 instead of index.html', async () => {
    const res = await fetch(`${baseUrl}/assets/old-chunk-deadbeef.js`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type') || '').not.toContain('text/html');
  });

  it('translate accepts "AUTO" and reports unsupported codes clearly', async () => {
    const bad = await fetch(`${baseUrl}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello', sourceLang: 'xx', targetLang: 'es' })
    });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('Unsupported language code');

    const ok = await fetch(`${baseUrl}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello', sourceLang: ' AUTO ', targetLang: 'es' })
    });
    expect(ok.status).not.toBe(400);
  });

  it('AI detector does not mark non-Latin text as AI just because it is non-Latin', async () => {
    const hindi = 'आज मौसम बहुत अच्छा है। हम सुबह जल्दी उठकर पार्क गए और दोस्तों के साथ खेले। फिर हमने पास की दुकान से समोसे खरीदे और खाना खाया। दोपहर में हम घर लौट आए और थोड़ी देर आराम किया। शाम को अचानक तेज़ बारिश हुई और बिजली चली गई। हमने मोमबत्ती जलाकर कहानियाँ सुनाईं।';
    const res = await fetch(`${baseUrl}/api/originality/detector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: hindi })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sentences.length).toBeGreaterThan(1);
    expect(json.metrics.entropyScore).toBeGreaterThan(0);
    expect(json.confidence).toBe('Low');
  });
});
