import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getTranslateSystemPrompt } from '../prompts.js';
import { executeLlmCompletion } from '../llm.js';
import { TranslateResponse } from '../types.js';
import { detectLanguage } from '../languageDetect.js';
import { config } from '../config.js';
import { splitIntoBatches, joinBatchOutputs, mapBatches } from '../batching.js';
import { abortOnClientDisconnect, isAbortError } from '../requestAbort.js';
import { wantsStream, openSse, finish, fail, SseChannel } from '../sse.js';


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
  // Fixed term translations the model must use (e.g. product names, domain jargon)
  glossary: z.array(z.object({
    source: z.string().trim().min(1).max(100),
    target: z.string().trim().min(1).max(100)
  })).max(100).optional(),
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
  let stream: SseChannel | null = null;
  try {
    const { text, sourceLang, targetLang, model, glossary } = translateSchema.parse(req.body);
    const targetLangCode = targetLang;
    const targetLangName = SUPPORTED_LANGUAGES[targetLangCode];
    const sourceLangName = sourceLang === 'auto' ? undefined : SUPPORTED_LANGUAGES[sourceLang];

    const systemPrompt = getTranslateSystemPrompt(targetLangName, targetLangCode, sourceLangName, glossary);
    if (wantsStream(req)) stream = openSse(res);
    const onToken = stream ? (d: string) => stream!.send('delta', { text: d }) : undefined;

    const batched = splitIntoBatches(text, config.maxCharsPerRequest);
    if (batched.leading) onToken?.(batched.leading);
    const outputs = await mapBatches(
      batched,
      async batch => {
        const out = await executeLlmCompletion(systemPrompt, batch.text, model, 0.2, signal, onToken);
        onToken?.(batch.separator);
        return out;
      },
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

    return finish(res, stream, response);
  } catch (error: any) {
    if (signal.aborted || isAbortError(error)) {
      stream?.end();
      return; // client disconnected; nothing to send
    }
    if (error instanceof z.ZodError) {
      return fail(res, stream, 400, error.errors[0].message);
    }
    console.error('Translate error:', error.message || error);
    return fail(res, stream, 500, error.message || 'Failed to translate text');
  }
});
