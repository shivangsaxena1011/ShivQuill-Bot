import { describe, it, expect, vi, afterEach } from 'vitest';

const executeLlmCompletion = vi.fn();

vi.mock('../llm.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../llm.js')>()),
  executeLlmCompletion: (...args: unknown[]) => executeLlmCompletion(...args)
}));

const { DocumentProcessingJob } = await import('../chunkOrchestrator.js');

function providerError(retryable: boolean, status?: number) {
  return Object.assign(new Error('AI Provider Error (TEST): boom'), { name: 'ProviderError', retryable, status });
}

describe('Chunk retry policy (no retry multiplication on top of the SDK)', () => {
  afterEach(() => { executeLlmCompletion.mockReset(); });

  it('does not retry non-retryable provider errors (e.g. 401), and keeps original text', async () => {
    executeLlmCompletion.mockImplementation(async () => { throw providerError(false, 401); });
    const job = new DocumentProcessingJob('retry-1', 'Only sentence.', 'standard', 2, undefined, undefined, 3);

    let thrown: Error | undefined;
    try {
      await job.execute();
    } catch (e: any) {
      thrown = e;
    }
    expect(thrown?.message).toMatch(/All 1 chunks failed/);
    expect(executeLlmCompletion.mock.calls.length).toBe(1);
    expect(job.chunks[0].rewrittenText).toBe('Only sentence.');
  });

  it('retries errors flagged retryable (e.g. empty completion) up to 3 attempts', async () => {
    executeLlmCompletion
      .mockRejectedValueOnce(providerError(true))
      .mockResolvedValueOnce('Rewritten sentence.');
    const job = new DocumentProcessingJob('retry-2', 'Only sentence.', 'standard', 2, undefined, undefined, 3);

    await expect(job.execute()).resolves.toBe('Rewritten sentence.');
    expect(executeLlmCompletion).toHaveBeenCalledTimes(2);
  });

  it('reports 100% progress for a completed job with recovered (failed) chunks', async () => {
    executeLlmCompletion
      .mockResolvedValueOnce('First rewritten.')
      .mockRejectedValueOnce(providerError(false, 400));
    const job = new DocumentProcessingJob('retry-3', 'First one.\nSecond one.', 'standard', 2, undefined, undefined, 1);

    await job.execute();
    const progress = job.getProgress();
    expect(progress.status).toBe('completed');
    expect(progress.failedChunks).toBe(1);
    expect(progress.progressPercent).toBe(100);
  });
});
