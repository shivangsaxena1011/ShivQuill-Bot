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
  semanticConsistency?: { preservationRate: number; totalCount: number; preservedCount: number; notes: string };
}

export interface JobProgress {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  progressPercent: number;
  errorMessage?: string;
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

export interface DetectorResult {
  aiPercentage: number;
  humanPercentage: number;
  confidence: string;
  overallVerdict: string;
  sentences: { text: string; aiLikelihood: number; flag: 'human' | 'mixed' | 'ai' }[];
  metrics: { entropyScore: number; burstinessScore: number; shannonEntropy: number; sentenceLengthCV: number; typeTokenRatio: number };
  disclaimer: string;
  falsePositiveRisk: string;
}

export interface PlagiarismResult {
  similarityScore: number;
  uniquenessScore: number;
  totalWordsChecked: number;
  matchedSources: { id: string; url: string; title: string; authorOrSource: string; matchedPercent: number; documentSimilarity?: number; matchedText: string }[];
  matchedSegments: { text: string; sourceTitle?: string; sourceUrl?: string; start?: number; end?: number }[];
  corpusStats: { indexedDocuments: number; note: string };
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
}

export interface CitationResult {
  inTextCitation: string;
  fullBibliographyEntry: string;
  isVerified: boolean;
  sourceOrigin: 'crossref_doi' | 'user_supplied';
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

export const api = {
  health: (o: Opts = {}) => http.get<Health>('/health', { signal: o.signal, timeout: 15000 }).then(r => r.data),
  languages: () => http.get<{ languages: { code: string; name: string }[] }>('/translate/languages').then(r => r.data.languages),

  startParaphrase: (body: { text: string; mode: ParaphraseMode; synonymStrength: number; customInstruction?: string }, o: Opts = {}) =>
    http.post<{ jobId: string; totalChunks: number }>('/paraphrase', { ...body, async: true }, { signal: o.signal }).then(r => r.data),
  jobProgress: (id: string, o: Opts = {}) => http.get<JobProgress>(`/tasks/${id}`, { signal: o.signal }).then(r => r.data),
  cancelJob: (id: string) => http.post(`/tasks/${id}/cancel`).then(r => r.data),

  grammar: (text: string, o: Opts = {}) => http.post<GrammarResult>('/grammar', { text }, { signal: o.signal }).then(r => r.data),
  suggestions: (text: string, focus: string, o: Opts = {}) =>
    http.post<SuggestionsResult>('/suggestions', { text, focus }, { signal: o.signal }).then(r => r.data),
  humanize: (text: string, readabilityLevel: string, o: Opts = {}) =>
    http.post<HumanizeResult>('/humanize', { text, readabilityLevel }, { signal: o.signal }).then(r => r.data),
  summarize: (text: string, format: 'paragraph' | 'bullet', length: 'short' | 'medium' | 'long', o: Opts = {}) =>
    http.post<SummarizeResult>('/summarize', { text, format, length }, { signal: o.signal }).then(r => r.data),
  translate: (text: string, sourceLang: string, targetLang: string, o: Opts = {}) =>
    http.post<TranslateResult>('/translate', { text, sourceLang, targetLang }, { signal: o.signal }).then(r => r.data),
  detector: (text: string, o: Opts = {}) => http.post<DetectorResult>('/originality/detector', { text }, { signal: o.signal }).then(r => r.data),
  plagiarism: (text: string, o: Opts = {}) => http.post<PlagiarismResult>('/originality/plagiarism', { text }, { signal: o.signal }).then(r => r.data),
  citation: (body: CitationParams, o: Opts = {}) => http.post<CitationResult>('/originality/citation', body, { signal: o.signal }).then(r => r.data),
  chat: (messages: ChatTurn[], documentContext: string | undefined, o: Opts = {}) =>
    http.post<{ content: string }>('/chat', { messages, documentContext }, { signal: o.signal }).then(r => r.data)
};

export function isCancel(err: unknown): boolean {
  return axios.isCancel(err) || (err as any)?.name === 'CanceledError' || (err as any)?.name === 'AbortError';
}

/** Turns any request error into a short, human-readable message. */
export function errorMessage(err: unknown): string {
  const ax = err as AxiosError<any>;
  if (ax?.response) {
    const data = ax.response.data;
    if (ax.response.status === 429) return data?.error || 'Too many requests — please wait a minute and try again.';
    if (ax.response.status === 502 || ax.response.status === 503) return 'The server is starting up or busy. Please try again in a moment.';
    return data?.error || data?.message || `Request failed (${ax.response.status}).`;
  }
  if (ax?.request) return 'Cannot reach the server. Check your connection — if the app was idle, it may be waking up.';
  return (err as Error)?.message || 'Something went wrong.';
}
