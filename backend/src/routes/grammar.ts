import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getGrammarSystemPrompt } from '../prompts.js';
import { executeLlmCompletion } from '../llm.js';
import { GrammarCheckResponse, GrammarIssue } from '../types.js';
import { config } from '../config.js';
import { splitIntoBatches, joinBatchOutputs, mapBatches } from '../batching.js';
import { abortOnClientDisconnect, isAbortError } from '../requestAbort.js';

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

class MalformedModelResponseError extends Error {
  constructor(public raw: string, message: string) {
    super(message);
    this.name = 'MalformedModelResponseError';
  }
}

/**
 * Parses one batch's model output and recalibrates issue offsets against that batch's text.
 * Returned offsets are relative to `batchText`.
 */
function parseGrammarBatch(batchText: string, rawResponse: string): { correctedText: string; issues: GrammarIssue[] } {
  let parsedData: { correctedText: string; issues: Array<z.infer<typeof issueSchema>> };
  try {
    const jsonStart = rawResponse.indexOf('{');
    const jsonEnd = rawResponse.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('No JSON structure found in model completion');
    }
    parsedData = parsedGrammarResponseSchema.parse(JSON.parse(rawResponse.substring(jsonStart, jsonEnd + 1)));
  } catch (parseError: any) {
    throw new MalformedModelResponseError(rawResponse, parseError.message);
  }

  let searchOffset = 0;
  const issues: GrammarIssue[] = [];

  for (const rawIssue of parsedData.issues) {
    let start = rawIssue.start;
    let end = rawIssue.end;
    let located = true;

    if (typeof start !== 'number' || typeof end !== 'number' || batchText.slice(start, end) !== rawIssue.original) {
      const foundIndex = batchText.indexOf(rawIssue.original, searchOffset);
      if (foundIndex !== -1) {
        start = foundIndex;
        end = foundIndex + rawIssue.original.length;
        searchOffset = end;
      } else {
        const globalIndex = batchText.indexOf(rawIssue.original);
        if (globalIndex !== -1) {
          start = globalIndex;
          end = globalIndex + rawIssue.original.length;
        } else {
          start = 0;
          end = 0;
          located = false;
        }
      }
    } else {
      searchOffset = Math.max(searchOffset, end);
    }

    issues.push({
      id: rawIssue.id,
      category: rawIssue.category,
      original: rawIssue.original,
      replacement: rawIssue.replacement,
      start,
      end,
      explanation: rawIssue.explanation,
      located
    });
  }

  return { correctedText: parsedData.correctedText || batchText, issues };
}

grammarRouter.post('/', async (req: Request, res: Response) => {
  const signal = abortOnClientDisconnect(res);
  try {
    const { text, model } = grammarSchema.parse(req.body);
    const systemPrompt = getGrammarSystemPrompt();
    const batched = splitIntoBatches(text, config.maxCharsPerRequest);

    const batchResults = await mapBatches(batched, async batch => {
      const rawResponse = await executeLlmCompletion(systemPrompt, batch.text, model, 0.1, signal);
      return parseGrammarBatch(batch.text, rawResponse);
    }, signal);

    // Shift batch-relative offsets to document offsets and assign unique IDs
    const validatedIssues: GrammarIssue[] = [];
    batchResults.forEach((result, bIdx) => {
      const offset = batched.batches[bIdx].start;
      for (const issue of result.issues) {
        const found = issue.located !== false;
        validatedIssues.push({
          ...issue,
          id: `err-${validatedIssues.length + 1}`,
          start: found ? issue.start + offset : 0,
          end: found ? issue.end + offset : 0
        });
      }
    });

    const stats = {
      totalIssues: validatedIssues.length,
      grammarCount: validatedIssues.filter(i => i.category === 'grammar').length,
      spellingCount: validatedIssues.filter(i => i.category === 'spelling').length,
      punctuationCount: validatedIssues.filter(i => i.category === 'punctuation').length,
      styleCount: validatedIssues.filter(i => i.category === 'style').length
    };

    const response: GrammarCheckResponse = {
      originalText: text,
      correctedText: joinBatchOutputs(batched, batchResults.map(r => r.correctedText)),
      issues: validatedIssues,
      stats
    };

    return res.json(response);
  } catch (error: any) {
    if (signal.aborted || isAbortError(error)) {
      return; // client disconnected; nothing to send
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    if (error instanceof MalformedModelResponseError) {
      console.warn('[ShivQuill Grammar] Malformed model response:', error.message);
      return res.status(422).json({
        error: 'Malformed Model Response',
        message: 'The AI model returned an unparseable response that did not strictly conform to the grammar correction schema.',
        raw: process.env.NODE_ENV === 'development' ? error.raw.substring(0, 300) : undefined
      });
    }
    console.error('Grammar check error:', error);
    return res.status(500).json({ error: error.message || 'Failed to process grammar check request' });
  }
});
