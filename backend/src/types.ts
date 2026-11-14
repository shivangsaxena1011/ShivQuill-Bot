export type ParaphraseMode = 
  | 'standard' 
  | 'fluency' 
  | 'formal' 
  | 'academic' 
  | 'simple' 
  | 'creative' 
  | 'expand' 
  | 'shorten' 
  | 'custom';

export type SynonymStrength = 1 | 2 | 3 | 4;

export interface ParaphraseRequest {
  text: string;
  mode: ParaphraseMode;
  synonymStrength?: SynonymStrength;
  customInstruction?: string;
  model?: string;
}

export interface DiffSpan {
  value: string;
  type: 'unchanged' | 'synonym' | 'restructured' | 'added' | 'removed';
  original?: string;
  alternatives?: string[];
}

export interface SemanticConsistencyReport {
  checkedEntities: string[];
  preservedCount: number;
  totalCount: number;
  preservationRate: number; // 0 - 100
  notes: string;
}

export interface ParaphraseResponse {
  originalText: string;
  paraphrasedText: string;
  mode: ParaphraseMode;
  synonymStrength: SynonymStrength;
  diffSpans: DiffSpan[];
  wordCountOriginal: number;
  wordCountAltered: number;
  semanticConsistency?: SemanticConsistencyReport;
}

export interface GrammarIssue {
  id: string;
  category: 'grammar' | 'spelling' | 'punctuation' | 'style';
  original: string;
  replacement: string;
  start: number;
  end: number;
  explanation: string;
}

export interface GrammarCheckResponse {
  originalText: string;
  correctedText: string;
  issues: GrammarIssue[];
  stats: {
    totalIssues: number;
    grammarCount: number;
    spellingCount: number;
    punctuationCount: number;
    styleCount: number;
  };
}

export interface HumanizeRequest {
  text: string;
  readabilityLevel?: 'conversational' | 'natural' | 'engaging';
  model?: string;
}

export interface HumanizeResponse {
  originalText: string;
  humanizedText: string;
  readabilityScore: {
    burstiness: 'High' | 'Natural' | 'Moderate';
    flowScore: number; // 0 - 100
    tone: string;
    fleschReadingEase?: number;
  };
  diffSpans: DiffSpan[];
}

export interface SummarizeRequest {
  text: string;
  format: 'paragraph' | 'bullet';
  length: 'short' | 'medium' | 'long';
  model?: string;
}

export interface SummarizeResponse {
  originalText: string;
  summary: string;
  format: 'paragraph' | 'bullet';
  length: 'short' | 'medium' | 'long';
  reductionRatio: number; // e.g. 0.65 (65% reduction)
  keyPoints?: string[];
}

export interface TranslateRequest {
  text: string;
  sourceLang: string; // 'auto' or code like 'en', 'es', 'fr'
  targetLang: string; // 'es', 'fr', 'de', etc.
  model?: string;
}

export interface TranslateResponse {
  originalText: string;
  translatedText: string;
  detectedSourceLang: string;
  targetLang: string;
}

export interface AiDetectionSentence {
  text: string;
  aiLikelihood: number; // 0 - 100
  flag: 'human' | 'mixed' | 'ai';
}

export interface AiDetectionResponse {
  aiPercentage: number;
  humanPercentage: number;
  confidence: 'High' | 'Moderate' | 'Low';
  overallVerdict: 'Likely Human-Written' | 'Mixed Signals' | 'Likely AI-Generated';
  sentences: AiDetectionSentence[];
  metrics: {
    perplexityScore: number;
    burstinessScore: number;
    shannonEntropy: number;
    sentenceLengthCV: number;
    typeTokenRatio: number;
  };
  experimentalStatus: boolean;
  analyzerType: 'statistical_heuristic';
  falsePositiveRisk: string;
  disclaimer: string;
}

export interface PlagiarismSourceMatch {
  id: string;
  url: string;
  title: string;
  authorOrSource: string;
  matchedPercent: number;
  matchedText: string;
}

export interface PlagiarismCheckResponse {
  similarityScore: number;
  uniquenessScore: number;
  totalWordsChecked: number;
  matchedSources: PlagiarismSourceMatch[];
  matchedSegments: {
    text: string;
    sourceTitle?: string;
    sourceUrl?: string;
  }[];
  corpusStats: {
    indexedDocuments: number;
    totalCorpusShingles: number;
    searchedScope: string;
    note: string;
  };
}

export interface CitationRequest {
  sourceType: 'website' | 'journal' | 'book';
  style: 'APA' | 'MLA' | 'Chicago' | 'Harvard';
  url?: string;
  doi?: string;
  title?: string;
  authors?: string[];
  year?: string;
  publisher?: string;
  volume?: string;
  issue?: string;
  pages?: string;
}

export interface CitationResponse {
  style: 'APA' | 'MLA' | 'Chicago' | 'Harvard';
  inTextCitation: string;
  fullBibliographyEntry: string;
  sourceType: string;
  isVerified: boolean;
  sourceOrigin: 'crossref_doi' | 'user_supplied';
  retrievedMetadata?: {
    doi?: string;
    containerTitle?: string;
    publishedDate?: string;
    publisher?: string;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  documentContext?: string;
  model?: string;
}

export interface TaskStatus<T = any> {
  id: string;
  done: boolean;
  error?: string;
  result?: T;
  createdAt: number;
}

export interface WritingSuggestion {
  id: string;
  type: 'clarity' | 'conciseness' | 'vocabulary' | 'tone' | 'restructuring' | 'academic';
  originalText: string;
  suggestedText: string;
  explanation: string;
  start: number;
  end: number;
}

export interface WritingSuggestionsResponse {
  originalText: string;
  suggestions: WritingSuggestion[];
  editorialSummary?: string;
  stats: {
    totalSuggestions: number;
    clarityCount: number;
    concisenessCount: number;
    vocabularyCount: number;
    toneCount: number;
    restructuringCount: number;
  };
}

