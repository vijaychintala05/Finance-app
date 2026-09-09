import { Request, Response, NextFunction } from 'express';
import { StructuredLogger } from '../utils/logger';

export function requestCorrelationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.trim()
    ? incomingId.trim()
    : `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  res.setHeader('x-request-id', requestId);

  const startTime = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const organizationId = (req as any).organizationId || (req as any).user?.organizationId;
    const userId = (req as any).user?.id || (req as any).user?.userId;

    StructuredLogger.log('info', 'HTTP_REQUEST_COMPLETED', {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      ...(organizationId ? { organizationId } : {}),
      ...(userId ? { userId } : {}),
    });
  });

  StructuredLogger.runWithContext({ requestId }, () => {
    next();
  });
}
