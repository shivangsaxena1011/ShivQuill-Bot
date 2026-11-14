import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getSuggestionsSystemPrompt } from '../prompts.js';
import { completeStructured, MalformedModelResponseError, looseOffset, looseString } from '../structuredCompletion.js';
import { WritingSuggestionsResponse, WritingSuggestion } from '../types.js';
import { config } from '../config.js';
import { splitIntoBatches, mapBatches } from '../batching.js';
import { abortOnClientDisconnect, isAbortError } from '../requestAbort.js';
import { toClientError } from '../httpErrors.js';

export const suggestionsRouter = Router();

const suggestionsSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(1000000, 'Document exceeds maximum size limit'),
  focus: z.enum(['all', 'clarity', 'conciseness', 'vocabulary', 'tone', 'academic']).default('all'),
  model: z.string().optional()
});

const rawSuggestionSchema = z.object({
  id: looseString(50),
  type: z.preprocess(
    v => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.enum(['clarity', 'conciseness', 'vocabulary', 'tone', 'restructuring', 'academic']).catch('clarity')
  ),
  originalText: z.preprocess(v => (v === null || v === undefined ? '' : String(v)), z.string()),
  suggestedText: z.preprocess(v => (v === null || v === undefined ? '' : String(v)), z.string()),
  explanation: looseString(1000),
  start: looseOffset,
  end: looseOffset
});

/** Keeps the usable suggestions and drops malformed ones instead of failing the whole batch. */
const suggestionList = z.array(z.unknown()).transform(items =>
  items.flatMap(item => {
    const r = rawSuggestionSchema.safeParse(item);
    return r.success && r.data.originalText ? [r.data] : [];
  })
);

const rawResponseSchema = z.object({
  suggestions: suggestionList,
  editorialSummary: z.preprocess(v => (typeof v === 'string' ? v : undefined), z.string().optional())
});

type ParsedSuggestionsBatch = z.output<typeof rawResponseSchema>;

/** Locates one batch's parsed suggestions; offsets are relative to `batchText` (0/0 when not locatable). */
function locateSuggestions(batchText: string, parsedData: ParsedSuggestionsBatch): { suggestions: WritingSuggestion[]; editorialSummary?: string } {
  let searchOffset = 0;
  const suggestions: WritingSuggestion[] = [];

  for (const raw of parsedData.suggestions) {
    let start = raw.start;
    let end = raw.end;
    let located = true;

    if (typeof start !== 'number' || typeof end !== 'number' || batchText.slice(start, end) !== raw.originalText) {
      const found = batchText.indexOf(raw.originalText, searchOffset);
      if (found !== -1) {
        start = found;
        end = found + raw.originalText.length;
        searchOffset = end;
      } else {
        const globalFound = batchText.indexOf(raw.originalText);
        if (globalFound !== -1) {
          start = globalFound;
          end = globalFound + raw.originalText.length;
        } else {
          start = 0;
          end = 0;
          located = false;
        }
      }
    } else {
      searchOffset = Math.max(searchOffset, end);
    }

    suggestions.push({
      id: raw.id || '',
      type: raw.type,
      originalText: raw.originalText,
      suggestedText: raw.suggestedText,
      explanation: raw.explanation,
      start,
      end,
      located
    });
  }

  return { suggestions, editorialSummary: parsedData.editorialSummary };
}

suggestionsRouter.post('/', async (req: Request, res: Response) => {
  const signal = abortOnClientDisconnect(res);
  try {
    const { text, focus, model } = suggestionsSchema.parse(req.body);
    const systemPrompt = getSuggestionsSystemPrompt(focus);
    const batched = splitIntoBatches(text, config.maxCharsPerRequest);

    const batchResults = await mapBatches(batched, async batch => {
      const parsed = await completeStructured(rawResponseSchema, systemPrompt, batch.text, model, 0.2, signal);
      return locateSuggestions(batch.text, parsed);
    }, signal);

    const validatedSuggestions: WritingSuggestion[] = [];
    batchResults.forEach((result, bIdx) => {
      const offset = batched.batches[bIdx].start;
      for (const sug of result.suggestions) {
        const found = sug.located !== false;
        validatedSuggestions.push({
          ...sug,
          id: `sug-${validatedSuggestions.length + 1}`,
          start: found ? sug.start + offset : 0,
          end: found ? sug.end + offset : 0
        });
      }
    });

    const summaries = batchResults.map(r => r.editorialSummary?.trim()).filter(Boolean) as string[];

    const stats = {
      totalSuggestions: validatedSuggestions.length,
      clarityCount: validatedSuggestions.filter(s => s.type === 'clarity').length,
      concisenessCount: validatedSuggestions.filter(s => s.type === 'conciseness').length,
      vocabularyCount: validatedSuggestions.filter(s => s.type === 'vocabulary').length,
      toneCount: validatedSuggestions.filter(s => s.type === 'tone').length,
      restructuringCount: validatedSuggestions.filter(s => s.type === 'restructuring').length,
      academicCount: validatedSuggestions.filter(s => s.type === 'academic').length
    };

    const response: WritingSuggestionsResponse = {
      originalText: text,
      suggestions: validatedSuggestions,
      editorialSummary: summaries.length > 0 ? summaries.join(' ') : undefined,
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
      console.warn('[ShivQuill Suggestions] Malformed model response:', error.message);
      return res.status(422).json({
        error: 'Malformed Model Response',
        message: 'The AI model returned an unparseable response that did not strictly conform to the suggestions schema.',
        raw: process.env.NODE_ENV === 'development' ? error.raw.substring(0, 300) : undefined
      });
    }
    console.error('Suggestions error:', error.message || error);
    const e = toClientError(error, 'Failed to generate writing suggestions');
    return res.status(e.status).json({ error: e.message });
  }
});
