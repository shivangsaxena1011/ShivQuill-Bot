import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import zlib from 'zlib';
import { randomBytes } from 'crypto';
import { AddressInfo } from 'net';
import { safeFetch } from '../plagiarism/safeFetch.js';
import { htmlToText } from '../plagiarism/htmlText.js';
import { tokenize } from '../plagiarism/text.js';
import { compareWithSource, prepareInput } from '../plagiarism/matcher.js';
import { scanForPlagiarism } from '../plagiarism/engine.js';
import { SearchProvider } from '../plagiarism/providers.js';
import { detectAiText } from '../aiDetector.js';

// ---- local server for fetcher edge cases (reached through the trusted-endpoint option) ----
let server: http.Server;
let base = '';
beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/bad-gzip-redirect') {
      res.writeHead(302, { Location: '/ok', 'Content-Encoding': 'gzip' });
      return res.end('this is definitely not gzip');
    }
    if (req.url === '/truncated-gzip') {
      // incompressible data, so the first 200 bytes really are an incomplete gzip stream
      const gz = zlib.gzipSync(randomBytes(50_000));
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Encoding': 'gzip', 'Content-Length': String(gz.length) });
      res.write(gz.subarray(0, 200));
      setTimeout(() => res.socket?.destroy(), 50);
      return;
    }
    if (req.url === '/slow-drip') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      const t = setInterval(() => res.write('.'), 100);
      res.on('close', () => clearInterval(t));
      return;
    }
    if (req.url === '/meta-charset') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(Buffer.concat([Buffer.from('<html><head><meta charset="windows-1251"></head><body>'), Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]), Buffer.from('</body></html>')]));
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset="utf-8"' });
    res.end('fine');
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));

describe('safeFetch robustness', () => {
  it('follows a redirect whose (bogus) body claims gzip without crashing', async () => {
    const r = await safeFetch(`${base}/bad-gzip-redirect`, { allowPrivateNetwork: true, timeoutMs: 3000 });
    expect(r.status).toBe(200);
    expect(r.body).toBe('fine');
  });

  it('rejects (does not hang) when a compressed body is cut off', async () => {
    const started = Date.now();
    await expect(safeFetch(`${base}/truncated-gzip`, { allowPrivateNetwork: true, timeoutMs: 4000 })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('enforces the total deadline against slow-drip servers', async () => {
    const started = Date.now();
    await expect(safeFetch(`${base}/slow-drip`, { allowPrivateNetwork: true, timeoutMs: 600 })).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('decodes pages that declare their charset only in a <meta> tag', async () => {
    const r = await safeFetch(`${base}/meta-charset`, { allowPrivateNetwork: true });
    expect(r.body).toContain('Привет');
  });

  it('still blocks private addresses without the trusted option', async () => {
    await expect(safeFetch(`${base}/ok`)).rejects.toThrow();
  });
});

describe('HTML extraction is linear on hostile input', () => {
  it('handles thousands of unclosed comments/scripts quickly', () => {
    const hostile = '<!--'.repeat(20000) + '<script'.repeat(20000) + '<p '.repeat(20000) + 'text';
    const started = Date.now();
    htmlToText(hostile);
    htmlToText('<article>' + '<div>'.repeat(50000) + 'x');
    expect(Date.now() - started).toBeLessThan(1500);
  });
});

describe('languages without spaces', () => {
  it('tokenizes Chinese into words and detects copied Chinese text', () => {
    const zh = '长城是中国古代的军事防御工程，是一道高大、坚固而且连绵不断的长垣，用以限隔敌骑的行动。长城不是一道单纯孤立的城墙，而是以城墙为主体，同大量的城、障、亭、标相结合的防御体系。';
    expect(tokenize(zh).length).toBeGreaterThan(30);
    const r = compareWithSource(prepareInput(zh.slice(0, 60) + '我昨天和朋友去了公园。'), zh);
    expect(r.passages.some(p => p.type === 'identical')).toBe(true);
  });
});

describe('matcher excerpts', () => {
  it('takes the excerpt from the passage alignment, not an earlier common phrase', () => {
    const filler = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
    const source = `Paris is one of the most visited places on earth. ${filler}. The Danube is one of the most important rivers in central Europe and flows through ten countries.`;
    const input = prepareInput('The Danube is one of the most important rivers in central Europe and flows through ten countries.');
    const r = compareWithSource(input, source);
    expect(r.passages[0].sourceExcerpt).toContain('Danube');
    expect(r.passages[0].sourceExcerpt).not.toContain('Paris');
  });
});

describe('plagiarism scoring consistency', () => {
  const SOURCE = 'Volcanoes form where magma from inside the earth rises through cracks in the crust and erupts as lava, ash and gases above the surface of the planet.';
  const provider = (id: string, texts: string[]): SearchProvider => ({
    id,
    label: id,
    concurrency: 1,
    minIntervalMs: 0,
    async search() {
      return texts.map((text, i) => ({ url: `https://src-${id}.test/${i}`, title: `S${i}`, authorOrSource: 'x', kind: 'web' as const, text }));
    }
  });

  it('breakdown parts add up to the similarity score and every listed source has highlights', async () => {
    const text = `${SOURCE} My grandmother lived near Etna and kept a jar of black sand from the 1983 eruption on her kitchen shelf for decades.`;
    const r = await scanForPlagiarism(text, { online: true, providers: [provider('sum', [SOURCE])] });
    const { identical, minorChanges, paraphrased } = r.breakdown;
    expect(identical + minorChanges + paraphrased).toBe(r.similarityScore);
    for (const s of r.matchedSources) expect(r.matchedSegments.some(g => g.sourceId === s.id)).toBe(true);
  });

  it('words only matched by unlisted (tiny) sources do not count toward the score', async () => {
    // shares only a 5-word run with the input: below the 8-word source threshold
    const text = 'Our garden club met on Saturday to plant tulips, and magma from inside the earth was the joke of the day because the soil felt so warm.';
    const r = await scanForPlagiarism(text, { online: true, providers: [provider('tiny', ['Scientists say magma from inside the earth moves slowly.'])] });
    expect(r.matchedSources.length).toBe(0);
    expect(r.similarityScore).toBe(0);
    expect(r.matchedWords).toBe(0);
  });

  it('a transient error does not mark the provider failed when later queries work', async () => {
    let calls = 0;
    const flaky: SearchProvider = {
      id: 'flaky-round2',
      label: 'Flaky',
      concurrency: 1,
      minIntervalMs: 0,
      async search() {
        calls++;
        if (calls === 1) throw new Error('socket hang up');
        return [];
      }
    };
    const text = Array.from({ length: 6 }, (_, i) => `Sentence ${i} talks at some length about the surprisingly complicated history of municipal tram networks number ${i}.`).join(' ');
    const r = await scanForPlagiarism(text, { online: true, providers: [flaky] });
    expect(calls).toBeGreaterThan(1);
    expect(r.coverage.providers[0].status).toBe('no_results');
    expect(r.coverage.complete).toBe(true);
  });

  it('paces a provider across concurrent scans (shared gate)', async () => {
    const stamps: number[] = [];
    const paced: SearchProvider = {
      id: 'paced-round2',
      label: 'Paced',
      concurrency: 1,
      minIntervalMs: 150,
      maxQueries: 2,
      async search(q) {
        stamps.push(Date.now());
        return [];
      }
    };
    const t = (k: number) => Array.from({ length: 4 }, (_, i) => `Scan ${k} sentence ${i} covers the long and winding story of lighthouse keepers along rocky coasts ${k}${i}.`).join(' ');
    await Promise.all([scanForPlagiarism(t(1), { online: true, providers: [paced] }), scanForPlagiarism(t(2), { online: true, providers: [paced] })]);
    stamps.sort((a, b) => a - b);
    expect(stamps.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < stamps.length; i++) expect(stamps[i] - stamps[i - 1]).toBeGreaterThanOrEqual(130);
  });
});

describe('AI detector edge cases', () => {
  it('caps unpunctuated text and splits it into sentence-sized pieces', async () => {
    const words = Array.from({ length: 9000 }, (_, i) => `word${i % 50}`).join(' ');
    const r = await detectAiText(words);
    expect(r.truncated).toBe(true);
    expect(r.analyzedWords).toBeLessThanOrEqual(6000);
    expect(Math.max(...r.sentences.map(s => s.words))).toBeLessThanOrEqual(60);
  });

  it('category shares always add up to 100', async () => {
    const text =
      'Furthermore, the framework delivers robust scalability. I made pancakes for my brother on Sunday. ' +
      'Moreover, it is crucial to leverage synergies. We missed the 8:15 train and laughed about it. ' +
      'In conclusion, this approach is pivotal. My cat ignored us all afternoon, as usual, which was fine by me.';
    const r = await detectAiText(text);
    const b = r.breakdown;
    expect(b.aiGenerated + b.aiRefined + b.humanRefined + b.human).toBe(100);
  });
});

describe('unreachable search providers', () => {
  it('pauses a provider that times out, so later scans skip it instantly', async () => {
    let calls = 0;
    const dead: SearchProvider = {
      id: 'dead-timeout-test',
      label: 'Dead engine',
      concurrency: 1,
      minIntervalMs: 0,
      async search() {
        calls++;
        await new Promise(r => setTimeout(r, 50));
        throw new Error('Request timed out');
      }
    };
    const text = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} describes the slow migration of grey whales along the Pacific coast in winter ${i}.`).join(' ');
    const first = await scanForPlagiarism(text, { online: true, providers: [dead] });
    expect(calls).toBe(1); // stopped after the first timeout instead of waiting on every query
    expect(first.coverage.providers[0].status).toBe('failed');
    expect(first.coverage.providers[0].message).toMatch(/Not responding/);

    const started = Date.now();
    const second = await scanForPlagiarism(text, { online: true, providers: [dead] });
    expect(calls).toBe(1); // not called again while paused
    expect(second.coverage.providers[0].message).toMatch(/skipped for another/);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
