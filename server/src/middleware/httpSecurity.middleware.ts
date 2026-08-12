import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

function configuredOrigins(): Set<string> {
  return new Set(
    (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

export function requestSecurityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.header('x-request-id')?.slice(0, 128) || crypto.randomUUID();
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Cache-Control', 'no-store');

  const origin = req.header('origin');
  if (origin) {
    const allowed = configuredOrigins();
    const sameOrigin = `${req.protocol}://${req.get('host')}`;
    if (origin !== sameOrigin && !allowed.has(origin)) {
      res.status(403).json({ error: 'Origin is not allowed', requestId });
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Organization-ID, X-Request-ID, Idempotency-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const contentLength = Number(req.header('content-length') || 0);
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && contentLength > 0 && !req.is('application/json')) {
    res.status(415).json({ error: 'Content-Type must be application/json', requestId });
    return;
  }

  next();
}
