import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getTranslateSystemPrompt } from '../prompts.js';
import { executeLlmCompletion } from '../llm.js';
import { TranslateResponse } from '../types.js';

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

const translateSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(1000000, 'Input exceeds maximum payload limit of 1,000,000 characters'),
  sourceLang: z.string().default('auto'),
  targetLang: z.string().default('es'),
  model: z.string().optional()
});

translateRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { text, sourceLang, targetLang, model } = translateSchema.parse(req.body);
    const targetLangCode = targetLang.toLowerCase();
    const targetLangName = SUPPORTED_LANGUAGES[targetLangCode] || targetLang;

    const systemPrompt = getTranslateSystemPrompt(targetLangName, targetLangCode);
    const translatedText = await executeLlmCompletion(systemPrompt, text, model, 0.2);

    let detectedSourceLang = sourceLang;
    if (sourceLang === 'auto') {
      detectedSourceLang = detectLanguage(text);
    }

    const response: TranslateResponse = {
      originalText: text,
      translatedText,
      detectedSourceLang,
      targetLang: targetLangCode
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

function detectLanguage(text: string): string {
  if (/[\u0600-\u06FF]/.test(text)) return 'Arabic (ar)';
  if (/[\u0900-\u097F]/.test(text)) return 'Hindi (hi)';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'Chinese (zh)';
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'Japanese (ja)';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'Korean (ko)';
  if (/[\u0400-\u04FF]/.test(text)) return 'Russian (ru)';
  if (/[\u0590-\u05FF]/.test(text)) return 'Hebrew (he)';
  if (/[\u0E00-\u0E7F]/.test(text)) return 'Thai (th)';
  if (/[\u0980-\u09FF]/.test(text)) return 'Bengali (bn)';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'Tamil (ta)';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'Telugu (te)';
  if (/\b(le|la|les|un|une|des|et|en|est|dans|avec|pour)\b/i.test(text)) return 'French (fr)';
  if (/\b(el|la|los|las|un|una|por|para|con|de|en|es)\b/i.test(text)) return 'Spanish (es)';
  if (/\b(der|die|das|und|in|den|von|zu|mit|ist)\b/i.test(text)) return 'German (de)';
  if (/\b(il|la|lo|i|gli|le|un|uno|una|di|a|da|in|con|su|per|tra|fra)\b/i.test(text)) return 'Italian (it)';
  if (/\b(o|a|os|as|um|uma|de|em|para|com|por|que|não)\b/i.test(text)) return 'Portuguese (pt)';
  if (/\b(de|het|een|en|in|van|op|met|voor|is)\b/i.test(text)) return 'Dutch (nl)';
  return 'English (en)';
}
