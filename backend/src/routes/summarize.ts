import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getSummarizeSystemPrompt } from '../prompts.js';
import { executeLlmCompletion } from '../llm.js';
import { SummarizeResponse } from '../types.js';
import { config } from '../config.js';
import { splitIntoBatches, mapBatches } from '../batching.js';
import { abortOnClientDisconnect, isAbortError } from '../requestAbort.js';
import { wantsStream, openSse, finish, fail, SseChannel } from '../sse.js';
import { toClientError } from '../httpErrors.js';


export const summarizeRouter = Router();

const summarizeSchema = z.object({
  text: z.string().min(1, 'Input text cannot be empty').max(1000000, 'Input exceeds maximum payload limit of 1,000,000 characters'),
  format: z.enum(['paragraph', 'bullet']).default('paragraph'),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
  model: z.string().optional()
});

/**
 * Map-reduce summarization: inputs larger than one request are summarized per batch,
 * then the partial summaries are condensed again until they fit one final request.
 */
async function summarizeLarge(
  text: string,
  format: 'paragraph' | 'bullet',
  length: 'short' | 'medium' | 'long',
  model: string | undefined,
  signal: AbortSignal,
  stream: SseChannel | null = null
): Promise<string> {
  const limit = config.maxCharsPerRequest;
  const mapPrompt = getSummarizeSystemPrompt('paragraph', 'long');
  let working = text;
  // Each pass shrinks the text substantially; cap passes defensively
  for (let pass = 0; pass < 5 && working.length > limit; pass++) {
    const batched = splitIntoBatches(working, limit);
    const partials = await mapBatches(
      batched,
      (batch, i) => {
        stream?.send('status', { message: `Reading part ${i + 1} of ${batched.batches.length}…` });
        return executeLlmCompletion(mapPrompt, batch.text, model, 0.2, signal);
      },
      signal
    );
    working = partials.map(p => p.trim()).join('\n\n');
  }
  stream?.send('status', { message: 'Writing summary…' });
  const onToken = stream ? (d: string) => stream.send('delta', { text: d }) : undefined;
  return executeLlmCompletion(getSummarizeSystemPrompt(format, length), working, model, 0.2, signal, onToken);
}

summarizeRouter.post('/', async (req: Request, res: Response) => {
  const signal = abortOnClientDisconnect(res);
  let stream: SseChannel | null = null;
  try {
    const { text, format, length, model } = summarizeSchema.parse(req.body);
    if (wantsStream(req)) stream = openSse(res);

    const summary = await summarizeLarge(text, format, length, model, signal, stream);

    const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
    const origWords = countWords(text);
    const sumWords = countWords(summary);
    const reductionRatio = origWords > 0 ? parseFloat(Math.max(0, (origWords - sumWords) / origWords).toFixed(2)) : 0;

    let keyPoints: string[] | undefined;
    if (format === 'bullet') {
      keyPoints = summary
        .split('\n')
        .map(line => line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim())
        .filter(line => line.length > 0);
    }

    const response: SummarizeResponse = {
      originalText: text,
      summary,
      format,
      length,
      reductionRatio,
      keyPoints
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
    console.error('Summarize error:', error.message || error);
    const e = toClientError(error, 'Failed to generate summary');
    return fail(res, stream, e.status, e.message);
  }
});
