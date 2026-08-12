import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { db } from '../database/db';

export function persistentRateLimit(namespace: string, maxRequests: number, windowSeconds: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawKey = `${namespace}:${req.ip || 'unknown'}:${req.params.token || ''}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const resetCutoffIso = new Date(now - windowSeconds * 1000).toISOString();

    try {
      // One statement handles both first use and concurrent increments. A
      // SELECT-then-INSERT sequence races when multiple workers see no row.
      const result = await db.query(
        `INSERT INTO public_rate_limits (key_hash, request_count, window_started_at)
         VALUES ($1, 1, $2)
         ON CONFLICT (key_hash) DO UPDATE SET
           request_count = CASE
             WHEN public_rate_limits.window_started_at <= $3 THEN 1
             ELSE public_rate_limits.request_count + 1
           END,
           window_started_at = CASE
             WHEN public_rate_limits.window_started_at <= $3 THEN $2
             ELSE public_rate_limits.window_started_at
           END
         RETURNING request_count, window_started_at`,
        [keyHash, nowIso, resetCutoffIso]
      );
      const count = Number(result.rows[0]?.request_count || 0);
      const startedAt = new Date(result.rows[0]?.window_started_at || nowIso).getTime();
      const elapsedMs = Math.max(0, now - startedAt);
      const status = {
        allowed: count <= maxRequests,
        retryAfter: count <= maxRequests ? 0 : Math.max(1, Math.ceil(windowSeconds - elapsedMs / 1000)),
      };

      if (!status.allowed) {
        res.setHeader('Retry-After', String(status.retryAfter));
        res.status(429).json({ error: 'Too many requests. Try again later.' });
        return;
      }
      next();
    } catch (error) {
      console.error('Persistent rate limiter unavailable', error);
      res.status(503).json({ error: 'Request protection service is unavailable. Try again later.' });
    }
  };
}
