import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { DocumentProcessingJob, documentJobRegistry, JobCancelledError, findMissingFrozenTerms } from '../chunkOrchestrator.js';
import { generateDiffSpansForPairs } from '../diff.js';
import { config } from '../config.js';
import { completeStructured, MalformedModelResponseError } from '../structuredCompletion.js';
import { getSentenceAlternativesPrompt } from '../prompts.js';
import { abortOnClientDisconnect, isAbortError } from '../requestAbort.js';
import { ParaphraseResponse, ParaphraseMode, SynonymStrength, SemanticConsistencyReport } from '../types.js';
import { toClientError } from '../httpErrors.js';

export const paraphraseRouter = Router();

// Large document processing: allows up to 1,000,000 characters (~150,000 words) safely
const paraphraseSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(1000000, 'Document exceeds technical memory bound of 1,000,000 characters'),
  mode: z.enum(['standard', 'fluency', 'formal', 'academic', 'simple', 'creative', 'expand', 'shorten', 'custom']).default('standard'),
  synonymStrength: z.number().int().min(1).max(4).default(2),
  customInstruction: z.string().max(2000).optional(),
  frozenWords: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  model: z.string().optional(),
  async: z.boolean().optional()
}).refine(d => d.mode !== 'custom' || !!d.customInstruction?.trim(), {
  message: 'Describe the style you want for Custom mode',
  path: ['customInstruction']
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
  // No \b around $ and %: a word boundary can't sit before "$" or after "%", so they were never captured
  const numberMatches = text.match(/(?<![\w.])\$?\d+(?:[.,]\d+)?(?:%|\b(?:\s*(?:km\/h|kg|mg|meters|miles|years|ms|seconds)\b)?)/gi) || [];
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

const countWords = (str: string) => str.trim().split(/\s+/).filter(Boolean).length;

// Full responses for finished jobs are computed once (diffing a large document is expensive)
type FullParaphraseResponse = ParaphraseResponse & { partialRecovery?: boolean; frozenWordsMissing?: string[] };
const responseCache = new WeakMap<DocumentProcessingJob, FullParaphraseResponse>();

/**
 * Builds the full paraphrase response (diff spans, invariance report) for a completed job.
 * Shared by the synchronous route and by /api/tasks/:id for async jobs.
 */
export function buildParaphraseResponse(job: DocumentProcessingJob): FullParaphraseResponse {
  const cached = responseCache.get(job);
  if (cached) return cached;

  const paraphrasedText = job.recombine();
  const response: FullParaphraseResponse = {
    originalText: job.originalText,
    paraphrasedText,
    mode: job.mode,
    synonymStrength: job.synonymStrength,
    diffSpans: generateDiffSpansForPairs(job.getChunkPairs(), job.getLeadingWhitespace()),
    wordCountOriginal: countWords(job.originalText),
    wordCountAltered: countWords(paraphrasedText),
    semanticConsistency: evaluateSemanticConsistency(job.originalText, paraphrasedText),
    partialRecovery: job.partialRecovery,
    // Frozen terms that were in the input but did not survive the rewrite (so the UI can warn)
    frozenWordsMissing: findMissingFrozenTerms(job.frozenWords, job.originalText, paraphrasedText)
  };
  responseCache.set(job, response);
  return response;
}

paraphraseRouter.post('/', async (req: Request, res: Response) => {
  let syncJob: DocumentProcessingJob | undefined;
  // If the client disconnects during a synchronous run, cancel the job so it stops calling the provider
  res.on('close', () => {
    if (!res.writableFinished && syncJob) {
      syncJob.cancel();
    }
  });

  try {
    const parsed = paraphraseSchema.parse(req.body);
    const { text, mode, synonymStrength, customInstruction, model, async: isAsync, frozenWords } = parsed;

    const jobId = uuidv4();
    const job = new DocumentProcessingJob(
      jobId,
      text,
      mode as ParaphraseMode,
      synonymStrength as SynonymStrength,
      customInstruction,
      model,
      config.sentencesInPrompt,
      Array.from(new Set(frozenWords || []))
    );

    // Never evict another user's running job to make room; ask the client to retry instead
    if (documentJobRegistry.isFull()) {
      return res.status(503).json({ error: 'The server is busy processing other documents. Please try again shortly.' });
    }
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
    syncJob = job;
    try {
      await job.execute();
      return res.json(buildParaphraseResponse(job));
    } finally {
      // Synchronous results are delivered in this response; nothing will poll for them later
      documentJobRegistry.delete(jobId);
    }
  } catch (error: any) {
    if (error instanceof JobCancelledError) {
      if (res.writableEnded || res.destroyed) return; // client already gone
      return res.status(409).json({ error: 'Paraphrase job was cancelled.' });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Paraphrase error:', error.message || error);
    const e = toClientError(error, 'Failed to process paraphrasing request');
    return res.status(e.status).json({ error: e.message });
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

// ----------------------------------------------------
// Rephrase a single sentence: returns several alternatives to choose from
// ----------------------------------------------------
const sentenceSchema = z.object({
  sentence: z.string().trim().min(2, 'Select a sentence to rephrase').max(1500, 'Select a shorter passage (max 1,500 characters)'),
  context: z.string().max(3000).optional(),
  mode: z.enum(['standard', 'fluency', 'formal', 'academic', 'simple', 'creative', 'expand', 'shorten', 'custom']).default('standard'),
  count: z.number().int().min(1).max(5).default(3),
  frozenWords: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  customInstruction: z.string().max(2000).optional(),
  model: z.string().optional()
}).refine(d => d.mode !== 'custom' || !!d.customInstruction?.trim(), {
  message: 'Describe the style you want for Custom mode',
  path: ['customInstruction']
});

/** Pulls the text out of an alternative that may arrive as a string or as {text|sentence|alternative}. */
const alternativeText = z.union([
  z.string(),
  z.object({ text: z.string() }).transform(o => o.text),
  z.object({ sentence: z.string() }).transform(o => o.sentence),
  z.object({ alternative: z.string() }).transform(o => o.alternative)
]);

/** Accepts {"alternatives": [...]}, a bare array, or common key variants. */
const alternativesSchema = z.union([
  z.object({ alternatives: z.array(z.unknown()) }).transform(o => o.alternatives),
  z.object({ options: z.array(z.unknown()) }).transform(o => o.options),
  z.object({ rewrites: z.array(z.unknown()) }).transform(o => o.rewrites),
  z.array(z.unknown())
]).transform(items =>
  items.flatMap(item => {
    const r = alternativeText.safeParse(item);
    return r.success ? [r.data] : [];
  })
).refine(items => items.length > 0, 'No alternatives returned');

paraphraseRouter.post('/sentence', async (req: Request, res: Response) => {
  const signal = abortOnClientDisconnect(res);
  try {
    const { sentence, context, mode, count, frozenWords, customInstruction, model } = sentenceSchema.parse(req.body);
    const alternatives = await completeStructured(
      alternativesSchema,
      getSentenceAlternativesPrompt(mode, count, context, frozenWords || [], customInstruction),
      sentence,
      model,
      0.8,
      signal
    );

    const seen = new Set<string>([sentence.trim().toLowerCase()]);
    const unique = alternatives
      .map(a => a.trim())
      .filter(a => a.length > 0 && !seen.has(a.toLowerCase()) && seen.add(a.toLowerCase()))
      .slice(0, count);

    return res.json({ sentence, alternatives: unique });
  } catch (error: any) {
    if (signal.aborted || isAbortError(error)) return;
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    if (error instanceof MalformedModelResponseError) {
      console.warn('[ShivQuill Sentence] Malformed model response:', error.message);
      return res.status(422).json({ error: 'The AI returned an unexpected format. Please try again.' });
    }
    console.error('Sentence rephrase error:', error.message || error);
    const e = toClientError(error, 'Failed to rephrase sentence');
    return res.status(e.status).json({ error: e.message });
  }
});
