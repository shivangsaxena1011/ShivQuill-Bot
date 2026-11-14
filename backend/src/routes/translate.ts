import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getTranslateSystemPrompt } from '../prompts.js';
import { executeLlmCompletion } from '../llm.js';
import { TranslateResponse } from '../types.js';
import { detectLanguage } from '../languageDetect.js';
import { config } from '../config.js';
import { splitIntoBatches, joinBatchOutputs, mapBatches } from '../batching.js';
import { abortOnClientDisconnect, isAbortError } from '../requestAbort.js';

export const translateRouter = Router();

const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  zh: 'Chinese (Simplified)',
  hi: 'Hindi',
  ja: 'Japanese',
  ar: 'Arabic',
  ru: 'Russian',
  pt: 'Portuguese',
  it: 'Italian',
  ko: 'Korean',
  nl: 'Dutch',
  tr: 'Turkish',
  pl: 'Polish',
  sv: 'Swedish',
  vi: 'Vietnamese',
  id: 'Indonesian',
  uk: 'Ukrainian',
  el: 'Greek',
  cs: 'Czech',
  da: 'Danish',
  fi: 'Finnish',
  he: 'Hebrew',
  th: 'Thai',
  ro: 'Romanian',
  hu: 'Hungarian',
  no: 'Norwegian',
  fa: 'Persian',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  ur: 'Urdu',
  mr: 'Marathi',
  pa: 'Punjabi',
  gu: 'Gujarati'
};

const languageCode = z
  .string()
  .transform(v => v.trim().toLowerCase())
  .refine(v => Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, v), { message: 'Unsupported language code' });

const translateSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(1000000, 'Input exceeds maximum payload limit of 1,000,000 characters'),
  sourceLang: z.union([z.literal('auto'), languageCode]).default('auto'),
  targetLang: languageCode.default('es'),
  model: z.string().optional()
});

// Lets the UI show exactly the languages the server supports
translateRouter.get('/languages', (_req: Request, res: Response) => {
  res.json({
    languages: Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({ code, name }))
  });
});

translateRouter.post('/', async (req: Request, res: Response) => {
  const signal = abortOnClientDisconnect(res);
  try {
    const { text, sourceLang, targetLang, model } = translateSchema.parse(req.body);
    const targetLangCode = targetLang;
    const targetLangName = SUPPORTED_LANGUAGES[targetLangCode];
    const sourceLangName = sourceLang === 'auto' ? undefined : SUPPORTED_LANGUAGES[sourceLang];

    const systemPrompt = getTranslateSystemPrompt(targetLangName, targetLangCode, sourceLangName);
    const batched = splitIntoBatches(text, config.maxCharsPerRequest);
    const outputs = await mapBatches(
      batched,
      batch => executeLlmCompletion(systemPrompt, batch.text, model, 0.2, signal),
      signal
    );
    const translatedText = joinBatchOutputs(batched, outputs);

    const detectedSourceLang = sourceLang === 'auto'
      ? detectLanguage(text)
      : `${SUPPORTED_LANGUAGES[sourceLang]} (${sourceLang})`;

    const response: TranslateResponse = {
      originalText: text,
      translatedText,
      detectedSourceLang,
      targetLang: targetLangCode
    };

    return res.json(response);
  } catch (error: any) {
    if (signal.aborted || isAbortError(error)) {
      return; // client disconnected; nothing to send
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Translate error:', error);
    return res.status(500).json({ error: error.message || 'Failed to translate text' });
  }
});
