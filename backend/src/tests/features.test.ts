import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../index.js';
import { getParaphraseSystemPrompt, getTranslateSystemPrompt } from '../prompts.js';
import { normalizeIsbn } from '../routes/originality.js';

let server: http.Server;
let baseUrl = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
      resolve();
    });
  });
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

/** Reads an SSE response into a list of {event, data}. */
async function readSse(res: Response) {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter(block => block.startsWith('event:'))
    .map(block => {
      const [eventLine, dataLine] = block.split('\n');
      return { event: eventLine.slice(7), data: JSON.parse(dataLine.slice(6)) };
    });
}

describe('Streaming (SSE)', () => {
  it('streams chat deltas then a final done event', async () => {
    const res = await post('/api/chat?stream=1', { messages: [{ role: 'user', content: 'Give me three tips please' }] });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const events = await readSse(res);
    const deltas = events.filter(e => e.event === 'delta').map(e => e.data.text).join('');
    const done = events.find(e => e.event === 'done');
    expect(events.filter(e => e.event === 'delta').length).toBeGreaterThan(1);
    expect(done?.data.content).toBe(deltas.trim());
  });

  it('streams translate across batches and keeps layout in the final result', async () => {
    const res = await post('/api/translate', { text: 'Hello there.\n\nSecond paragraph.', targetLang: 'fr' }, { Accept: 'text/event-stream' });
    const events = await readSse(res);
    const done = events.find(e => e.event === 'done');
    expect(done?.data.translatedText).toContain('\n\n');
  });

  it('reports validation errors as normal JSON 400 before streaming starts', async () => {
    const res = await post('/api/humanize?stream=1', { text: '' });
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('streams summarize status and done', async () => {
    const res = await post('/api/summarize?stream=1', { text: 'One fact here. Another fact there. A third fact.', format: 'paragraph' });
    const events = await readSse(res);
    expect(events.some(e => e.event === 'status')).toBe(true);
    expect(events.find(e => e.event === 'done')?.data.summary).toBeTruthy();
  });
});

describe('Paraphrase extras', () => {
  it('puts frozen terms into the prompt', () => {
    const prompt = getParaphraseSystemPrompt('standard', 2, '', ['ShivQuill', 'Fortune 500']);
    expect(prompt).toContain('FROZEN TERMS');
    expect(prompt).toContain('- Fortune 500');
  });

  it('reports frozen terms the rewrite dropped', async () => {
    // The mock rewrites "big" -> "large", so a frozen "big" is reported missing
    const res = await post('/api/paraphrase', { text: 'We need big help today.', frozenWords: ['big', 'today'] });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(json.frozenWordsMissing)).toBe(true);
  });

  it('rephrases a single sentence into distinct alternatives', async () => {
    const res = await post('/api/paraphrase/sentence', { sentence: 'This is an important result.', count: 3 });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alternatives.length).toBeGreaterThan(0);
    expect(json.alternatives.length).toBeLessThanOrEqual(3);
    expect(new Set(json.alternatives).size).toBe(json.alternatives.length);
    expect(json.alternatives).not.toContain('This is an important result.');
  });

  it('validates sentence length', async () => {
    const res = await post('/api/paraphrase/sentence', { sentence: 'x'.repeat(2000) });
    expect(res.status).toBe(400);
  });

  it('exposes a live preview while an async job runs and omits duplicate text when done', async () => {
    const start = await post('/api/paraphrase', { text: 'One. Two. Three.\nFour. Five.', async: true });
    const { jobId } = await start.json();
    let task: any;
    for (let i = 0; i < 50; i++) {
      task = await (await fetch(`${baseUrl}/api/tasks/${jobId}`)).json();
      if (task.status === 'completed') break;
      await new Promise(r => setTimeout(r, 20));
    }
    expect(task.status).toBe('completed');
    expect(task.recombinedText).toBeUndefined();
    expect(task.result.paraphrasedText).toBeTruthy();
  });
});

describe('Tone', () => {
  it('analyzes tone with bounded scores', async () => {
    const res = await post('/api/tone/analyze', { text: 'Furthermore, we hereby confirm the agreement regarding the delivery.' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.primaryTone).toBe('Formal');
    expect(json.formality).toBeGreaterThanOrEqual(0);
    expect(json.formality).toBeLessThanOrEqual(100);
    expect(json.tones[0].score).toBeGreaterThanOrEqual(json.tones[json.tones.length - 1].score);
  });

  it('rewrites into a target tone with diff spans', async () => {
    const res = await post('/api/tone/rewrite', { text: "Don't worry, we'll get it done.", tone: 'formal' });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.rewrittenText).toContain('do not');
    expect(Array.isArray(json.diffSpans)).toBe(true);
  });

  it('rejects unknown tones', async () => {
    const res = await post('/api/tone/rewrite', { text: 'Hello', tone: 'sarcastic-evil' });
    expect(res.status).toBe(400);
  });
});

describe('Translator glossary', () => {
  it('adds glossary rules to the prompt', () => {
    const prompt = getTranslateSystemPrompt('Spanish', 'es', undefined, [{ source: 'ShivQuill', target: 'ShivQuill' }, { source: 'invoice', target: 'factura' }]);
    expect(prompt).toContain('GLOSSARY');
    expect(prompt).toContain('"invoice" => "factura"');
  });

  it('validates glossary size and entries', async () => {
    const res = await post('/api/translate', { text: 'Hi', targetLang: 'es', glossary: [{ source: '', target: 'x' }] });
    expect(res.status).toBe(400);
  });
});

describe('Citations: ISBN', () => {
  it('validates ISBN checksums', () => {
    expect(normalizeIsbn('978-0-306-40615-7')).toBe('9780306406157');
    expect(normalizeIsbn('0-306-40615-2')).toBe('0306406152');
    expect(normalizeIsbn('978-0-306-40615-8')).toBeNull();
    expect(normalizeIsbn('12345')).toBeNull();
  });

  it('rejects an invalid ISBN with 400', async () => {
    const res = await post('/api/originality/citation', { isbn: '123-bad', style: 'APA' });
    expect(res.status).toBe(400);
  });
});

describe('Corpus listing', () => {
  it('returns metadata only (no full texts)', async () => {
    const res = await fetch(`${baseUrl}/api/originality/corpus`);
    const json = await res.json();
    expect(json.documentCount).toBeGreaterThan(100);
    expect(json.documents[0].text).toBeUndefined();
    expect(json.documents[0].url).toBeTruthy();
  });
});
