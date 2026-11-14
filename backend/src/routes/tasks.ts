import { Router, Request, Response } from 'express';
import { taskQueue } from '../queue.js';

export const tasksRouter = Router();

tasksRouter.get('/:id', (req: Request, res: Response) => {
  const task = taskQueue.getTask(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found or expired' });
  }

  return res.json(task);
});
