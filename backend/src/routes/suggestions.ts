import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getSuggestionsSystemPrompt } from '../prompts.js';
import { executeLlmCompletion } from '../llm.js';
import { WritingSuggestionsResponse, WritingSuggestion } from '../types.js';

export const suggestionsRouter = Router();

const suggestionsSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(1000000, 'Document exceeds maximum size limit'),
  focus: z.enum(['all', 'clarity', 'conciseness', 'vocabulary', 'tone', 'academic']).default('all'),
  model: z.string().optional()
});

const rawSuggestionSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['clarity', 'conciseness', 'vocabulary', 'tone', 'restructuring', 'academic']).default('clarity'),
  originalText: z.string(),
  suggestedText: z.string(),
  explanation: z.string(),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional()
});

const rawResponseSchema = z.object({
  suggestions: z.array(rawSuggestionSchema),
  editorialSummary: z.string().optional()
});

suggestionsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { text, focus, model } = suggestionsSchema.parse(req.body);
    const systemPrompt = getSuggestionsSystemPrompt(focus);

    const rawResponse = await executeLlmCompletion(systemPrompt, text, model, 0.2);

    let parsedData: { suggestions: Array<z.infer<typeof rawSuggestionSchema>>; editorialSummary?: string };
    try {
      const jsonStart = rawResponse.indexOf('{');
      const jsonEnd = rawResponse.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('No JSON object found in model output');
      }

      const jsonStr = rawResponse.substring(jsonStart, jsonEnd + 1);
      const rawJson = JSON.parse(jsonStr);
      parsedData = rawResponseSchema.parse(rawJson);
    } catch (parseError: any) {
      console.warn('[ShivQuill Suggestions] Malformed model response:', parseError.message);
      return res.status(422).json({
        error: 'Malformed Model Response',
        message: 'The AI model returned an unparseable response that did not strictly conform to the suggestions schema.',
        raw: process.env.NODE_ENV === 'development' ? rawResponse.substring(0, 300) : undefined
      });
    }

    // Recalibrate character offsets for precision linking
    let searchOffset = 0;
    const validatedSuggestions: WritingSuggestion[] = [];

    for (let idx = 0; idx < parsedData.suggestions.length; idx++) {
      const raw = parsedData.suggestions[idx];
      let start = raw.start;
      let end = raw.end;

      if (typeof start !== 'number' || typeof end !== 'number' || text.slice(start, end) !== raw.originalText) {
        const found = text.indexOf(raw.originalText, searchOffset);
        if (found !== -1) {
          start = found;
          end = found + raw.originalText.length;
          searchOffset = end;
        } else {
          const globalFound = text.indexOf(raw.originalText);
          if (globalFound !== -1) {
            start = globalFound;
            end = globalFound + raw.originalText.length;
          } else {
            start = 0;
            end = 0;
          }
        }
      }

      validatedSuggestions.push({
        id: raw.id || `sug-${idx + 1}`,
        type: raw.type,
        originalText: raw.originalText,
        suggestedText: raw.suggestedText,
        explanation: raw.explanation,
        start,
        end
      });
    }

    const stats = {
      totalSuggestions: validatedSuggestions.length,
      clarityCount: validatedSuggestions.filter(s => s.type === 'clarity').length,
      concisenessCount: validatedSuggestions.filter(s => s.type === 'conciseness').length,
      vocabularyCount: validatedSuggestions.filter(s => s.type === 'vocabulary').length,
      toneCount: validatedSuggestions.filter(s => s.type === 'tone').length,
      restructuringCount: validatedSuggestions.filter(s => s.type === 'restructuring').length
    };

    const response: WritingSuggestionsResponse = {
      originalText: text,
      suggestions: validatedSuggestions,
      editorialSummary: parsedData.editorialSummary,
      stats
    };

    return res.json(response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Suggestions error:', error.message || error);
    return res.status(500).json({ error: error.message || 'Failed to generate writing suggestions' });
  }
});
