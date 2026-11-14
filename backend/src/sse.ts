import { Request, Response } from 'express';

/** True when the client asked for a streamed (Server-Sent Events) response. */
export function wantsStream(req: Request): boolean {
  return req.query.stream === '1' || (req.headers.accept || '').includes('text/event-stream');
}

export interface SseChannel {
  send(event: 'delta' | 'status' | 'done' | 'error', data: unknown): void;
  end(): void;
}

/**
 * Opens a Server-Sent Events response. Events:
 *  - delta  { text }      a piece of generated text
 *  - status { message }   progress note (e.g. "Reading part 2 of 5")
 *  - done   { ...result } the final, authoritative response body
 *  - error  { error }     failure after streaming started
 * A comment heartbeat keeps proxies (e.g. Render) from closing idle connections.
 */
export function openSse(res: Response): SseChannel {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 15000);
  res.on('close', () => clearInterval(heartbeat));

  return {
    send(event, data) {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  };
}

/** Sends the final result either as SSE `done` or as plain JSON. */
export function finish(res: Response, stream: SseChannel | null, body: unknown) {
  if (stream) {
    stream.send('done', body);
    stream.end();
    return;
  }
  res.json(body);
}

/** Reports an error either as SSE `error` (headers already sent) or as JSON with a status code. */
export function fail(res: Response, stream: SseChannel | null, status: number, error: string) {
  if (stream) {
    stream.send('error', { error, status });
    stream.end();
    return;
  }
  if (!res.headersSent) res.status(status).json({ error });
}
