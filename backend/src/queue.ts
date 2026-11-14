import { v4 as uuidv4 } from 'uuid';
import { TaskStatus } from './types.js';

class TaskQueue {
  private tasks = new Map<string, TaskStatus>();
  private readonly ttlMs: number;
  private readonly maxCapacity: number;

  constructor(ttlMinutes = 15, maxCapacity = 5000) {
    this.ttlMs = ttlMinutes * 60 * 1000;
    this.maxCapacity = maxCapacity;

    // Periodic sweep every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000).unref();
  }

  public createTask<T>(): string {
    if (this.tasks.size >= this.maxCapacity) {
      this.cleanup(true); // Forced aggressive cleanup
    }

    const id = uuidv4();
    const task: TaskStatus<T> = {
      id,
      done: false,
      createdAt: Date.now()
    };

    this.tasks.set(id, task);
    return id;
  }

  public getTask<T>(id: string): TaskStatus<T> | undefined {
    return this.tasks.get(id) as TaskStatus<T> | undefined;
  }

  public completeTask<T>(id: string, result: T): void {
    const task = this.tasks.get(id);
    if (task) {
      task.done = true;
      task.result = result;
    }
  }

  public failTask(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.done = true;
      task.error = error;
    }
  }

  public cleanup(aggressive = false): void {
    const now = Date.now();
    const expiry = aggressive ? this.ttlMs / 2 : this.ttlMs;

    for (const [id, task] of this.tasks.entries()) {
      if (now - task.createdAt > expiry) {
        this.tasks.delete(id);
      }
    }
  }

  public get size(): number {
    return this.tasks.size;
  }
}

export const taskQueue = new TaskQueue();
