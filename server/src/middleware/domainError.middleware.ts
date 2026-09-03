import { NextFunction, Request, Response } from 'express';
import { DomainError } from '../errors/DomainError';

export function domainErrorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) return;

  const requestId = String(res.getHeader('X-Request-ID') || 'unavailable');
  if (error instanceof DomainError) {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
      retryable: error.retryable,
      requestId,
      ...(error.causeDetail ? { cause: error.causeDetail } : {}),
      ...(error.fix ? { fix: error.fix } : {}),
      ...(error.docUrl ? { docUrl: error.docUrl } : {}),
      ...(error.currentState !== undefined ? { currentState: error.currentState } : {}),
    });
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error('[API Error]', { requestId, method: req.method, path: req.path, error: message });
  if (error instanceof Error && error.stack) {
    console.error('[API Error Stack]', error.stack);
  }
  const showDetails = process.env.NODE_ENV !== 'production' || process.env.EXPOSE_ERROR_DETAILS === 'true' || process.env.DEBUG === 'true';
  res.status(500).json({
    error: showDetails ? message : 'Internal server error',
    code: 'INTERNAL_ERROR',
    retryable: false,
    requestId,
    ...(showDetails ? { details: message } : {}),
  });
}
