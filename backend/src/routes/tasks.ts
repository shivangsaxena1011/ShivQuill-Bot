import { Router, Request, Response } from 'express';
import { taskQueue } from '../queue.js';
import { documentJobRegistry } from '../chunkOrchestrator.js';
import { buildParaphraseResponse } from './paraphrase.js';

export const tasksRouter = Router();

tasksRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  // 1. Check Document Job Registry
  const docJob = documentJobRegistry.get(id);
  if (docJob) {
    const progress = docJob.getProgress();
    if (progress.status === 'completed') {
      return res.json({ ...progress, result: buildParaphraseResponse(docJob) });
    }
    return res.json(progress);
  }

  // 2. Check Standard Task Queue
  const task = taskQueue.getTask(id);
  if (task) {
    return res.json(task);
  }

  return res.status(404).json({ error: 'Task not found or expired' });
});

tasksRouter.post('/:id/cancel', (req: Request, res: Response) => {
  const { id } = req.params;
  const cancelled = documentJobRegistry.cancel(id);
  if (!cancelled) {
    return res.status(404).json({ error: 'Task not found or already completed.' });
  }
  return res.json({ status: 'cancelled', taskId: id });
});

tasksRouter.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const cancelled = documentJobRegistry.cancel(id);
  return res.json({ status: cancelled ? 'cancelled' : 'not_found', taskId: id });
});
