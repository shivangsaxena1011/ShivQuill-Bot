import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  AiDetectionResponse,
  AiDetectionSentence,
  PlagiarismCheckResponse,
  CitationResponse
} from '../types.js';
import { checkCorpusSimilarity } from '../corpus.js';

export const originalityRouter = Router();

// ----------------------------------------------------
// 1. AI Detector Endpoint (Calculated Statistical Metrics)
// ----------------------------------------------------
const aiDetectorSchema = z.object({
  text: z.string().min(30, 'Input must be at least 30 characters for statistical evaluation').max(30000)
});

originalityRouter.post('/detector', (req: Request, res: Response) => {
  try {
    const { text } = aiDetectorSchema.parse(req.body);

    const sentences = text.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 0);
    const words = text.toLowerCase().match(/\b[a-z]{2,}\b/g) || [];

    // 1. Shannon Entropy (Perplexity proxy)
    const freqMap = new Map<string, number>();
    for (const w of words) {
      freqMap.set(w, (freqMap.get(w) || 0) + 1);
    }
    let entropy = 0;
    const totalWords = words.length || 1;
    for (const count of freqMap.values()) {
      const p = count / totalWords;
      entropy -= p * Math.log2(p);
    }

    // 2. Burstiness: Coefficient of Variation (CV) of sentence lengths
    const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).filter(Boolean).length);
    const meanLength = sentenceLengths.reduce((a, b) => a + b, 0) / (sentenceLengths.length || 1);
    const variance = sentenceLengths.reduce((a, b) => a + Math.pow(b - meanLength, 2), 0) / (sentenceLengths.length || 1);
    const stdDev = Math.sqrt(variance);
    const cv = meanLength > 0 ? stdDev / meanLength : 0; // CV > 0.4 indicates human burstiness

    // 3. Type-Token Ratio (TTR)
    const ttr = freqMap.size / totalWords;

    // Synthetic heuristics analysis per sentence
    const sentenceScores: AiDetectionSentence[] = sentences.map(sentence => {
      const sWords = sentence.trim().split(/\s+/).filter(Boolean);
      const len = sWords.length;
      
      // Sentences with middle-length uniformity and low lexical variation are assigned higher likelihood
      let score = 30;
      if (len >= 16 && len <= 24) score += 20;
      if (cv < 0.25) score += 15;
      if (entropy < 4.0) score += 15;

      score = Math.min(95, Math.max(5, score));
      const flag = score > 60 ? 'ai' : score > 35 ? 'mixed' : 'human';

      return {
        text: sentence,
        aiLikelihood: score,
        flag
      };
    });

    // Calibrate overall percentage based on calculated metrics
    let computedAiPct = Math.round(
      sentenceScores.reduce((a, b) => a + b.aiLikelihood, 0) / (sentenceScores.length || 1)
    );
    if (cv > 0.5) computedAiPct = Math.max(10, computedAiPct - 20); // reward high burstiness

    const humanPct = 100 - computedAiPct;

    const response: AiDetectionResponse = {
      aiPercentage: computedAiPct,
      humanPercentage: humanPct,
      confidence: sentences.length >= 3 ? 'Moderate' : 'Low',
      overallVerdict: computedAiPct > 65 ? 'Likely AI-Generated' : computedAiPct > 35 ? 'Mixed Signals' : 'Likely Human-Written',
      sentences: sentenceScores,
      metrics: {
        perplexityScore: Math.round(Math.min(100, entropy * 15)),
        burstinessScore: Math.round(Math.min(100, cv * 100))
      },
      disclaimer: 'Statistical Linguistic Assessment: Derived from token entropy and sentence length variation. Heuristic models cannot provide guaranteed certainty of authorship.'
    };

    return res.json(response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    return res.status(500).json({ error: 'AI detection failed' });
  }
});

// ----------------------------------------------------
// 2. Plagiarism Checker Endpoint (Authentic Corpus Comparison)
// ----------------------------------------------------
const plagiarismSchema = z.object({
  text: z.string().min(20, 'Text too short for plagiarism check').max(30000)
});

originalityRouter.post('/plagiarism', (req: Request, res: Response) => {
  try {
    const { text } = plagiarismSchema.parse(req.body);
    const comparisonResult = checkCorpusSimilarity(text, 5);

    const response: PlagiarismCheckResponse = {
      similarityScore: comparisonResult.similarityScore,
      uniquenessScore: comparisonResult.uniquenessScore,
      totalWordsChecked: comparisonResult.totalWordsChecked,
      matchedSources: comparisonResult.matchedSources,
      matchedSegments: comparisonResult.matchedSegments
    };

    return res.json(response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    return res.status(500).json({ error: 'Plagiarism check failed' });
  }
});

// ----------------------------------------------------
// 3. Citation Generator Endpoint
// ----------------------------------------------------
const citationSchema = z.object({
  sourceType: z.enum(['website', 'journal', 'book']).default('website'),
  style: z.enum(['APA', 'MLA', 'Chicago', 'Harvard']).default('APA'),
  url: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  authors: z.array(z.string()).default(['Anonymous']),
  year: z.string().default(new Date().getFullYear().toString()),
  publisher: z.string().optional(),
  volume: z.string().optional(),
  issue: z.string().optional(),
  pages: z.string().optional()
});

originalityRouter.post('/citation', (req: Request, res: Response) => {
  try {
    const data = citationSchema.parse(req.body);
    const primaryAuthor = data.authors[0] || 'Anonymous';
    const authorLastName = primaryAuthor.split(' ').pop() || primaryAuthor;

    let inTextCitation = `(${authorLastName}, ${data.year})`;
    let fullBibliographyEntry = '';

    switch (data.style) {
      case 'APA':
        fullBibliographyEntry = `${primaryAuthor} (${data.year}). *${data.title}*. ${data.publisher ? data.publisher + '. ' : ''}${data.url || ''}`.trim();
        inTextCitation = `(${authorLastName}, ${data.year})`;
        break;
      case 'MLA':
        fullBibliographyEntry = `${authorLastName}, ${primaryAuthor.split(' ')[0]}. "${data.title}." ${data.publisher || 'Web'}, ${data.year}, ${data.url || ''}`.trim();
        inTextCitation = `(${authorLastName})`;
        break;
      case 'Chicago':
        fullBibliographyEntry = `${primaryAuthor}. ${data.year}. "${data.title}." ${data.publisher ? data.publisher + '. ' : ''}${data.url || ''}`.trim();
        inTextCitation = `(${authorLastName} ${data.year})`;
        break;
      case 'Harvard':
        fullBibliographyEntry = `${authorLastName}, ${primaryAuthor.charAt(0)}. (${data.year}) '${data.title}', ${data.publisher || 'Online'}. Available at: ${data.url || 'N/A'}`.trim();
        inTextCitation = `(${authorLastName}, ${data.year})`;
        break;
    }

    const response: CitationResponse = {
      style: data.style,
      inTextCitation,
      fullBibliographyEntry,
      sourceType: data.sourceType
    };

    return res.json(response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    return res.status(500).json({ error: 'Citation generation failed' });
  }
});
