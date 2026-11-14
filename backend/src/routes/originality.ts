import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  AiDetectionResponse,
  AiDetectionSentence,
  PlagiarismCheckResponse,
  CitationResponse
} from '../types.js';
import { defaultCorpusManager } from '../corpus.js';

export const originalityRouter = Router();

// ----------------------------------------------------
// 1. AI Detector Endpoint (Experimental Statistical Linguistic Analyzer)
// ----------------------------------------------------
const aiDetectorSchema = z.object({
  text: z.string().min(30, 'Input must be at least 30 characters for statistical evaluation').max(1000000)
});

originalityRouter.post('/detector', (req: Request, res: Response) => {
  try {
    const { text } = aiDetectorSchema.parse(req.body);

    const sentences = text.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 0);
    const words = text.toLowerCase().match(/\b[a-z]{2,}\b/g) || [];
    const totalWords = words.length || 1;

    // 1. Calculate genuine Shannon Entropy (lexical information density)
    const freqMap = new Map<string, number>();
    for (const w of words) {
      freqMap.set(w, (freqMap.get(w) || 0) + 1);
    }
    let entropy = 0;
    for (const count of freqMap.values()) {
      const p = count / totalWords;
      entropy -= p * Math.log2(p);
    }

    // 2. Calculate Burstiness: Coefficient of Variation (CV) of sentence lengths
    const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).filter(Boolean).length);
    const meanLength = sentenceLengths.reduce((a, b) => a + b, 0) / (sentenceLengths.length || 1);
    const variance = sentenceLengths.reduce((a, b) => a + Math.pow(b - meanLength, 2), 0) / (sentenceLengths.length || 1);
    const stdDev = Math.sqrt(variance);
    const cv = meanLength > 0 ? stdDev / meanLength : 0; // CV > 0.4 typically reflects varied human cadence

    // 3. Type-Token Ratio (TTR)
    const ttr = parseFloat((freqMap.size / totalWords).toFixed(3));

    // Transparent sentence-level statistical regularity analysis
    const sentenceScores: AiDetectionSentence[] = sentences.map(sentence => {
      const sWords = sentence.trim().split(/\s+/).filter(Boolean);
      const len = sWords.length;
      
      // Compute sentence regularity indicator:
      // Repetitive mid-length sentences (16-24 words) with low overall burstiness show higher uniformity
      let uniformityIndicator = 35;
      if (len >= 16 && len <= 24) uniformityIndicator += 15;
      if (cv < 0.25) uniformityIndicator += 15;
      if (entropy < 4.0) uniformityIndicator += 10;
      if (cv > 0.5) uniformityIndicator -= 15;

      const boundedScore = Math.min(90, Math.max(10, uniformityIndicator));
      const flag = boundedScore >= 60 ? 'ai' : boundedScore >= 40 ? 'mixed' : 'human';

      return {
        text: sentence,
        aiLikelihood: boundedScore,
        flag
      };
    });

    // Compute composite statistical regularity index (explicitly labeled as a heuristic proxy)
    const avgScore = Math.round(
      sentenceScores.reduce((a, b) => a + b.aiLikelihood, 0) / (sentenceScores.length || 1)
    );
    const humanPct = 100 - avgScore;

    const response: AiDetectionResponse = {
      aiPercentage: avgScore,
      humanPercentage: humanPct,
      confidence: sentences.length >= 4 ? 'Moderate' : 'Low',
      overallVerdict: avgScore >= 65 
        ? 'Likely AI-Generated' 
        : avgScore >= 40 
          ? 'Mixed Signals' 
          : 'Likely Human-Written',
      sentences: sentenceScores,
      metrics: {
        perplexityScore: Math.round(Math.min(100, entropy * 15)),
        burstinessScore: Math.round(Math.min(100, cv * 100)),
        shannonEntropy: parseFloat(entropy.toFixed(3)),
        sentenceLengthCV: parseFloat(cv.toFixed(3)),
        typeTokenRatio: ttr
      },
      experimentalStatus: true,
      analyzerType: 'statistical_heuristic',
      falsePositiveRisk: 'High on structured academic, technical, legal, and non-native English writing where consistent sentence structure and controlled vocabulary are standard.',
      disclaimer: 'EXPERIMENTAL STATISTICAL LINGUISTIC ANALYZER: This tool evaluates statistical surface regularity (Shannon entropy, sentence-length CV, and lexical diversity). It is NOT a validated neural classifier and cannot provide certainty of authorship. Never use this score for disciplinary or academic penalty decisions.'
    };

    return res.json(response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    return res.status(500).json({ error: 'AI detection analysis failed' });
  }
});

// ----------------------------------------------------
// 2. Plagiarism Checker Endpoint (Modular Inverted Index & Shingles)
// ----------------------------------------------------
const plagiarismSchema = z.object({
  text: z.string().min(10, 'Text too short for plagiarism check').max(1000000)
});

originalityRouter.post('/plagiarism', (req: Request, res: Response) => {
  try {
    const { text } = plagiarismSchema.parse(req.body);
    const result = defaultCorpusManager.checkSimilarity(text, 5);

    const response: PlagiarismCheckResponse = {
      similarityScore: result.similarityScore,
      uniquenessScore: result.uniquenessScore,
      totalWordsChecked: result.totalWordsChecked,
      matchedSources: result.matchedSources,
      matchedSegments: result.matchedSegments.map(s => ({
        text: s.text,
        sourceTitle: s.sourceTitle,
        sourceUrl: s.sourceUrl
      })),
      corpusStats: result.corpusStats
    };

    return res.json(response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    return res.status(500).json({ error: 'Plagiarism check failed' });
  }
});

// Corpus Management Endpoints
originalityRouter.get('/corpus', (req: Request, res: Response) => {
  res.json({
    documentCount: defaultCorpusManager.getDocumentCount(),
    totalShingles: defaultCorpusManager.getTotalShinglesCount(),
    documents: defaultCorpusManager.getAllDocuments()
  });
});

const indexDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  authorOrSource: z.string().min(1),
  url: z.string().url(),
  text: z.string().min(20)
});

originalityRouter.post('/corpus', (req: Request, res: Response) => {
  try {
    const doc = indexDocumentSchema.parse(req.body);
    defaultCorpusManager.indexDocument(doc);
    return res.json({
      status: 'indexed',
      documentId: doc.id,
      totalDocuments: defaultCorpusManager.getDocumentCount()
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    return res.status(500).json({ error: 'Failed to index document' });
  }
});

// ----------------------------------------------------
// 3. Citation Generator Endpoint (With Real Metadata Lookup)
// ----------------------------------------------------
const citationSchema = z.object({
  sourceType: z.enum(['website', 'journal', 'book']).default('website'),
  style: z.enum(['APA', 'MLA', 'Chicago', 'Harvard']).default('APA'),
  url: z.string().optional(),
  doi: z.string().optional(),
  title: z.string().optional(),
  authors: z.array(z.string()).optional(),
  year: z.string().optional(),
  publisher: z.string().optional(),
  volume: z.string().optional(),
  issue: z.string().optional(),
  pages: z.string().optional()
});

/**
 * Attempts real DOI metadata resolution via Crossref REST API
 */
async function fetchCrossrefMetadata(doiQuery: string): Promise<any | null> {
  const cleanDoi = doiQuery
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .trim();

  if (!cleanDoi.match(/^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/)) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000); // 4-second timeout

    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`, {
      headers: { 'User-Agent': 'ShivQuill-Academic-Citation-Engine/2.0 (mailto:support@shivquill.local)' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data: any = await res.json();
    return data.message || null;
  } catch {
    return null;
  }
}

originalityRouter.post('/citation', async (req: Request, res: Response) => {
  try {
    const data = citationSchema.parse(req.body);
    let resolvedTitle = data.title || '';
    let resolvedAuthors = data.authors && data.authors.length > 0 ? data.authors : ['Anonymous'];
    let resolvedYear = data.year || new Date().getFullYear().toString();
    let resolvedPublisher = data.publisher || '';
    let isVerified = false;
    let sourceOrigin: 'crossref_doi' | 'user_supplied' = 'user_supplied';
    let retrievedMetadata: any = undefined;

    // Check for DOI resolution
    const targetDoi = data.doi || (data.url?.includes('doi.org/') ? data.url : undefined);
    if (targetDoi) {
      const crossrefMeta = await fetchCrossrefMetadata(targetDoi);
      if (crossrefMeta) {
        isVerified = true;
        sourceOrigin = 'crossref_doi';
        retrievedMetadata = {
          doi: crossrefMeta.DOI,
          containerTitle: crossrefMeta['container-title']?.[0],
          publishedDate: crossrefMeta.created?.['date-time'] || crossrefMeta.issued?.['date-parts']?.[0]?.[0]?.toString(),
          publisher: crossrefMeta.publisher
        };

        if (crossrefMeta.title?.[0]) resolvedTitle = crossrefMeta.title[0];
        if (crossrefMeta.author && Array.isArray(crossrefMeta.author)) {
          resolvedAuthors = crossrefMeta.author.map((a: any) => 
            a.given && a.family ? `${a.given} ${a.family}` : a.family || a.name || 'Anonymous'
          );
        }
        if (crossrefMeta.issued?.['date-parts']?.[0]?.[0]) {
          resolvedYear = crossrefMeta.issued['date-parts'][0][0].toString();
        }
        if (crossrefMeta.publisher) resolvedPublisher = crossrefMeta.publisher;
      }
    }

    if (!resolvedTitle) {
      resolvedTitle = 'Untitled Work';
    }

    const primaryAuthor = resolvedAuthors[0] || 'Anonymous';
    const authorLastName = primaryAuthor.split(' ').pop() || primaryAuthor;

    let inTextCitation = `(${authorLastName}, ${resolvedYear})`;
    let fullBibliographyEntry = '';

    const formattedAuthorsAPA = resolvedAuthors.length > 2 
      ? `${authorLastName}, ${primaryAuthor.charAt(0)}., et al.`
      : resolvedAuthors.map(a => `${a.split(' ').pop()}, ${a.charAt(0)}.`).join(', & ');

    switch (data.style) {
      case 'APA':
        fullBibliographyEntry = `${formattedAuthorsAPA} (${resolvedYear}). *${resolvedTitle}*. ${resolvedPublisher ? resolvedPublisher + '. ' : ''}${data.url || ''}`.trim();
        inTextCitation = resolvedAuthors.length > 2 ? `(${authorLastName} et al., ${resolvedYear})` : `(${authorLastName}, ${resolvedYear})`;
        break;

      case 'MLA':
        fullBibliographyEntry = `${authorLastName}, ${primaryAuthor.split(' ')[0]}. "${resolvedTitle}." *${resolvedPublisher || 'Web Source'}*, ${resolvedYear}, ${data.url || ''}`.trim();
        inTextCitation = `(${authorLastName})`;
        break;

      case 'Chicago':
        fullBibliographyEntry = `${primaryAuthor}. ${resolvedYear}. "${resolvedTitle}." ${resolvedPublisher ? resolvedPublisher + '. ' : ''}${data.url || ''}`.trim();
        inTextCitation = `(${authorLastName} ${resolvedYear})`;
        break;

      case 'Harvard':
        fullBibliographyEntry = `${authorLastName}, ${primaryAuthor.charAt(0)}. (${resolvedYear}) '${resolvedTitle}', ${resolvedPublisher || 'Publication'}. Available at: ${data.url || 'Online'}`.trim();
        inTextCitation = `(${authorLastName}, ${resolvedYear})`;
        break;
    }

    const response: CitationResponse = {
      style: data.style,
      inTextCitation,
      fullBibliographyEntry,
      sourceType: data.sourceType,
      isVerified,
      sourceOrigin,
      retrievedMetadata
    };

    return res.json(response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    return res.status(500).json({ error: 'Citation generation failed' });
  }
});
