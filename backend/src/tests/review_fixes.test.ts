import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../index.js';
import http from 'http';
import { computeMinHashSignature } from '../corpus.js';
import { toClientError } from '../httpErrors.js';
import { ProviderError } from '../llm.js';

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

const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('Review fixes', () => {
  it('chat with an empty messages array is a 400, not a 500', async () => {
    const res = await post('/api/chat', { messages: [] });
    expect(res.status).toBe(400);
  });

  it('chat tolerates an empty assistant turn in the history', async () => {
    const res = await post('/api/chat', {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: '' },
        { role: 'user', content: 'Help me improve this sentence.' }
      ]
    });
    expect(res.status).toBe(200);
  });

  it('custom paraphrase mode requires an instruction', async () => {
    const res = await post('/api/paraphrase', { text: 'A sentence to rewrite.', mode: 'custom' });
    expect(res.status).toBe(400);
    const sentence = await post('/api/paraphrase/sentence', { sentence: 'A sentence to rewrite.', mode: 'custom' });
    expect(sentence.status).toBe(400);
  });

  it('unknown API routes return a JSON 404', async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found/i);
  });

  it('deleting an unknown task is a 404', async () => {
    const res = await fetch(`${baseUrl}/api/tasks/nope`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('provider errors are not leaked to clients', () => {
    const rate = toClientError(new ProviderError('AI Provider Error (GROQ): 429 org_abc limit 8000', { status: 429 }), 'x');
    expect(rate.status).toBe(429);
    expect(rate.message).not.toMatch(/org_abc/);
    const other = toClientError(new ProviderError('AI Provider Error (GROQ): 401 invalid key', { status: 401 }), 'x');
    expect(other.status).toBe(502);
    expect(other.message).not.toMatch(/invalid key/);
  });

  it('MinHash values stay inside [0, 2^31 - 1)', () => {
    const sig = computeMinHashSignature(new Set(['alpha beta gamma', 'delta epsilon zeta']));
    for (const v of sig) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2147483647);
    }
  });
});
