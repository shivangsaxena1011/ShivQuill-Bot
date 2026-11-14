import { describe, it, expect } from 'vitest';
import { taskQueue } from '../queue.js';

describe('Task Queue Engine', () => {
  it('creates unique UUIDs for tasks', () => {
    const id1 = taskQueue.createTask();
    const id2 = taskQueue.createTask();
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
  });

  it('updates task completion state and result', () => {
    const id = taskQueue.createTask<{ output: string }>();
    expect(taskQueue.getTask(id)?.done).toBe(false);

    taskQueue.completeTask(id, { output: 'Success' });
    const completed = taskQueue.getTask<{ output: string }>(id);
    expect(completed?.done).toBe(true);
    expect(completed?.result?.output).toBe('Success');
  });

  it('records task failure', () => {
    const id = taskQueue.createTask();
    taskQueue.failTask(id, 'API rate limit exceeded');
    const failed = taskQueue.getTask(id);
    expect(failed?.done).toBe(true);
    expect(failed?.error).toBe('API rate limit exceeded');
  });
});
