import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../index.js';
import { compareWithSource, prepareInput } from '../plagiarism/matcher.js';
import { scanForPlagiarism } from '../plagiarism/engine.js';
import { ProviderBlockedError, SearchProvider } from '../plagiarism/providers.js';
import { isPublicIp, assertFetchableUrl } from '../plagiarism/safeFetch.js';
import { htmlToText } from '../plagiarism/htmlText.js';
import { generateQueries } from '../plagiarism/queries.js';
import { detectAiText } from '../aiDetector.js';

const SOURCE = `The Great Wall of China is a series of fortifications that were built across the historical northern borders of ancient Chinese states and Imperial China as protection against various nomadic groups from the Eurasian Steppe. Several walls were built from as early as the 7th century BC, with selective stretches later joined by Qin Shi Huang, the first emperor of China. Little of the Qin wall remains today. Later on, many successive dynasties built and maintained multiple stretches of border walls.`;

function fakeProvider(id: string, text = SOURCE, opts: Partial<SearchProvider> = {}): SearchProvider {
  return {
    id,
    label: `Fake ${id}`,
    concurrency: 2,
    minIntervalMs: 0,
    async search() {
      return [{ url: `https://example-source.test/${id}`, title: `Source ${id}`, authorOrSource: 'example-source.test', kind: 'web', text }];
    },
    ...opts
  };
}

describe('plagiarism matcher', () => {
  it('classifies verbatim copying as identical', () => {
    const input = prepareInput('As noted, the Great Wall of China is a series of fortifications that were built across the historical northern borders of ancient Chinese states. I visited it last year.');
    const r = compareWithSource(input, SOURCE);
    expect(r.passages.some(p => p.type === 'identical')).toBe(true);
    const identicalWords = [...r.mask].filter(v => v === 3).length;
    expect(identicalWords).toBeGreaterThanOrEqual(20);
  });

  it('classifies lightly edited copying as minor changes', () => {
    const input = prepareInput('The Great Wall of China is a chain of fortifications that were built along the historical northern borders of ancient Chinese states and Imperial China as a defence against various nomadic groups.');
    const r = compareWithSource(input, SOURCE);
    expect(r.passages.some(p => p.type === 'minor')).toBe(true);
    expect([...r.mask].filter(v => v === 2).length).toBeGreaterThan(0);
  });

  it('detects close paraphrase at sentence level', () => {
    const input = prepareInput('Many successive dynasties later built and maintained several stretches of these border walls over the centuries, according to historians.');
    const r = compareWithSource(input, SOURCE);
    expect(r.passages.some(p => p.type === 'paraphrased' || p.type === 'minor')).toBe(true);
  });

  it('does not flag unrelated text or common phrases', () => {
    const input = prepareInput('Our cat knocked the coffee off the table again this morning, so I spent the first hour of the day cleaning the rug instead of working on the report.');
    const r = compareWithSource(input, SOURCE);
    expect(r.passages.length).toBe(0);
  });
});

describe('plagiarism engine (offline, fake providers)', () => {
  it('builds a report with sources, segments, breakdown and coverage', async () => {
    const text = `${SOURCE.split('. ').slice(0, 2).join('. ')}. This last sentence is entirely my own and talks about my trip to Beijing in 2019 with my cousins.`;
    const r = await scanForPlagiarism(text, { online: true, providers: [fakeProvider('a')] });
    expect(r.similarityScore).toBeGreaterThan(50);
    expect(r.similarityScore).toBeLessThan(100);
    expect(r.uniquenessScore).toBe(100 - r.similarityScore);
    expect(r.matchedSources[0].url).toBe('https://example-source.test/a');
    expect(r.matchedSources[0].identicalWords).toBeGreaterThan(20);
    expect(r.breakdown.identical).toBeGreaterThan(0);
    expect(r.matchedSegments.length).toBeGreaterThan(0);
    const seg = r.matchedSegments[0];
    expect(text.slice(seg.start, seg.end)).toBe(seg.text);
    expect(seg.sourceExcerpt.length).toBeGreaterThan(10);
    expect(r.coverage.online).toBe(true);
    expect(r.coverage.providers[0].status).toBe('ok');
    expect(r.coverage.complete).toBe(true);
  });

  it('does not count quoted text when excludeQuotes is on', async () => {
    const text = `As one guide puts it, "${SOURCE.split('. ')[0]}." I think that undersells how strange it feels to walk on it at dawn.`;
    const withQuotes = await scanForPlagiarism(text, { online: true, providers: [fakeProvider('b')] });
    const excluded = await scanForPlagiarism(text, { online: true, excludeQuotes: true, providers: [fakeProvider('c')] });
    expect(withQuotes.similarityScore).toBeGreaterThan(30);
    expect(excluded.similarityScore).toBe(0);
    expect(excluded.excludedQuotedWords).toBeGreaterThan(20);
  });

  it('reports throttled providers as partial coverage and rests them', async () => {
    const throttled = fakeProvider('throttle-test', SOURCE, {
      async search() {
        throw new ProviderBlockedError('rate_limited', 'Rate limited', 30);
      }
    });
    const text = 'An entirely original paragraph about learning to bake sourdough bread at home during a long and very rainy winter, with plenty of failed loaves along the way before one finally rose.';
    const r = await scanForPlagiarism(text, { online: true, providers: [throttled] });
    expect(r.coverage.providers[0].status).toBe('rate_limited');
    expect(r.coverage.complete).toBe(false);
    expect(r.coverage.note).toMatch(/Partial scan/);
    // second scan within the cool-down does not call the provider again
    const again = await scanForPlagiarism(text, { online: true, providers: [throttled] });
    expect(again.coverage.providers[0].queried).toBe(0);
  });

  it('spreads search phrases across the whole document', () => {
    const doc = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} discusses the distinctive topic ${'xyzabc'.slice(i % 5)}${i} in considerable unusual detail here.`).join(' ');
    const input = prepareInput(doc);
    const qs = generateQueries(doc, input.tokens, input.sentences, 8);
    expect(qs.length).toBeGreaterThanOrEqual(2);
    expect(qs[qs.length - 1].t0).toBeGreaterThan(input.tokens.length / 2);
  });
});

describe('safe fetching', () => {
  it('allows public addresses, including NAT64-mapped ones', () => {
    expect(isPublicIp('8.8.8.8')).toBe(true);
    expect(isPublicIp('64:ff9b::14cc:f4c0')).toBe(true); // 20.204.244.192
    expect(isPublicIp('2606:4700::1')).toBe(true);
  });

  it('blocks private, loopback and mapped-private addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '64:ff9b::a00:1']) {
      expect(isPublicIp(ip)).toBe(false);
    }
  });

  it('rejects local hosts, odd ports and non-http schemes', () => {
    expect(() => assertFetchableUrl('http://localhost/x')).toThrow();
    expect(() => assertFetchableUrl('http://example.com:8080/')).toThrow();
    expect(() => assertFetchableUrl('file:///etc/passwd')).toThrow();
    expect(() => assertFetchableUrl('http://[::1]/')).toThrow();
    expect(assertFetchableUrl('https://example.com/page').hostname).toBe('example.com');
  });

  it('extracts article text without scripts or navigation', () => {
    const html = `<html><head><title>T &amp; C</title><script>var x="secret"</script></head><body><nav>Home About</nav>
      <article><h1>Heading</h1><p>First paragraph with enough words to count as the main content of this page, repeated.</p>
      <p>${'Body text sentence. '.repeat(30)}</p></article><footer>Footer links</footer></body></html>`;
    const r = htmlToText(html);
    expect(r.title).toBe('T & C');
    expect(r.text).toContain('First paragraph');
    expect(r.text).not.toContain('secret');
    expect(r.text).not.toContain('Home About');
  });
});

describe('AI detector', () => {
  const AI_TEXT =
    'Artificial intelligence has emerged as a transformative force across numerous industries. Furthermore, it is crucial to recognize that organizations must leverage these tools to remain competitive in an ever-evolving landscape. Moreover, the integration of AI-driven solutions enables companies to streamline processes and enhance decision-making. In conclusion, a balanced and responsible approach will be pivotal to ensuring sustainable success.';
  const HUMAN_TEXT =
    "I burned the toast again this morning, which is honestly a talent at this point. My sister texted at 7:40 asking if I'd remembered her birthday (I had not). We ended up meeting at the noodle place on 5th Street, the one with the broken neon sign, and she laughed about it the whole time.";

  it('scores stock AI prose as AI and personal writing as human', async () => {
    const ai = await detectAiText(AI_TEXT);
    const human = await detectAiText(HUMAN_TEXT);
    expect(ai.method).toBe('model+statistics');
    expect(ai.aiPercentage).toBeGreaterThanOrEqual(60);
    expect(ai.overallVerdict).toBe('Likely AI-Generated');
    expect(human.aiPercentage).toBeLessThan(25);
    expect(human.overallVerdict).toBe('Likely Human-Written');
    expect(ai.breakdown.aiGenerated + ai.breakdown.aiRefined + ai.breakdown.humanRefined + ai.breakdown.human).toBe(100);
    expect(ai.explanations.length).toBeGreaterThan(0);
    for (const s of ai.sentences) expect(AI_TEXT.slice(s.start, s.end)).toBe(s.text);
  });

  describe('route', () => {
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

    it('rejects text under 40 words with a clear message', async () => {
      const res = await fetch(`${baseUrl}/api/originality/detector`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Too short to judge reliably, honestly.' })
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/40 words/);
    });

    it('streams progress and a final result over SSE', async () => {
      const res = await fetch(`${baseUrl}/api/originality/detector?stream=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ text: AI_TEXT })
      });
      const body = await res.text();
      expect(body).toContain('event: status');
      expect(body).toContain('event: done');
    });

    it('plagiarism route returns a coverage report (offline in tests)', async () => {
      const res = await fetch(`${baseUrl}/api/originality/plagiarism`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Deeper neural networks are more difficult to train. We present a residual learning framework to ease the training of networks.', excludeQuotes: false })
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.similarityScore).toBeGreaterThan(0);
      expect(json.coverage.online).toBe(false);
      expect(json.matchedSources[0].kind).toBe('local');
    });
  });
});

describe('AI detector sentence spans', () => {
  it('keeps closing punctuation inside each sentence', async () => {
    const text = 'We tried the new bakery on Elm Street yesterday. The croissants were "life-changing." Honestly, I would go back tomorrow if I could, maybe twice, because the coffee was also excellent and cheap enough for students like us.';
    const r = await detectAiText(text);
    expect(r.sentences[0].text.endsWith('.')).toBe(true);
    expect(r.sentences[1].text.endsWith('."')).toBe(true);
    for (const s of r.sentences) expect(text.slice(s.start, s.end)).toBe(s.text);
  });
});
