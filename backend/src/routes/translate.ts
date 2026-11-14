import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getTranslateSystemPrompt } from '../prompts.js';
import { executeLlmCompletion } from '../llm.js';
import { TranslateResponse } from '../types.js';

export const translateRouter = Router();

const translateSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(25000, 'Input exceeds maximum character limit of 25,000'),
  sourceLang: z.string().default('auto'),
  targetLang: z.string().default('es'),
  model: z.string().optional()
});

translateRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { text, sourceLang, targetLang, model } = translateSchema.parse(req.body);
    const systemPrompt = getTranslateSystemPrompt(targetLang);

    const translatedText = await executeLlmCompletion(systemPrompt, text, model, 0.2);

    // Basic heuristic language identifier if 'auto' was passed
    let detectedSourceLang = sourceLang;
    if (sourceLang === 'auto') {
      detectedSourceLang = detectLanguageHeuristic(text);
    }

    const response: TranslateResponse = {
      originalText: text,
      translatedText,
      detectedSourceLang,
      targetLang
    };

    return res.json(response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Translate error:', error);
    return res.status(500).json({ error: error.message || 'Failed to translate text' });
  }
});

function detectLanguageHeuristic(text: string): string {
  if (/[\u0600-\u06FF]/.test(text)) return 'Arabic (ar)';
  if (/[\u0900-\u097F]/.test(text)) return 'Hindi (hi)';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'Chinese (zh)';
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'Japanese (ja)';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'Korean (ko)';
  if (/[\u0400-\u04FF]/.test(text)) return 'Russian (ru)';
  if (/\b(le|la|les|un|une|des|et|en|est|dans)\b/i.test(text)) return 'French (fr)';
  if (/\b(el|la|los|las|un|una|por|para|con|de)\b/i.test(text)) return 'Spanish (es)';
  if (/\b(der|die|das|und|in|den|von|zu|mit)\b/i.test(text)) return 'German (de)';
  return 'English (en)';
}
