import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { executeLlmCompletion } from '../llm.js';
import { completeStructured, MalformedModelResponseError, looseNumber, looseString } from '../structuredCompletion.js';
import { getToneAnalysisPrompt, getToneRewritePrompt, TONE_TARGETS } from '../prompts.js';
import { config } from '../config.js';
import { splitIntoBatches, joinBatchOutputs, mapBatches } from '../batching.js';
import { generateDiffSpansForPairs } from '../diff.js';
import { abortOnClientDisconnect, isAbortError } from '../requestAbort.js';
import { wantsStream, openSse, finish, fail, SseChannel } from '../sse.js';
import { toClientError } from '../httpErrors.js';

export const toneRouter = Router();

const analyzeSchema = z.object({
  text: z.string().trim().min(20, 'Enter at least a sentence or two (20+ characters)').max(1000000),
  model: z.string().optional()
});

const toneResultSchema = z.object({
  primaryTone: looseString(40),
  tones: z.array(z.object({ name: looseString(40), score: looseNumber() }))
    .catch([])
    .transform(ts => ts.filter(t => t.name).slice(0, 10)),
  formality: looseNumber(50),
  sentiment: z.preprocess(
    v => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.enum(['positive', 'neutral', 'negative', 'mixed']).catch('neutral')
  ),
  confidence: looseNumber(50),
  summary: looseString(500)
}).refine(r => r.primaryTone.length > 0 || r.tones.length > 0, 'No tone was identified');

const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)));

/** Analyzes the overall tone. Only a representative sample is sent, which keeps it fast and cheap. */
toneRouter.post('/analyze', async (req: Request, res: Response) => {
  const signal = abortOnClientDisconnect(res);
  try {
    const { text, model } = analyzeSchema.parse(req.body);
    const sample = text.length > 8000 ? `${text.slice(0, 5000)}\n…\n${text.slice(-3000)}` : text;
    const parsed = await completeStructured(toneResultSchema, getToneAnalysisPrompt(), sample, model, 0.1, signal);
    const tones = parsed.tones.map(t => ({ name: t.name, score: clamp(t.score) })).sort((a, b) => b.score - a.score);

    return res.json({
      primaryTone: parsed.primaryTone || tones[0].name,
      tones,
      formality: clamp(parsed.formality),
      sentiment: parsed.sentiment,
      confidence: clamp(parsed.confidence),
      summary: parsed.summary,
      sampled: sample !== text
    });
  } catch (error: any) {
    if (signal.aborted || isAbortError(error)) return;
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
    if (error instanceof MalformedModelResponseError) {
      console.warn('[ShivQuill Tone] Malformed model response:', error.message);
      return res.status(422).json({ error: 'The AI returned an unexpected format. Please try again.' });
    }
    console.error('Tone analysis error:', error.message || error);
    const e = toClientError(error, 'Tone analysis failed');
    return res.status(e.status).json({ error: e.message });
  }
});

const rewriteSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(1000000),
  tone: z.enum(Object.keys(TONE_TARGETS) as [string, ...string[]]),
  model: z.string().optional()
});

/** Rewrites text into a target tone (batched for long documents, streamable). */
toneRouter.post('/rewrite', async (req: Request, res: Response) => {
  const signal = abortOnClientDisconnect(res);
  let stream: SseChannel | null = null;
  try {
    const { text, tone, model } = rewriteSchema.parse(req.body);
    const prompt = getToneRewritePrompt(tone);
    if (wantsStream(req)) stream = openSse(res);
    const onToken = stream ? (d: string) => stream!.send('delta', { text: d }) : undefined;

    const batched = splitIntoBatches(text, config.maxCharsPerRequest);
    if (batched.leading) onToken?.(batched.leading);
    const outputs = await mapBatches(batched, async batch => {
      const out = await executeLlmCompletion(prompt, batch.text, model, 0.5, signal, onToken);
      onToken?.(batch.separator);
      return out;
    }, signal);

    const rewrittenText = joinBatchOutputs(batched, outputs);
    const diffSpans = generateDiffSpansForPairs(
      batched.batches.map((b, i) => ({ original: b.text, rewritten: outputs[i].trim(), after: b.separator })),
      batched.leading
    );

    return finish(res, stream, { originalText: text, rewrittenText, tone, diffSpans });
  } catch (error: any) {
    if (signal.aborted || isAbortError(error)) {
      stream?.end();
      return;
    }
    if (error instanceof z.ZodError) return fail(res, stream, 400, error.errors[0].message);
    console.error('Tone rewrite error:', error.message || error);
    const e = toClientError(error, 'Tone rewrite failed');
    return fail(res, stream, e.status, e.message);
  }
});
