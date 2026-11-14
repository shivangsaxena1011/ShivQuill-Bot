import { splitParagraphsWithLayout, splitIntoSentences, chunkSentences } from './segmenter.js';
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

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const paragraph = paragraphs[pIdx];
      const sentences = splitIntoSentences(paragraph);
      const sentenceChunks = chunkSentences(sentences, this.sentencesPerChunk);

      for (let cIdx = 0; cIdx < sentenceChunks.length; cIdx++) {
        this.chunks.push({
          id: `chunk-${pIdx}-${cIdx}-${globalIndex++}`,
          paragraphIndex: pIdx,
          chunkIndex: cIdx,
          originalText: sentenceChunks[cIdx].combinedText,
          status: 'pending',
          attempts: 0
        });
      }
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
            this.frozenWords.filter(w => chunk.originalText.toLowerCase().includes(w.toLowerCase()))
          );

          let userPrompt = chunk.originalText;
          if (this.mode === 'custom' && this.customInstruction) {
            userPrompt = `User style instruction: "${this.customInstruction}"\n\nText to rewrite:\n${userPrompt}`;
          }

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
            err.name === 'JobCancelledError' ||
            err.message?.includes('aborted')
          ) {
            this.status = 'cancelled';
            chunk.status = 'failed';
            chunk.error = 'Job cancelled by user';
            throw new JobCancelledError(this.id);
          }

          chunk.error = err.message || 'Chunk processing failed';
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
      throw new Error(this.errorMessage);
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
        ? ' '
        : (this.paragraphSeparators[chunk.paragraphIndex] ?? '');
      pairs.push({ original: chunk.originalText, rewritten: chunk.rewrittenText || chunk.originalText, after });
    }
    return pairs;
  }

  public getLeadingWhitespace(): string {
    return this.leadingWhitespace;
  }

  private getParagraphPairs(): Array<{ rewritten: string }> {
    const paragraphMap = new Map<number, string[]>();
    for (const chunk of this.chunks) {
      if (!paragraphMap.has(chunk.paragraphIndex)) paragraphMap.set(chunk.paragraphIndex, []);
      paragraphMap.get(chunk.paragraphIndex)!.push(chunk.rewrittenText || chunk.originalText);
    }
    return Array.from(paragraphMap.keys())
      .sort((a, b) => a - b)
      .map(idx => ({ rewritten: (paragraphMap.get(idx) || []).join(' ') }));
  }
}

interface JobEntry {
  job: DocumentProcessingJob;
  registeredAt: number;
  timer: NodeJS.Timeout;
}

/**
 * In-memory manager for active document processing jobs with TTL cleanup and capacity bounds
 */
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

    // Auto-cleanup after TTL
    const timer = setTimeout(() => {
      this.delete(job.id);
    }, this.ttlMs);
    timer.unref?.();

    this.jobs.set(job.id, {
      job,
      registeredAt: Date.now(),
      timer
    });
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
    this.prune();
    return this.jobs.size >= this.maxActiveJobs;
  }

  public delete(id: string): void {
    const entry = this.jobs.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      this.jobs.delete(id);
    }
  }

  public prune(): void {
    const now = Date.now();
    for (const [id, entry] of this.jobs.entries()) {
      const isTerminal = isTerminalStatus(entry.job.status);
      const isExpired = now - entry.registeredAt > this.ttlMs;
      if (isTerminal || isExpired) {
        clearTimeout(entry.timer);
        this.jobs.delete(id);
      }
    }

    // If still at or above capacity, drop the oldest entry (cancelling it so it doesn't keep
    // consuming provider calls while no longer trackable)
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
