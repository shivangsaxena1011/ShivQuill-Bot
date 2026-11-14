import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

export interface ParaphraseParams {
  text: string;
  mode: string;
  synonymStrength: number;
  customInstruction?: string;
  model?: string;
}

export interface GrammarParams {
  text: string;
  model?: string;
}

export interface HumanizeParams {
  text: string;
  readabilityLevel?: string;
  model?: string;
}

export interface SummarizeParams {
  text: string;
  format: 'paragraph' | 'bullet';
  length: 'short' | 'medium' | 'long';
  model?: string;
}

export interface TranslateParams {
  text: string;
  sourceLang: string;
  targetLang: string;
  model?: string;
}

export interface CitationParams {
  sourceType: string;
  style: string;
  title?: string;
  authors?: string[];
  year?: string;
  publisher?: string;
  url?: string;
  doi?: string;
}

export interface SuggestionsParams {
  text: string;
  focus?: 'all' | 'clarity' | 'conciseness' | 'vocabulary' | 'tone' | 'academic';
  model?: string;
}

export const writingApi = {
  paraphrase: (params: ParaphraseParams) => api.post('/paraphrase', params),
  checkGrammar: (params: GrammarParams) => api.post('/grammar', params),
  humanize: (params: HumanizeParams) => api.post('/humanize', params),
  summarize: (params: SummarizeParams) => api.post('/summarize', params),
  translate: (params: TranslateParams) => api.post('/translate', params),
  aiDetector: (text: string) => api.post('/originality/detector', { text }),
  checkPlagiarism: (text: string) => api.post('/originality/plagiarism', { text }),
  generateCitation: (params: CitationParams) => api.post('/originality/citation', params),
  getSuggestions: (params: SuggestionsParams) => api.post('/suggestions', params),
  getCorpusInfo: () => api.get('/originality/corpus'),
  getTaskProgress: (id: string) => api.get(`/tasks/${id}`),
  cancelTask: (id: string) => api.post(`/tasks/${id}/cancel`),
  chat: (messages: { role: string; content: string }[], documentContext?: string, model?: string) =>
    api.post('/chat', { messages, documentContext, model }),
  checkHealth: () => api.get('/health')
};
