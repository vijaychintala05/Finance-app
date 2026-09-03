import crypto from 'crypto';
import { NextFunction, Response } from 'express';
import { db } from '../database/db';
import { AuthenticatedRequest } from './organizationIsolation.middleware';
import { newId } from '../utils/ids';
import { isProduction } from '../config/environment';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const RETENTION_DAYS = 365;

interface CapturedResponse {
  status: number;
  body: unknown;
}

class RollbackCapturedResponse extends Error {
  constructor(public readonly response: CapturedResponse) {
    super('Mutation returned a server error and was rolled back');
  }
}

function captureDownstreamResponse(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<CapturedResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;

    res.json = ((body: unknown) => {
      if (!settled) {
        settled = true;
        resolve({ status: res.statusCode, body });
      }
      return res;
    }) as Response['json'];

    try {
      next();
    } catch (error) {
      reject(error);
    }
  });
}

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
  const originalJson = res.json.bind(res);

  try {
    // This transaction owns every production mutation. Keep the organization
    // context explicit here so downstream nested writes retain their PostgreSQL
    // RLS scope even when Express continues the middleware chain asynchronously.
    const outcome = await db.withOrganizationContext(organizationId, () => db.transaction<CapturedResponse>(async (client) => {
      const existing = await client.query(
        `SELECT request_hash, state, response_status, response_body
           FROM api_idempotency_keys
          WHERE organization_id = $1 AND idempotency_key = $2
          FOR UPDATE`,
        [organizationId, key]
      );

      if (existing.rows.length > 0) {
        const record = existing.rows[0];
        if ((record.request_hash || record.requestHash) !== requestHash) {
          return { status: 409, body: { error: 'Idempotency-Key was already used with a different request' } };
        }
        if (record.state === 'COMPLETED') {
          return {
            status: Number(record.response_status || 200),
            body: record.response_body ?? record.responseBody,
          };
        }
        return { status: 409, body: { error: 'An identical request is already being processed' } };
      }

      await client.query(
        `INSERT INTO api_idempotency_keys
          (id, organization_id, idempotency_key, request_hash, method, path, state, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'PROCESSING', $7)`,
        [
          newId('idem'), organizationId, key, requestHash, req.method, req.path,
          new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        ]
      );

      const captured = await captureDownstreamResponse(req, res, next);
      if (captured.status >= 500) throw new RollbackCapturedResponse(captured);

      await client.query(
        `UPDATE api_idempotency_keys
            SET state = 'COMPLETED', response_status = $1, response_body = $2
          WHERE organization_id = $3 AND idempotency_key = $4`,
        [captured.status, JSON.stringify(captured.body), organizationId, key]
      );
      return captured;
    }, { organizationId }));

    res.json = originalJson as Response['json'];
    res.status(outcome.status);
    originalJson(outcome.body);
  } catch (error) {
    res.json = originalJson as Response['json'];
    if (error instanceof RollbackCapturedResponse) {
      res.status(error.response.status);
      originalJson(error.response.body);
      return;
    }
    if ((error as any)?.code === '23505') {
      res.status(409);
      originalJson({ error: 'An identical request is already being processed' });
      return;
    }
    next(error);
  }
}
