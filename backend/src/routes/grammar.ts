import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getGrammarSystemPrompt } from '../prompts.js';
import { executeLlmCompletion } from '../llm.js';
import { GrammarCheckResponse, GrammarIssue } from '../types.js';

export const grammarRouter = Router();

const grammarSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(1000000, 'Input exceeds maximum payload limit of 1,000,000 characters'),
  model: z.string().optional()
});

const issueSchema = z.object({
  id: z.string(),
  category: z.enum(['grammar', 'spelling', 'punctuation', 'style']),
  original: z.string(),
  replacement: z.string(),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  explanation: z.string()
});

const parsedGrammarResponseSchema = z.object({
  correctedText: z.string(),
  issues: z.array(issueSchema)
});

grammarRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { text, model } = grammarSchema.parse(req.body);
    const systemPrompt = getGrammarSystemPrompt();

    const rawResponse = await executeLlmCompletion(systemPrompt, text, model, 0.1);
    
    let parsedData: { correctedText: string; issues: Array<z.infer<typeof issueSchema>> };
    try {
      // Locate the outer JSON structure
      const jsonStart = rawResponse.indexOf('{');
      const jsonEnd = rawResponse.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('No JSON structure found in model completion');
      }

      const jsonStr = rawResponse.substring(jsonStart, jsonEnd + 1);
      const rawJson = JSON.parse(jsonStr);
      parsedData = parsedGrammarResponseSchema.parse(rawJson);
    } catch (parseError: any) {
      console.warn('[ShivQuill Grammar] Malformed model response:', parseError.message);
      return res.status(422).json({
        error: 'Malformed Model Response',
        message: 'The AI model returned an unparseable response that did not strictly conform to the grammar correction schema.',
        raw: process.env.NODE_ENV === 'development' ? rawResponse.substring(0, 300) : undefined
      });
    }

    // Verify and recalibrate exact character offsets against original input
    let searchOffset = 0;
    const validatedIssues: GrammarIssue[] = [];

    for (const rawIssue of parsedData.issues) {
      let start = rawIssue.start;
      let end = rawIssue.end;

      // If offsets are missing or mismatch the text, recalibrate using string search
      if (typeof start !== 'number' || typeof end !== 'number' || text.slice(start, end) !== rawIssue.original) {
        const foundIndex = text.indexOf(rawIssue.original, searchOffset);
        if (foundIndex !== -1) {
          start = foundIndex;
          end = foundIndex + rawIssue.original.length;
          searchOffset = end;
        } else {
          // Try search from beginning if not found past searchOffset
          const globalIndex = text.indexOf(rawIssue.original);
          if (globalIndex !== -1) {
            start = globalIndex;
            end = globalIndex + rawIssue.original.length;
          } else {
            start = 0;
            end = 0;
          }
        }
      }

      validatedIssues.push({
        id: rawIssue.id || `err-${validatedIssues.length + 1}`,
        category: rawIssue.category,
        original: rawIssue.original,
        replacement: rawIssue.replacement,
        start,
        end,
        explanation: rawIssue.explanation
      });
    }

    const stats = {
      totalIssues: validatedIssues.length,
      grammarCount: validatedIssues.filter(i => i.category === 'grammar').length,
      spellingCount: validatedIssues.filter(i => i.category === 'spelling').length,
      punctuationCount: validatedIssues.filter(i => i.category === 'punctuation').length,
      styleCount: validatedIssues.filter(i => i.category === 'style').length
    };

    const response: GrammarCheckResponse = {
      originalText: text,
      correctedText: parsedData.correctedText || text,
      issues: validatedIssues,
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
