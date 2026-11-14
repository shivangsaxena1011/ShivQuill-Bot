import { Response } from 'express';

/**
 * Returns an AbortSignal that fires if the client disconnects before the response is sent,
 * so in-flight provider calls stop instead of burning tokens for nobody.
 */
export function abortOnClientDisconnect(res: Response, onAbort?: () => void): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) {
      controller.abort();
      onAbort?.();
    }
  });
  return controller.signal;
}

export function isAbortError(err: any): boolean {
  return err?.name === 'AbortError' || err?.name === 'JobCancelledError';
}
