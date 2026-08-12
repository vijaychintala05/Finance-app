import crypto from 'crypto';
import { NextFunction, Response } from 'express';
import { db } from '../database/db';
import { AuthenticatedRequest } from './organizationIsolation.middleware';
import { newId } from '../utils/ids';
import { isProduction } from '../config/environment';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export async function idempotencyMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!MUTATION_METHODS.has(req.method)) {
    next();
    return;
  }

  const key = req.header('idempotency-key');
  if (!key) {
    if (isProduction()) {
      res.status(400).json({ error: 'Idempotency-Key is required for mutation requests' });
      return;
    }
    next();
    return;
  }

  if (!KEY_PATTERN.test(key)) {
    res.status(400).json({ error: 'Idempotency-Key must be 16-128 safe ASCII characters' });
    return;
  }

  const organizationId = req.auth!.organizationId;
  const requestHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ method: req.method, path: req.originalUrl, body: req.body ?? null }))
    .digest('hex');

  const existing = await db.query(
    `SELECT request_hash, state, response_status, response_body
       FROM api_idempotency_keys
      WHERE organization_id = $1 AND idempotency_key = $2`,
    [organizationId, key]
  );

  if (existing.rows.length > 0) {
    const record = existing.rows[0];
    if ((record.request_hash || record.requestHash) !== requestHash) {
      res.status(409).json({ error: 'Idempotency-Key was already used with a different request' });
      return;
    }
    if (record.state === 'COMPLETED') {
      res.status(Number(record.response_status || 200)).json(record.response_body || record.responseBody);
      return;
    }
    res.status(409).json({ error: 'An identical request is already being processed' });
    return;
  }

  try {
    await db.query(
      `INSERT INTO api_idempotency_keys
        (id, organization_id, idempotency_key, request_hash, method, path, state, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'PROCESSING', $7)`,
      [newId('idem'), organizationId, key, requestHash, req.method, req.path, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()]
    );
  } catch {
    res.status(409).json({ error: 'An identical request is already being processed' });
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const status = res.statusCode;
    db.query(
      `UPDATE api_idempotency_keys
          SET state = $1, response_status = $2, response_body = $3
        WHERE organization_id = $4 AND idempotency_key = $5`,
      [status < 500 ? 'COMPLETED' : 'FAILED', status, JSON.stringify(body), organizationId, key]
    ).then(() => {
      originalJson(body);
    }).catch((error) => {
      console.error('Idempotency result could not be persisted', error);
      if (!res.headersSent) {
        res.status(500);
        originalJson({ error: 'Request outcome could not be made retry-safe. Contact support with the request ID.' });
      }
    });
    return res;
  }) as Response['json'];

  next();
}
