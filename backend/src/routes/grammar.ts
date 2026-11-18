import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getGrammarSystemPrompt } from '../prompts.js';
import { completeStructured, MalformedModelResponseError, looseOffset, looseString } from '../structuredCompletion.js';
import { GrammarCheckResponse, GrammarIssue } from '../types.js';
import { config } from '../config.js';
import { splitIntoBatches, joinBatchOutputs, mapBatches } from '../batching.js';
import { abortOnClientDisconnect, isAbortError } from '../requestAbort.js';
import { toClientError } from '../httpErrors.js';

export const grammarRouter = Router();

const grammarSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(1000000, 'Input exceeds maximum payload limit of 1,000,000 characters'),
  model: z.string().optional()
});

const issueSchema = z.object({
  id: looseString(50),
  category: z.preprocess(
    v => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.enum(['grammar', 'spelling', 'punctuation', 'style']).catch('grammar')
  ),
  original: z.preprocess(v => (v === null || v === undefined ? '' : String(v)), z.string()),
  replacement: z.preprocess(v => (v === null || v === undefined ? '' : String(v)), z.string()),
  start: looseOffset,
  end: looseOffset,
  explanation: looseString(1000)
});

/** Keeps the usable issues and drops malformed ones instead of failing the whole batch. */
const issueList = z.preprocess(v => (Array.isArray(v) ? v : []), z.array(z.unknown())).transform(items =>
  items.flatMap(item => {
    const r = issueSchema.safeParse(item);
    return r.success && r.data.original ? [r.data] : [];
  })
);

const parsedGrammarResponseSchema = z.object({
  // Models often omit or null these on clean text ({"issues": []}); treat that as "no changes"
  correctedText: z.preprocess(v => (typeof v === 'string' ? v : ''), z.string()),
  issues: issueList
});

type ParsedGrammarBatch = z.output<typeof parsedGrammarResponseSchema>;

/**
 * Recalibrates one batch's parsed issues against that batch's text.
 * Returned offsets are relative to `batchText`.
 */
function locateGrammarIssues(batchText: string, parsedData: ParsedGrammarBatch): { correctedText: string; issues: GrammarIssue[] } {
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
      const parsed = await completeStructured(parsedGrammarResponseSchema, systemPrompt, batch.text, model, 0.1, signal);
      return locateGrammarIssues(batch.text, parsed);
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
    const e = toClientError(error, 'Failed to process grammar check request');
    return res.status(e.status).json({ error: e.message });
  }
});
