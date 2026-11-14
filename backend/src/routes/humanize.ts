import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getHumanizeSystemPrompt } from '../prompts.js';
import { executeLlmCompletion } from '../llm.js';
import { generateDiffSpans } from '../diff.js';
import { HumanizeResponse } from '../types.js';

export const humanizeRouter = Router();

const humanizeSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(25000, 'Input exceeds maximum character limit of 25,000'),
  readabilityLevel: z.enum(['conversational', 'natural', 'engaging']).default('natural'),
  model: z.string().optional()
});

humanizeRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { text, readabilityLevel, model } = humanizeSchema.parse(req.body);
    const systemPrompt = getHumanizeSystemPrompt() + `\nTarget style: ${readabilityLevel}.`;

    const humanizedText = await executeLlmCompletion(systemPrompt, text, model, 0.4);
    const diffSpans = generateDiffSpans(text, humanizedText);

    // Compute sentence length standard deviation as burstiness metric
    const sentences = humanizedText.split(/(?<=[.?!])\s+/).filter(Boolean);
    const lengths = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
    const variance = lengths.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (lengths.length || 1);
    const stdDev = Math.sqrt(variance);

    const burstiness = stdDev > 6 ? 'High' : stdDev > 3 ? 'Natural' : 'Moderate';
    const flowScore = Math.min(98, Math.max(75, Math.round(85 + stdDev * 2)));

    const response: HumanizeResponse = {
      originalText: text,
      humanizedText,
      readabilityScore: {
        burstiness,
        flowScore,
        tone: `${readabilityLevel.charAt(0).toUpperCase() + readabilityLevel.slice(1)} & Authentic`
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
