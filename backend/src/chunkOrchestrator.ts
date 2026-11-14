import { splitIntoParagraphs, splitIntoSentences, chunkSentences } from './segmenter.js';
import { executeLlmCompletion } from './llm.js';
import { getParaphraseSystemPrompt } from './prompts.js';
import { ParaphraseMode, SynonymStrength } from './types.js';

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

  constructor(
    jobId: string,
    public originalText: string,
    public mode: ParaphraseMode,
    public synonymStrength: SynonymStrength = 2,
    public customInstruction?: string,
    public model?: string,
    public sentencesPerChunk = 3
  ) {
    this.id = jobId;
    this.prepareChunks();
  }

  private prepareChunks(): void {
    const paragraphs = splitIntoParagraphs(this.originalText);
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
    if (this.status === 'processing' || this.status === 'pending') {
      this.status = 'cancelled';
      this.abortController.abort();
    }
  }

  public getProgress(): DocumentJobProgress {
    const total = this.chunks.length;
    const progressPercent = total > 0 ? Math.round((this.completedChunks / total) * 100) : 100;

    return {
      jobId: this.id,
      status: this.status,
      totalChunks: total,
      completedChunks: this.completedChunks,
      failedChunks: this.failedChunks,
      progressPercent,
      recombinedText: (this.status === 'completed' || this.partialRecovery) ? this.recombine() : undefined,
      partialRecovery: this.partialRecovery,
      errorMessage: this.errorMessage
    };
  }

  /**
   * Executes chunk processing sequentially with rolling context and transient retries
   */
  public async execute(): Promise<string> {
    this.status = 'processing';

    for (const chunk of this.chunks) {
      if (this.abortController.signal.aborted) {
        this.status = 'cancelled';
        throw new Error(`Job ${this.id} was cancelled by user.`);
      }

      chunk.status = 'processing';
      let success = false;
      const maxRetries = 2;

      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        chunk.attempts = attempt;
        try {
          const systemPrompt = getParaphraseSystemPrompt(
            this.mode,
            this.synonymStrength,
            this.rollingContext
          );

          let userPrompt = chunk.originalText;
          if (this.mode === 'custom' && this.customInstruction) {
            userPrompt = `User style instruction: "${this.customInstruction}"\n\nText to rewrite:\n${userPrompt}`;
          }

          const rewritten = await executeLlmCompletion(systemPrompt, userPrompt, this.model);
          chunk.rewrittenText = rewritten.trim();
          chunk.status = 'completed';
          this.completedChunks++;
          success = true;

          // Update rolling context for next chunk
          const lastSentence = chunk.rewrittenText.split(/(?<=[.?!])\s+/).pop();
          this.rollingContext = lastSentence || chunk.rewrittenText;
          break;
        } catch (err: any) {
          chunk.error = err.message || 'Chunk processing failed';
          if (attempt <= maxRetries) {
            // Transient backoff wait before retry
            await new Promise(r => setTimeout(r, attempt * 200));
          }
        }
      }

      if (!success) {
        chunk.status = 'failed';
        this.failedChunks++;
        // Graceful partial recovery: retain original text for this chunk so document continuity is preserved
        chunk.rewrittenText = chunk.originalText;
        this.partialRecovery = true;
      }
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
    const paragraphMap = new Map<number, string[]>();

    for (const chunk of this.chunks) {
      if (!paragraphMap.has(chunk.paragraphIndex)) {
        paragraphMap.set(chunk.paragraphIndex, []);
      }
      paragraphMap.get(chunk.paragraphIndex)!.push(chunk.rewrittenText || chunk.originalText);
    }

    const reconstructedParagraphs: string[] = [];
    const sortedPIndices = Array.from(paragraphMap.keys()).sort((a, b) => a - b);

    for (const pIdx of sortedPIndices) {
      const parts = paragraphMap.get(pIdx) || [];
      reconstructedParagraphs.push(parts.join(' '));
    }

    return reconstructedParagraphs.join('\n\n');
  }
}

/**
 * In-memory manager for active document processing jobs with TTL cleanup
 */
export class DocumentJobRegistry {
  private jobs: Map<string, DocumentProcessingJob> = new Map();

  public register(job: DocumentProcessingJob): void {
    this.jobs.set(job.id, job);

    // Auto-cleanup after 30 minutes
    setTimeout(() => {
      this.jobs.delete(job.id);
    }, 30 * 60 * 1000);
  }

  public get(id: string): DocumentProcessingJob | undefined {
    return this.jobs.get(id);
  }

  public cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (job) {
      job.cancel();
      return true;
    }
    return false;
  }
}

export const documentJobRegistry = new DocumentJobRegistry();
