import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

export interface ParaphraseParams {
  text: string;
  mode: string;
  synonymStrength: number;
  customInstruction?: string;
}

export interface GrammarParams {
  text: string;
}

export interface HumanizeParams {
  text: string;
  readabilityLevel?: string;
}

export interface SummarizeParams {
  text: string;
  format: 'paragraph' | 'bullet';
  length: 'short' | 'medium' | 'long';
}

export interface TranslateParams {
  text: string;
  sourceLang: string;
  targetLang: string;
}

export interface CitationParams {
  sourceType: string;
  style: string;
  title: string;
  authors: string[];
  year: string;
  publisher?: string;
  url?: string;
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
  chat: (messages: { role: string; content: string }[], documentContext?: string) =>
    api.post('/chat', { messages, documentContext }),
  checkHealth: () => api.get('/health')
};
