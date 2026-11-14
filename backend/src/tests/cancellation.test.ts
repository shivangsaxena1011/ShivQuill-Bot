import { describe, it, expect, beforeEach } from 'vitest';
import {
  DocumentProcessingJob,
  JobCancelledError,
  DocumentJobRegistry
} from '../chunkOrchestrator.js';

describe('Document Cancellation & Chunk Orchestrator Hardening', () => {
  beforeEach(() => {
    // Reset test state if needed
  });

  it('immediately cancels before execution starts and rejects with JobCancelledError', async () => {
    const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
    const job = new DocumentProcessingJob('job-cancel-pre', text, 'standard', 2);

    expect(job.status).toBe('pending');
    job.cancel();
    expect(job.status).toBe('cancelled');
    expect(job.abortController.signal.aborted).toBe(true);

    await expect(job.execute()).rejects.toThrow(JobCancelledError);
    expect(job.status).toBe('cancelled');

    const progress = job.getProgress();
    expect(progress.status).toBe('cancelled');
    expect(progress.recombinedText).toBeUndefined();
  });

  it('cancels mid-execution across chunks and halts immediately', async () => {
    const text = [
      'Artificial intelligence is transforming modern writing systems and educational tools.',
      'Natural language processing enables sophisticated semantic transformations and stylistic shifts.',
      'Researchers emphasize the necessity of transparent attribution and citation verification.',
      'Linguistic variation across academic prose requires careful preservation of core domain terminology.',
      'Sentence structure must balance readability with conceptual complexity in technical reports.'
    ].join(' ');

    const job = new DocumentProcessingJob('job-cancel-mid', text, 'standard', 2, undefined, undefined, 1);
    expect(job.chunks.length).toBeGreaterThanOrEqual(4);

    // Trigger execution and abort quickly
    const execPromise = job.execute();
    job.cancel();

    await expect(execPromise).rejects.toThrow(JobCancelledError);
    expect(job.status).toBe('cancelled');
    expect(job.abortController.signal.aborted).toBe(true);

    const progress = job.getProgress();
    expect(progress.status).toBe('cancelled');
    expect(progress.completedChunks).toBeLessThan(job.chunks.length);
    expect(progress.recombinedText).toBeUndefined();
  });

  it('prevents a cancelled job from completing or returning completed recombined text', async () => {
    const text = 'Sentence one here. Sentence two here. Sentence three here.';
    const job = new DocumentProcessingJob('job-cancel-state', text, 'standard', 2);

    job.cancel();
    try {
      await job.execute();
    } catch (err: any) {
      expect(err).toBeInstanceOf(JobCancelledError);
    }

    expect(job.status).toBe('cancelled');
    expect(job.status).not.toBe('completed');

    const progress = job.getProgress();
    expect(progress.status).toBe('cancelled');
    expect(progress.recombinedText).toBeUndefined();
  });

  it('enforces bounds and pruning in DocumentJobRegistry', () => {
    const registry = new DocumentJobRegistry(5, 1); // Max 5 jobs, 1 min TTL
    const jobs: DocumentProcessingJob[] = [];

    for (let i = 0; i < 7; i++) {
      const job = new DocumentProcessingJob(`job-reg-${i}`, 'Sample text here for testing.', 'standard');
      if (i % 2 === 0) {
        job.status = 'completed';
      }
      registry.register(job);
      jobs.push(job);
    }

    // Size must not exceed maxActiveJobs
    expect(registry.size).toBeLessThanOrEqual(5);

    // Cancel lookup works
    const testJob = new DocumentProcessingJob('job-lookup-1', 'Sample text', 'standard');
    registry.register(testJob);
    expect(registry.get('job-lookup-1')).toBeDefined();

    const cancelled = registry.cancel('job-lookup-1');
    expect(cancelled).toBe(true);
    expect(testJob.status).toBe('cancelled');

    registry.clearAll();
    expect(registry.size).toBe(0);
  });
});
