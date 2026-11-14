/**
 * Local Reference Corpus & N-Gram Shingle Comparison Engine
 * Provides genuine document comparison without fabricated matches.
 */

export interface CorpusDocument {
  id: string;
  title: string;
  sourceUrl: string;
  domain: string;
  text: string;
}

export interface PlagiarismMatchResult {
  similarityScore: number;
  uniquenessScore: number;
  totalWordsChecked: number;
  matchedSources: {
    url: string;
    title: string;
    domain: string;
    matchedPercent: number;
    matchedText: string;
  }[];
  matchedSegments: {
    text: string;
    sourceUrl?: string;
  }[];
  corpusSize: number;
}

// Synthetic reference documents stored locally for legitimate similarity comparison
export const REFERENCE_CORPUS: CorpusDocument[] = [
  {
    id: 'doc-ai-intro',
    title: 'Synthetic Guide to Computational Intelligence',
    sourceUrl: 'https://example.org/docs/computational-intelligence',
    domain: 'example.org',
    text: 'Computational intelligence systems employ algorithmic reasoning, statistical pattern recognition, and neural representations to analyze complex data streams across heterogeneous domains.'
  },
  {
    id: 'doc-distributed-sys',
    title: 'Distributed Architecture Best Practices',
    sourceUrl: 'https://example.org/docs/distributed-architecture',
    domain: 'example.org',
    text: 'Modern microservice architectures rely on horizontal pod scaling, distributed consensus algorithms, and event streaming pipelines to maintain resilient operations under heavy load.'
  },
  {
    id: 'doc-renewable-energy',
    title: 'Municipal Energy Infrastructure Overview',
    sourceUrl: 'https://example.org/docs/energy-infrastructure',
    domain: 'example.org',
    text: 'Grid-scale battery storage installations and photovoltaic generation reduce peak transmission vulnerability while providing long-term operational efficiency for municipal utility networks.'
  }
];

/**
 * Tokenize text into lower-case word tokens
 */
function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Generate k-gram shingles from word tokens
 */
function generateShingles(tokens: string[], k = 5): Set<string> {
  const shingles = new Set<string>();
  if (tokens.length < k) {
    if (tokens.length > 0) {
      shingles.add(tokens.join(' '));
    }
    return shingles;
  }
  for (let i = 0; i <= tokens.length - k; i++) {
    shingles.add(tokens.slice(i, i + k).join(' '));
  }
  return shingles;
}

/**
 * Compare input text against the indexed local corpus using genuine shingle overlap
 */
export function checkCorpusSimilarity(inputText: string, k = 5): PlagiarismMatchResult {
  const inputTokens = tokenizeWords(inputText);
  const inputShingles = generateShingles(inputTokens, k);
  const wordsChecked = inputTokens.length;

  if (inputShingles.size === 0 || wordsChecked === 0) {
    return {
      similarityScore: 0,
      uniquenessScore: 100,
      totalWordsChecked: wordsChecked,
      matchedSources: [],
      matchedSegments: [],
      corpusSize: REFERENCE_CORPUS.length
    };
  }

  const matchedSources: PlagiarismMatchResult['matchedSources'] = [];
  const matchedSegments: PlagiarismMatchResult['matchedSegments'] = [];
  let totalMatchingShingles = 0;

  for (const doc of REFERENCE_CORPUS) {
    const docTokens = tokenizeWords(doc.text);
    const docShingles = generateShingles(docTokens, k);

    let docMatchCount = 0;
    for (const shingle of inputShingles) {
      if (docShingles.has(shingle)) {
        docMatchCount++;
        totalMatchingShingles++;
      }
    }

    if (docMatchCount > 0) {
      const matchPct = Math.min(100, Math.round((docMatchCount / inputShingles.size) * 100));
      matchedSources.push({
        url: doc.sourceUrl,
        title: doc.title,
        domain: doc.domain,
        matchedPercent: matchPct,
        matchedText: doc.text.substring(0, 160) + '...'
      });

      matchedSegments.push({
        text: doc.text.substring(0, 120),
        sourceUrl: doc.sourceUrl
      });
    }
  }

  const overallSimilarity = Math.min(100, Math.round((totalMatchingShingles / inputShingles.size) * 100));

  return {
    similarityScore: overallSimilarity,
    uniquenessScore: Math.max(0, 100 - overallSimilarity),
    totalWordsChecked: wordsChecked,
    matchedSources,
    matchedSegments,
    corpusSize: REFERENCE_CORPUS.length
  };
}
