import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getHumanizeSystemPrompt } from '../prompts.js';
import { executeLlmCompletion } from '../llm.js';
import { generateDiffSpans } from '../diff.js';
import { HumanizeResponse } from '../types.js';

export const humanizeRouter = Router();

const humanizeSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(1000000, 'Input exceeds maximum payload limit of 1,000,000 characters'),
  readabilityLevel: z.enum(['conversational', 'natural', 'engaging']).default('natural'),
  model: z.string().optional()
});

/**
 * Approximate syllable count for a word
 */
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const matches = w.match(/[aeiouy]{1,2}/g);
  let count = matches ? matches.length : 1;
  if (w.endsWith('e') && !w.endsWith('le')) count = Math.max(1, count - 1);
  return Math.max(1, count);
}

/**
 * Calculates Flesch Reading Ease score
 */
function calculateFleschScore(text: string): number {
  const sentences = text.split(/(?<=[.?!])\s+/).filter(Boolean);
  const words = text.match(/\b[a-zA-Z]+\b/g) || [];
  if (sentences.length === 0 || words.length === 0) return 70;

  const totalSyllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
  const wordsPerSentence = words.length / sentences.length;
  const syllablesPerWord = totalSyllables / words.length;

  const score = 206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord);
  return Math.round(Math.min(100, Math.max(0, score)));
}

humanizeRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { text, readabilityLevel, model } = humanizeSchema.parse(req.body);
    const systemPrompt = getHumanizeSystemPrompt(readabilityLevel);

    const humanizedText = await executeLlmCompletion(systemPrompt, text, model, 0.4);
    const diffSpans = generateDiffSpans(text, humanizedText);

    // Compute sentence length standard deviation as genuine burstiness metric
    const sentences = humanizedText.split(/(?<=[.?!])\s+/).filter(Boolean);
    const lengths = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
    const variance = lengths.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (lengths.length || 1);
    const stdDev = Math.sqrt(variance);

    const burstiness = stdDev > 6 ? 'High' : stdDev > 3 ? 'Natural' : 'Moderate';
    const fleschScore = calculateFleschScore(humanizedText);
    const flowScore = Math.min(98, Math.max(70, Math.round(fleschScore * 0.4 + (stdDev * 5) + 40)));

    const response: HumanizeResponse = {
      originalText: text,
      humanizedText,
      readabilityScore: {
        burstiness,
        flowScore,
        tone: `${readabilityLevel.charAt(0).toUpperCase() + readabilityLevel.slice(1)} Cadence`,
        fleschReadingEase: fleschScore
      },
      diffSpans
    };

    return res.json(response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Humanize error:', error);
    return res.status(500).json({ error: error.message || 'Failed to humanize text' });
  }
});
