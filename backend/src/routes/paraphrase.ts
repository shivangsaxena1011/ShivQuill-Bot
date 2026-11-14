import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { DocumentProcessingJob, documentJobRegistry } from '../chunkOrchestrator.js';
import { generateDiffSpans } from '../diff.js';
import { config } from '../config.js';
import { ParaphraseResponse, ParaphraseMode, SynonymStrength, SemanticConsistencyReport } from '../types.js';

export const paraphraseRouter = Router();

// Large document processing: allows up to 1,000,000 characters (~150,000 words) safely
const paraphraseSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(1000000, 'Document exceeds technical memory bound of 1,000,000 characters'),
  mode: z.enum(['standard', 'fluency', 'formal', 'academic', 'simple', 'creative', 'expand', 'shorten', 'custom']).default('standard'),
  synonymStrength: z.number().int().min(1).max(4).default(2),
  customInstruction: z.string().max(2000).optional(),
  model: z.string().optional(),
  async: z.boolean().optional()
});

/**
 * Extracts invariant entities: numbers, percentages, dates, citations, and capitalized proper nouns
 */
function extractInvariantEntities(text: string): string[] {
  const entities = new Set<string>();

  // 1. Formal Citations: e.g. (Smith et al., 2024), [14], (He et al., 2016, p. 12)
  const citationMatches = text.match(/\([A-Z][a-zA-Z\s.,\d]+\)|\[\d+\]/g) || [];
  for (const c of citationMatches) entities.add(c.trim());

  // 2. Numerical figures, percentages, currencies, measurements
  const numberMatches = text.match(/\b\$?\d+(?:\.\d+)?%?(?:\s*(?:km\/h|kg|mg|meters|miles|years|ms|seconds))?\b/gi) || [];
  for (const n of numberMatches) {
    if (n.trim().length > 0) entities.add(n.trim());
  }

  // 3. Quoted substrings
  const quoteMatches = text.match(/"([^"]+)"/g) || [];
  for (const q of quoteMatches) entities.add(q.trim());

  // 4. URLs
  const urlMatches = text.match(/https?:\/\/[^\s)]+/g) || [];
  for (const u of urlMatches) entities.add(u.trim());

  // 5. Multi-word proper nouns
  const properNouns = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || [];
  for (const p of properNouns) entities.add(p.trim());

  return Array.from(entities);
}

/**
 * Evaluates semantic consistency and entity preservation across original and rewritten text
 */
function evaluateSemanticConsistency(originalText: string, rewrittenText: string): SemanticConsistencyReport {
  const entities = extractInvariantEntities(originalText);
  if (entities.length === 0) {
    return {
      checkedEntities: [],
      preservedCount: 0,
      totalCount: 0,
      preservationRate: 100,
      notes: 'No specific numerical, citation, or named entities detected in input text.'
    };
  }

  let preserved = 0;
  const missing: string[] = [];

  for (const ent of entities) {
    if (rewrittenText.includes(ent) || rewrittenText.toLowerCase().includes(ent.toLowerCase())) {
      preserved++;
    } else {
      missing.push(ent);
    }
  }

  const rate = Math.round((preserved / entities.length) * 100);
  let notes = `Preserved ${preserved} of ${entities.length} detected invariant entities (${rate}%).`;
  if (missing.length > 0) {
    notes += ` Unmatched entities: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}.`;
  }

  return {
    checkedEntities: entities,
    preservedCount: preserved,
    totalCount: entities.length,
    preservationRate: rate,
    notes
  };
}

paraphraseRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = paraphraseSchema.parse(req.body);
    const { text, mode, synonymStrength, customInstruction, model, async: isAsync } = parsed;

    const jobId = uuidv4();
    const job = new DocumentProcessingJob(
      jobId,
      text,
      mode as ParaphraseMode,
      synonymStrength as SynonymStrength,
      customInstruction,
      model,
      config.sentencesInPrompt
    );

    documentJobRegistry.register(job);

    // If client requested asynchronous background job processing (e.g. for massive documents)
    if (isAsync) {
      job.execute().catch(err => console.error(`[ShivQuill] Background job ${jobId} failed:`, err.message));
      return res.status(202).json({
        jobId,
        status: 'processing',
        totalChunks: job.chunks.length,
        statusUrl: `/api/tasks/${jobId}`
      });
    }

    // Default: synchronous execution with retry and chunk recovery
    const paraphrasedText = await job.execute();
    const diffSpans = generateDiffSpans(text, paraphrasedText);
    const semanticConsistency = evaluateSemanticConsistency(text, paraphrasedText);

    const countWords = (str: string) => str.trim().split(/\s+/).filter(Boolean).length;

    const response: ParaphraseResponse & { partialRecovery?: boolean } = {
      originalText: text,
      paraphrasedText,
      mode: mode as ParaphraseMode,
      synonymStrength: synonymStrength as SynonymStrength,
      diffSpans,
      wordCountOriginal: countWords(text),
      wordCountAltered: countWords(paraphrasedText),
      semanticConsistency,
      partialRecovery: job.partialRecovery
    };

    return res.json(response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Paraphrase error:', error.message || error);
    return res.status(500).json({ error: error.message || 'Failed to process paraphrasing request' });
  }
});

// Cancel a running document processing job
paraphraseRouter.post('/cancel/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const cancelled = documentJobRegistry.cancel(jobId);
  if (!cancelled) {
    return res.status(404).json({ error: `Job ${jobId} not found or already completed.` });
  }
  return res.json({ status: 'cancelled', jobId });
});
