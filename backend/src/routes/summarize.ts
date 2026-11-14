import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getSummarizeSystemPrompt } from '../prompts.js';
import { executeLlmCompletion } from '../llm.js';
import { SummarizeResponse } from '../types.js';

export const summarizeRouter = Router();

const summarizeSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(1000000, 'Input exceeds maximum payload limit of 1,000,000 characters'),
  format: z.enum(['paragraph', 'bullet']).default('paragraph'),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
  model: z.string().optional()
});

summarizeRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { text, format, length, model } = summarizeSchema.parse(req.body);
    const systemPrompt = getSummarizeSystemPrompt(format, length);

    const summary = await executeLlmCompletion(systemPrompt, text, model, 0.2);

    const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
    const origWords = countWords(text);
    const sumWords = countWords(summary);
    const reductionRatio = origWords > 0 ? parseFloat(Math.max(0, (origWords - sumWords) / origWords).toFixed(2)) : 0;

    let keyPoints: string[] | undefined;
    if (format === 'bullet') {
      keyPoints = summary
        .split('\n')
        .map(line => line.replace(/^[-•*]\s*/, '').trim())
        .filter(line => line.length > 0);
    }

    const response: SummarizeResponse = {
      originalText: text,
      summary,
      format,
      length,
      reductionRatio,
      keyPoints
    };

    return res.json(response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Summarize error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate summary' });
  }
});
