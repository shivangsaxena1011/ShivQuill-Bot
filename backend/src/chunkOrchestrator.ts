import { splitParagraphsWithLayout, splitIntoSentences } from './segmenter.js';
import { splitIntoBatches } from './batching.js';
import { config } from './config.js';
import { ProviderError } from './llm.js';
import { executeLlmCompletion } from './llm.js';
import { getParaphraseSystemPrompt } from './prompts.js';
import { ParaphraseMode, SynonymStrength } from './types.js';

export class JobCancelledError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} was cancelled by user.`);
    this.name = 'JobCancelledError';
  }
}

/**
 * Creates an abortable sleep that immediately rejects if the AbortSignal fires
 */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      return reject(err);
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      reject(err);
    };

    signal.addEventListener('abort', onAbort);
  });
}

export interface ChunkRecord {
  id: string;
  paragraphIndex: number;
  chunkIndex: number;
  originalText: string;
  rewrittenText?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  error?: string;
  /** Exact whitespace that followed this chunk inside its paragraph ('' for the paragraph's last chunk) */
  after?: string;
  /** Upstream error status (e.g. 401, 429) when the chunk failed */
  errorStatus?: number;
}

export interface DocumentJobProgress {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  progressPercent: number;
  recombinedText?: string;
  partialRecovery: boolean;
  errorMessage?: string;
  /** Live preview of the latest rewritten chunk while processing */
  latestText?: string;
}

export class DocumentProcessingJob {
  public id: string;
  public status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' = 'pending';
  public chunks: ChunkRecord[] = [];
  public completedChunks = 0;
  public failedChunks = 0;
  public abortController: AbortController = new AbortController();
  public partialRecovery = false;
  public errorMessage?: string;
  private rollingContext = '';
  private leadingWhitespace = '';
  private paragraphSeparators: string[] = [];

  constructor(
    jobId: string,
    public originalText: string,
    public mode: ParaphraseMode,
    public synonymStrength: SynonymStrength = 2,
    public customInstruction?: string,
    public model?: string,
    public sentencesPerChunk = 3,
    /** Words/phrases that must appear unchanged in the rewrite */
    public frozenWords: string[] = []
  ) {
    this.id = jobId;
    this.prepareChunks();
  }

  private prepareChunks(): void {
    const layout = splitParagraphsWithLayout(this.originalText);
    const paragraphs = layout.paragraphs;
    this.leadingWhitespace = layout.leading;
    this.paragraphSeparators = layout.separators;
    let globalIndex = 0;

    const perChunk = Math.max(1, Math.floor(this.sentencesPerChunk) || 1);
    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const paragraph = paragraphs[pIdx];
      // Sentence character ranges inside the paragraph, so the exact whitespace between chunks is kept
      const spans: Array<[number, number]> = [];
      let pos = 0;
      for (const sentence of splitIntoSentences(paragraph)) {
        const at = paragraph.indexOf(sentence, pos);
        if (at === -1) continue;
        spans.push([at, at + sentence.length]);
        pos = at + sentence.length;
      }
      if (!spans.length) spans.push([0, paragraph.length]);
      // Anything the segmenter skipped belongs to the neighbouring sentence
      spans[0][0] = 0;
      spans[spans.length - 1][1] = paragraph.length;

      const ranges: Array<[number, number]> = [];
      for (let i = 0; i < spans.length; i += perChunk) ranges.push([spans[i][0], spans[Math.min(spans.length, i + perChunk) - 1][1]]);

      let cIdx = 0;
      ranges.forEach(([start, end], r) => {
        const nextStart = r + 1 < ranges.length ? ranges[r + 1][0] : end;
        const text = paragraph.slice(start, end);
        const after = paragraph.slice(end, nextStart);
        // Text without sentence punctuation (transcripts, Thai…) can be one huge "sentence": never send a
        // chunk larger than one provider request, split it at paragraph/line/word boundaries instead
        const pieces = text.length > config.maxCharsPerRequest
          ? splitIntoBatches(text, config.maxCharsPerRequest).batches.map((b, i, all) => ({ text: b.text, after: i === all.length - 1 ? after : b.separator }))
          : [{ text, after }];
        for (const piece of pieces) {
          this.chunks.push({
            id: `chunk-${pIdx}-${cIdx}-${globalIndex++}`,
            paragraphIndex: pIdx,
            chunkIndex: cIdx++,
            originalText: piece.text,
            status: 'pending',
            attempts: 0,
            after: piece.after
          });
        }
      });
    }
  }

  public cancel(): void {
    if (this.status !== 'completed' && this.status !== 'failed') {
      this.status = 'cancelled';
      this.abortController.abort();
    }
  }

  public getProgress(): DocumentJobProgress {
    const total = this.chunks.length;
    // Failed chunks are still "processed" (original text retained), so they count toward progress
    const processed = this.completedChunks + this.failedChunks;
    const progressPercent = this.status === 'completed'
      ? 100
      : total > 0 ? Math.round((processed / total) * 100) : 100;

    return {
      jobId: this.id,
      status: this.status,
      totalChunks: total,
      completedChunks: this.completedChunks,
      failedChunks: this.failedChunks,
      progressPercent,
      recombinedText: this.status === 'completed' ? this.recombine() : undefined,
      partialRecovery: this.partialRecovery && this.status !== 'cancelled',
      errorMessage: this.errorMessage,
      latestText: this.status === 'processing' ? this.latestCompletedText() : undefined
    };
  }

  /** The most recently rewritten piece (short), shown as a live preview while a job runs. */
  private latestCompletedText(): string | undefined {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      if (c.status === 'completed' && c.rewrittenText) {
        return c.rewrittenText.length > 600 ? `${c.rewrittenText.slice(0, 600)}…` : c.rewrittenText;
      }
    }
    return undefined;
  }

  public isCancelled(): boolean {
    return this.abortController.signal.aborted || (this.status as string) === 'cancelled';
  }

  /**
   * Executes chunk processing sequentially with rolling context and transient retries.
   * Cancels immediately when AbortSignal fires, preventing any cancelled job from completing.
   */
  public async execute(): Promise<string> {
    if (this.isCancelled()) {
      this.status = 'cancelled';
      throw new JobCancelledError(this.id);
    }

    this.status = 'processing';
    // Set when the provider rejects us in a way every remaining chunk would hit too
    let fatalError: string | null = null;

    for (const chunk of this.chunks) {
      if (this.isCancelled()) {
        this.status = 'cancelled';
        throw new JobCancelledError(this.id);
      }

      if (fatalError) {
        // Skip the doomed provider call; keep the original text like any other failed chunk
        chunk.status = 'failed';
        chunk.error = fatalError;
        chunk.rewrittenText = chunk.originalText;
        this.failedChunks++;
        this.partialRecovery = true;
        continue;
      }

      chunk.status = 'processing';
      let success = false;
      const maxRetries = 2;

      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        if (this.isCancelled()) {
          this.status = 'cancelled';
          throw new JobCancelledError(this.id);
        }

        chunk.attempts = attempt;
        try {
          const systemPrompt = getParaphraseSystemPrompt(
            this.mode,
            this.synonymStrength,
            this.rollingContext,
            // Only send frozen terms that actually occur in this chunk (keeps prompts short)
            this.frozenWords.filter(w => w && frozenTermRegex(w, 'iu').test(chunk.originalText)),
            this.customInstruction
          );

          // Only the text to rewrite goes in the user message
          const userPrompt = chunk.originalText;

          const rewritten = await executeLlmCompletion(
            systemPrompt,
            userPrompt,
            this.model,
            0.3,
            this.abortController.signal
          );

          // Check cancellation immediately following completion
          if (this.isCancelled()) {
            this.status = 'cancelled';
            throw new JobCancelledError(this.id);
          }

          chunk.rewrittenText = rewritten.trim();
          chunk.status = 'completed';
          this.completedChunks++;
          success = true;

          // Update rolling context for next chunk
          const lastSentence = chunk.rewrittenText.split(/(?<=[.?!])\s+/).pop();
          this.rollingContext = lastSentence || chunk.rewrittenText;
          break;
        } catch (err: any) {
          if (
            this.isCancelled() ||
            err.name === 'AbortError' ||
            err.name === 'JobCancelledError'
          ) {
            this.status = 'cancelled';
            chunk.status = 'failed';
            chunk.error = 'Job cancelled by user';
            throw new JobCancelledError(this.id);
          }

          chunk.error = err.message || 'Chunk processing failed';
          if (typeof err.status === 'number') chunk.errorStatus = err.status;
          // Bad key, forbidden, or unknown model: every remaining chunk would fail the same way
          if (typeof err.status === 'number' && [401, 403, 404].includes(err.status)) {
            fatalError = chunk.error || 'AI provider rejected the request';
            break;
          }
          // Transport/HTTP errors were already retried inside the provider SDK; re-trying them here
          // would multiply attempts (and cost). Only retry errors explicitly flagged as retryable.
          if (err.retryable !== true) {
            break;
          }
          if (attempt <= maxRetries) {
            try {
              // Abortable backoff wait
              await abortableSleep(attempt * 200, this.abortController.signal);
            } catch (sleepErr: any) {
              this.status = 'cancelled';
              chunk.status = 'failed';
              chunk.error = 'Job cancelled by user during backoff';
              throw new JobCancelledError(this.id);
            }
          }
        }
      }

      if (this.isCancelled()) {
        this.status = 'cancelled';
        throw new JobCancelledError(this.id);
      }

      if (!success) {
        chunk.status = 'failed';
        this.failedChunks++;
        // Graceful partial recovery: retain original text for this chunk so document continuity is preserved
        chunk.rewrittenText = chunk.originalText;
        this.partialRecovery = true;
      }
    }

    if (this.isCancelled()) {
      this.status = 'cancelled';
      throw new JobCancelledError(this.id);
    }

    if (this.failedChunks > 0 && this.completedChunks === 0) {
      this.status = 'failed';
      this.errorMessage = `All ${this.chunks.length} chunks failed upstream AI processing.`;
      // Keep the provider's status (401 bad key, 429 busy…) so the client gets the right message, not a 500
      const status = this.chunks.find(c => typeof c.errorStatus === 'number')?.errorStatus;
      throw new ProviderError(this.errorMessage, { status: status ?? 502 });
    }

    this.status = 'completed';
    return this.recombine();
  }

  /**
   * Recombines chunks into original paragraph and document structure
   */
  public recombine(): string {
    return this.leadingWhitespace + this.getParagraphPairs()
      .map((p, i) => p.rewritten + (this.paragraphSeparators[i] ?? ''))
      .join('');
  }

  /**
   * Per-chunk original/rewritten pairs with the layout text that follows each chunk
   * (a space between chunks of one paragraph, the original separator after a paragraph).
   * Used to build diffs chunk-by-chunk, which stays fast on very large documents.
   */
  public getChunkPairs(): Array<{ original: string; rewritten: string; after: string }> {
    const pairs: Array<{ original: string; rewritten: string; after: string }> = [];
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      const next = this.chunks[i + 1];
      const after = next && next.paragraphIndex === chunk.paragraphIndex
        ? (chunk.after ?? ' ')
        : (this.paragraphSeparators[chunk.paragraphIndex] ?? '');
      pairs.push({ original: chunk.originalText, rewritten: chunk.rewrittenText || chunk.originalText, after });
    }
    return pairs;
  }

  public getLeadingWhitespace(): string {
    return this.leadingWhitespace;
  }

  private getParagraphPairs(): Array<{ rewritten: string }> {
    // Chunks of one paragraph are rejoined with the exact whitespace that separated them originally
    const paragraphMap = new Map<number, string>();
    this.chunks.forEach((chunk, i) => {
      const next = this.chunks[i + 1];
      const joiner = next && next.paragraphIndex === chunk.paragraphIndex ? (chunk.after ?? ' ') : '';
      paragraphMap.set(chunk.paragraphIndex, (paragraphMap.get(chunk.paragraphIndex) || '') + (chunk.rewrittenText || chunk.originalText) + joiner);
    });
    return Array.from(paragraphMap.keys())
      .sort((a, b) => a - b)
      .map(idx => ({ rewritten: paragraphMap.get(idx) || '' }));
  }
}

interface JobEntry {
  job: DocumentProcessingJob;
  registeredAt: number;
  timer: NodeJS.Timeout;
  /** When the expiry timer first saw the job finished */
  finishedSeenAt?: number;
}

/**
 * In-memory manager for active document processing jobs with TTL cleanup and capacity bounds
 */
/** Whole-term regex: "AI" must not match inside "said"/"maintain". */
export function frozenTermRegex(term: string, flags = 'u'): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, flags);
}

/**
 * Frozen terms that occur in `original` (whole-term, any case) but whose exact spelling there
 * no longer appears in `rewritten` (e.g. dropped, or "Apple" lowercased to "apple").
 */
export function findMissingFrozenTerms(terms: string[], original: string, rewritten: string): string[] {
  return terms.filter(term => {
    if (!term) return false;
    const forms = new Set(original.match(frozenTermRegex(term, 'giu')) || []);
    if (forms.size === 0) return false;
    return [...forms].some(form => !frozenTermRegex(form).test(rewritten));
  });
}

function isTerminalStatus(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export class DocumentJobRegistry {
  private jobs: Map<string, JobEntry> = new Map();
  private readonly maxActiveJobs: number;
  private readonly ttlMs: number;

  constructor(maxActiveJobs = 200, ttlMinutes = 30) {
    this.maxActiveJobs = maxActiveJobs;
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  public register(job: DocumentProcessingJob): void {
    // If capacity reached, prune completed, cancelled, or failed jobs first
    if (this.jobs.size >= this.maxActiveJobs) {
      this.prune();
    }

    const registeredAt = Date.now();
    this.jobs.set(job.id, {
      job,
      registeredAt,
      timer: this.scheduleExpiry(job, registeredAt)
    });
  }

  /**
   * Auto-cleanup after TTL. A job that is still running is kept (its client is still polling) and
   * re-checked after another TTL; once it finishes, the client gets a full TTL to fetch the result.
   * A job that somehow runs past MAX_RUNTIME_TTLS windows is cancelled so it can't burn provider calls forever.
   */
  private scheduleExpiry(job: DocumentProcessingJob, registeredAt: number): ReturnType<typeof setTimeout> {
    const MAX_RUNTIME_TTLS = 4;
    const timer = setTimeout(() => {
      const entry = this.jobs.get(job.id);
      if (!entry || entry.job !== job) return;
      if (!isTerminalStatus(job.status) && Date.now() - registeredAt < this.ttlMs * MAX_RUNTIME_TTLS) {
        entry.timer = this.scheduleExpiry(job, registeredAt);
        return;
      }
      if (!isTerminalStatus(job.status)) {
        job.cancel();
        this.delete(job.id);
        return;
      }
      // Finished since the last check: give the client a full TTL from now to fetch the result
      if (!entry.finishedSeenAt) {
        entry.finishedSeenAt = Date.now();
        entry.timer = this.scheduleExpiry(job, registeredAt);
        return;
      }
      this.delete(job.id);
    }, this.ttlMs);
    timer.unref?.();
    return timer;
  }

  public get(id: string): DocumentProcessingJob | undefined {
    return this.jobs.get(id)?.job;
  }

  /** Cancels an active job. Returns false when the job is unknown or already finished. */
  public cancel(id: string): boolean {
    const entry = this.jobs.get(id);
    if (!entry || isTerminalStatus(entry.job.status)) return false;
    entry.job.cancel();
    return true;
  }

  /** True when every slot is held by a job that is still running. */
  public isFull(): boolean {
    if (this.jobs.size < this.maxActiveJobs) return false;
    // Only reclaim finished jobs here — never evict a job that another user is still running
    this.pruneFinished();
    return this.jobs.size >= this.maxActiveJobs;
  }

  public delete(id: string): void {
    const entry = this.jobs.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      this.jobs.delete(id);
    }
  }

  /** Removes completed, failed and cancelled jobs. Running jobs are left untouched. */
  private pruneFinished(): void {
    for (const [id, entry] of this.jobs.entries()) {
      if (isTerminalStatus(entry.job.status)) {
        clearTimeout(entry.timer);
        this.jobs.delete(id);
      }
    }
  }

  public prune(): void {
    this.pruneFinished();

    // Last resort for callers that register without checking isFull(): drop the oldest entry
    // (cancelling it so it doesn't keep consuming provider calls while no longer trackable)
    if (this.jobs.size >= this.maxActiveJobs) {
      const oldestId = Array.from(this.jobs.keys())[0];
      if (oldestId) {
        this.jobs.get(oldestId)?.job.cancel();
        this.delete(oldestId);
      }
    }
  }

  public get size(): number {
    return this.jobs.size;
  }

  public clearAll(): void {
    for (const entry of this.jobs.values()) {
      clearTimeout(entry.timer);
    }
    this.jobs.clear();
  }
}

// Bounded for small hosts (e.g. Render free: 512 MB RAM); each job can hold a large document
export const documentJobRegistry = new DocumentJobRegistry(
  Math.max(5, parseInt(process.env.MAX_ACTIVE_JOBS || '50', 10) || 50)
);
