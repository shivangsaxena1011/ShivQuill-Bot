import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getGrammarSystemPrompt } from '../prompts.js';
import { executeLlmCompletion } from '../llm.js';
import { GrammarCheckResponse, GrammarIssue } from '../types.js';

export const grammarRouter = Router();

const grammarSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(25000, 'Input exceeds maximum character limit of 25,000'),
  model: z.string().optional()
});

grammarRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { text, model } = grammarSchema.parse(req.body);
    const systemPrompt = getGrammarSystemPrompt();

    const rawResponse = await executeLlmCompletion(systemPrompt, text, model, 0.1);
    
    let parsedData: { correctedText: string; issues: GrammarIssue[] };
    try {
      // Find JSON block if wrapped
      const jsonStart = rawResponse.indexOf('{');
      const jsonEnd = rawResponse.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        parsedData = JSON.parse(rawResponse.substring(jsonStart, jsonEnd + 1));
      } else {
        throw new Error('No JSON structure found');
      }
    } catch (parseError) {
      // Fallback if model returned plain corrected text
      parsedData = {
        correctedText: rawResponse.trim(),
        issues: []
      };
    }

    const issues = parsedData.issues || [];
    const stats = {
      totalIssues: issues.length,
      grammarCount: issues.filter(i => i.category === 'grammar').length,
      spellingCount: issues.filter(i => i.category === 'spelling').length,
      punctuationCount: issues.filter(i => i.category === 'punctuation').length,
      styleCount: issues.filter(i => i.category === 'style').length
    };

    const response: GrammarCheckResponse = {
      originalText: text,
      correctedText: parsedData.correctedText || text,
      issues,
      stats
    };

    return res.json(response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Grammar check error:', error);
    return res.status(500).json({ error: error.message || 'Failed to process grammar check request' });
  }
});
