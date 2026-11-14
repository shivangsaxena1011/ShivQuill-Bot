import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { splitIntoParagraphs, splitIntoSentences, chunkSentences } from '../segmenter.js';
import { getParaphraseSystemPrompt } from '../prompts.js';
import { executeLlmCompletion } from '../llm.js';
import { generateDiffSpans } from '../diff.js';
import { config } from '../config.js';
import { ParaphraseResponse, ParaphraseMode, SynonymStrength } from '../types.js';

export const paraphraseRouter = Router();

const paraphraseSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(25000, 'Input exceeds maximum character limit of 25,000'),
  mode: z.enum(['standard', 'fluency', 'formal', 'academic', 'simple', 'creative', 'expand', 'shorten', 'custom']).default('standard'),
  synonymStrength: z.number().int().min(1).max(4).default(2),
  customInstruction: z.string().max(500).optional(),
  model: z.string().optional()
});

paraphraseRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = paraphraseSchema.parse(req.body);
    const { text, mode, synonymStrength, customInstruction, model } = parsed;

    const systemPrompt = getParaphraseSystemPrompt(mode as ParaphraseMode, synonymStrength as SynonymStrength);
    const paragraphs = splitIntoParagraphs(text);
    const processedParagraphs: string[] = [];

    for (const paragraph of paragraphs) {
      const sentences = splitIntoSentences(paragraph);
      const chunks = chunkSentences(sentences, config.sentencesInPrompt);
      const chunkOutputs: string[] = [];

      for (const chunk of chunks) {
        let userPrompt = chunk.combinedText;
        if (mode === 'custom' && customInstruction) {
          userPrompt = `User style instruction: "${customInstruction}"\n\nText: ${userPrompt}`;
        }

        const rewritten = await executeLlmCompletion(systemPrompt, userPrompt, model);
        chunkOutputs.push(rewritten.trim());
      }

      processedParagraphs.push(chunkOutputs.join(' '));
    }

    const paraphrasedText = processedParagraphs.join('\n\n');
    const diffSpans = generateDiffSpans(text, paraphrasedText);

    const countWords = (str: string) => str.trim().split(/\s+/).filter(Boolean).length;

    const response: ParaphraseResponse = {
      originalText: text,
      paraphrasedText,
      mode: mode as ParaphraseMode,
      synonymStrength: synonymStrength as SynonymStrength,
      diffSpans,
      wordCountOriginal: countWords(text),
      wordCountAltered: countWords(paraphrasedText)
    };

    return res.json(response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Paraphrase error:', error);
    return res.status(500).json({ error: error.message || 'Failed to process paraphrasing request' });
  }
});
