import axios, { AxiosError } from 'axios';

const http = axios.create({ baseURL: '/api', timeout: 0 });

// ---------------- Types (mirror backend responses) ----------------
export type ParaphraseMode = 'standard' | 'fluency' | 'formal' | 'academic' | 'simple' | 'creative' | 'expand' | 'shorten' | 'custom';

export interface DiffSpan {
  value: string;
  type: 'unchanged' | 'synonym' | 'restructured' | 'added' | 'removed';
  original?: string;
  alternatives?: string[];
}

export interface ParaphraseResult {
  originalText: string;
  paraphrasedText: string;
  diffSpans: DiffSpan[];
  wordCountOriginal: number;
  wordCountAltered: number;
  partialRecovery?: boolean;
  frozenWordsMissing?: string[];
  semanticConsistency?: { preservationRate: number; totalCount: number; preservedCount: number; notes: string };
}

export interface ToneAnalysis {
  primaryTone: string;
  tones: { name: string; score: number }[];
  formality: number;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  confidence: number;
  summary: string;
  sampled: boolean;
}

export interface ToneRewriteResult {
  rewrittenText: string;
  diffSpans: DiffSpan[];
  tone: string;
}

export interface GlossaryEntry {
  source: string;
  target: string;
}

export interface JobProgress {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  progressPercent: number;
  errorMessage?: string;
  latestText?: string;
  result?: ParaphraseResult;
}

export interface GrammarIssue {
  id: string;
  category: 'grammar' | 'spelling' | 'punctuation' | 'style';
  original: string;
  replacement: string;
  start: number;
  end: number;
  explanation: string;
  located?: boolean;
}

export interface GrammarResult {
  originalText: string;
  correctedText: string;
  issues: GrammarIssue[];
  stats: { totalIssues: number; grammarCount: number; spellingCount: number; punctuationCount: number; styleCount: number };
}

export interface Suggestion {
  id: string;
  type: 'clarity' | 'conciseness' | 'vocabulary' | 'tone' | 'restructuring' | 'academic';
  originalText: string;
  suggestedText: string;
  explanation: string;
  start: number;
  end: number;
  located?: boolean;
}

export interface SuggestionsResult {
  suggestions: Suggestion[];
  editorialSummary?: string;
}

export interface HumanizeResult {
  humanizedText: string;
  diffSpans: DiffSpan[];
  readabilityScore: { burstiness: string; flowScore: number; tone: string; fleschReadingEase?: number };
}

export interface SummarizeResult {
  summary: string;
  format: 'paragraph' | 'bullet';
  reductionRatio: number;
  keyPoints?: string[];
}

export interface TranslateResult {
  translatedText: string;
  detectedSourceLang: string;
  targetLang: string;
}

export type AiLabel = 'ai' | 'ai_refined' | 'human_refined' | 'human';

export interface DetectorResult {
  aiPercentage: number;
  humanPercentage: number;
  breakdown: { aiGenerated: number; aiRefined: number; humanRefined: number; human: number };
  confidence: 'High' | 'Moderate' | 'Low';
  overallVerdict: string;
  summary: string;
  sentences: { text: string; start: number; end: number; words: number; aiLikelihood: number; label: AiLabel; flag: 'human' | 'mixed' | 'ai'; reason?: string }[];
  explanations: { text: string; label: AiLabel; aiLikelihood: number; reason: string }[];
  signals: string[];
  metrics: { entropyScore: number; burstinessScore: number; shannonEntropy: number; sentenceLengthCV: number; typeTokenRatio: number; aiPhraseCount: number };
  method: 'model+statistics' | 'statistics';
  methodNote: string;
  analyzedWords: number;
  totalWords: number;
  truncated: boolean;
  disclaimer: string;
  falsePositiveRisk: string;
}

export type MatchType = 'identical' | 'minor' | 'paraphrased';
export type SourceKind = 'web' | 'wikipedia' | 'academic' | 'local';

export interface PlagiarismSource {
  id: string;
  url: string;
  title: string;
  authorOrSource: string;
  kind: SourceKind;
  matchedPercent: number;
  matchedWords: number;
  identicalWords: number;
  minorChangesWords: number;
  paraphrasedWords: number;
  snippetOnly: boolean;
  matchedText: string;
}

export interface PlagiarismResult {
  similarityScore: number;
  uniquenessScore: number;
  totalWordsChecked: number;
  matchedWords: number;
  breakdown: { identical: number; minorChanges: number; paraphrased: number };
  matchedSources: PlagiarismSource[];
  matchedSegments: { text: string; start: number; end: number; sourceId: string; sourceTitle: string; sourceUrl: string; matchType: MatchType; sourceExcerpt: string }[];
  excludedQuotedWords: number;
  corpusStats: { indexedDocuments: number; note: string; searchedScope: string };
  coverage: {
    online: boolean;
    queries: string[];
    providers: { id: string; label: string; status: 'ok' | 'no_results' | 'rate_limited' | 'blocked' | 'failed' | 'skipped'; queried: number; results: number; message?: string }[];
    sourcesFound: number;
    sourcesCompared: number;
    complete: boolean;
    durationMs: number;
    note: string;
  };
}

export interface CitationParams {
  sourceType: 'website' | 'journal' | 'book';
  style: 'APA' | 'MLA' | 'Chicago' | 'Harvard';
  title?: string;
  authors?: string[];
  year?: string;
  containerTitle?: string;
  publisher?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  url?: string;
  doi?: string;
  isbn?: string;
}

export interface CitationResult {
  inTextCitation: string;
  fullBibliographyEntry: string;
  isVerified: boolean;
  sourceOrigin: 'crossref_doi' | 'openlibrary_isbn' | 'user_supplied';
  resolved: {
    sourceType: CitationParams['sourceType'];
    title: string;
    authors: { given: string; family: string }[];
    year: string;
    containerTitle?: string;
    publisher?: string;
    volume?: string;
    issue?: string;
    pages?: string;
    doi?: string;
    url?: string;
  };
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface Health {
  status: string;
  provider: string;
  model: string;
  engineStatus: 'active' | 'mock_test' | 'unconfigured';
  providerStatus: string;
  providerMessage: string;
  version: string;
}

type Opts = { signal?: AbortSignal };

export interface StreamHandlers {
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  onStatus?: (message: string) => void;
}

/**
 * POSTs with `?stream=1` and reads Server-Sent Events: `delta` pieces arrive as they're
 * generated, `done` carries the final result. Falls back to plain JSON if the server
 * (or a proxy) didn't stream.
 */
export async function streamPost<T>(path: string, body: unknown, h: StreamHandlers = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}?stream=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal: h.signal
    });
  } catch (err) {
    // fetch rejects with a TypeError for any network failure ("Failed to fetch", Safari: "Load failed")
    if (err instanceof TypeError) throw new NetworkError();
    throw err;
  }

  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/event-stream')) {
    const data = await res.json().catch(() => undefined);
    if (!res.ok) throw new HttpError(res.status, backendMessage(res.status, data || {}) || `Request failed (${res.status}).`);
    // A 200 that isn't JSON (e.g. a proxy serving the HTML app page) must not be rendered as a result
    if (!data || typeof data !== 'object') throw new Error('The server sent a response that could not be read. Please try again.');
    return data as T;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: T | undefined;

  const handle = (block: string) => {
    let event = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) return; // heartbeat comment
    let payload: any;
    try {
      payload = JSON.parse(data);
    } catch {
      throw new Error('The server sent a response that could not be read. Please try again.');
    }
    if (event === 'delta') h.onDelta?.(payload.text);
    else if (event === 'status') h.onStatus?.(payload.message);
    else if (event === 'error') throw new HttpError(payload.status || 500, backendMessage(payload.status, payload) || 'Request failed.');
    else if (event === 'done') result = payload as T;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        handle(block);
      }
    }
    // Flush the decoder and handle a final frame that wasn't followed by a blank line
    buffer += decoder.decode();
    if (buffer.trim()) handle(buffer);
  } catch (err) {
    if (err instanceof TypeError) throw new NetworkError();
    throw err;
  } finally {
    reader.cancel().catch(() => undefined);
  }
  if (result === undefined) throw new Error('The connection closed before the result arrived. Please try again.');
  return result;
}

/** On validation errors (422) the readable `message` beats the short `error` code. */
function backendMessage(status: number | undefined, data: any): string | undefined {
  return status === 422 ? data?.message || data?.error : data?.error || data?.message;
}

const OFFLINE_MESSAGE = 'Cannot reach the server. Check your connection — if the app was idle, it may be waking up.';

export class NetworkError extends Error {
  constructor() {
    super(OFFLINE_MESSAGE);
    this.name = 'NetworkError';
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export const api = {
  health: (o: Opts = {}) => http.get<Health>('/health', { signal: o.signal, timeout: 15000 }).then(r => r.data),
  languages: () => http.get<{ languages: { code: string; name: string }[] }>('/translate/languages').then(r => r.data.languages),

  startParaphrase: (body: { text: string; mode: ParaphraseMode; synonymStrength: number; customInstruction?: string; frozenWords?: string[] }, o: Opts = {}) =>
    http.post<{ jobId: string; totalChunks: number }>('/paraphrase', { ...body, async: true }, { signal: o.signal }).then(r => r.data),
  jobProgress: (id: string, o: Opts = {}) => http.get<JobProgress>(`/tasks/${id}`, { signal: o.signal }).then(r => r.data),
  cancelJob: (id: string) => http.post(`/tasks/${id}/cancel`).then(r => r.data),

  grammar: (text: string, o: Opts = {}) => http.post<GrammarResult>('/grammar', { text }, { signal: o.signal }).then(r => r.data),
  suggestions: (text: string, focus: string, o: Opts = {}) =>
    http.post<SuggestionsResult>('/suggestions', { text, focus }, { signal: o.signal }).then(r => r.data),
  humanize: (text: string, readabilityLevel: string, h: StreamHandlers = {}) =>
    streamPost<HumanizeResult>('/humanize', { text, readabilityLevel }, h),
  summarize: (text: string, format: 'paragraph' | 'bullet', length: 'short' | 'medium' | 'long', h: StreamHandlers = {}) =>
    streamPost<SummarizeResult>('/summarize', { text, format, length }, h),
  translate: (text: string, sourceLang: string, targetLang: string, glossary: GlossaryEntry[], h: StreamHandlers = {}) =>
    streamPost<TranslateResult>('/translate', { text, sourceLang, targetLang, glossary: glossary.length ? glossary : undefined }, h),
  rephraseSentence: (body: { sentence: string; context?: string; mode: ParaphraseMode; count?: number; customInstruction?: string; frozenWords?: string[] }, o: Opts = {}) =>
    http.post<{ alternatives: string[] }>('/paraphrase/sentence', body, { signal: o.signal }).then(r => r.data),
  toneAnalyze: (text: string, o: Opts = {}) => http.post<ToneAnalysis>('/tone/analyze', { text }, { signal: o.signal }).then(r => r.data),
  toneRewrite: (text: string, tone: string, h: StreamHandlers = {}) => streamPost<ToneRewriteResult>('/tone/rewrite', { text, tone }, h),
  detector: (text: string, h: StreamHandlers = {}) => streamPost<DetectorResult>('/originality/detector', { text }, h),
  plagiarism: (text: string, excludeQuotes: boolean, h: StreamHandlers = {}) =>
    streamPost<PlagiarismResult>('/originality/plagiarism', { text, excludeQuotes }, h),
  citation: (body: CitationParams, o: Opts = {}) => http.post<CitationResult>('/originality/citation', body, { signal: o.signal }).then(r => r.data),
  chat: (messages: ChatTurn[], documentContext: string | undefined, h: StreamHandlers = {}) =>
    streamPost<{ content: string }>('/chat', { messages, documentContext }, h)
};

export function isCancel(err: unknown): boolean {
  return axios.isCancel(err) || (err as any)?.name === 'CanceledError' || (err as any)?.name === 'AbortError';
}

/** Turns any request error into a short, human-readable message. */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 429) return err.message || 'Too many requests — please wait a minute and try again.';
    if (err.status === 502 || err.status === 503) return 'The server is starting up or busy. Please try again in a moment.';
    return err.message;
  }
  if (err instanceof NetworkError) return OFFLINE_MESSAGE;
  const ax = err as AxiosError<any>;
  if (ax?.response) {
    const data = ax.response.data;
    if (ax.response.status === 429) return data?.error || 'Too many requests — please wait a minute and try again.';
    if (ax.response.status === 502 || ax.response.status === 503) return 'The server is starting up or busy. Please try again in a moment.';
    return backendMessage(ax.response.status, data) || `Request failed (${ax.response.status}).`;
  }
  if (ax?.request) return OFFLINE_MESSAGE;
  return (err as Error)?.message || 'Something went wrong.';
}
