import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { StructuredLogger } from '../utils/logger';
import { requestCorrelationMiddleware } from '../middleware/requestCorrelation.middleware';
import { MetricsController } from '../controllers/MetricsController';
import app from '../index';

describe('Non-Functional Batch 2: Structured JSON Logging, Correlation & Telemetry', () => {
  it('1. StructuredLogger outputs single-line valid JSON with expected properties', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      StructuredLogger.runWithContext({ requestId: 'req-test-123', organizationId: 'org-test-1' }, () => {
        StructuredLogger.info('TEST_LOG_EVENT', { sampleKey: 'sampleValue', durationMs: 42 });
      });

      expect(consoleSpy).toHaveBeenCalled();
      const lastCallArg = consoleSpy.mock.calls[consoleSpy.mock.calls.length - 1][0];
      const parsed = JSON.parse(lastCallArg);

      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('TEST_LOG_EVENT');
      expect(parsed.requestId).toBe('req-test-123');
      expect(parsed.organizationId).toBe('org-test-1');
      expect(parsed.sampleKey).toBe('sampleValue');
      expect(parsed.durationMs).toBe(42);
      expect(typeof parsed.timestamp).toBe('string');
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('2. StructuredLogger serializes Error exceptions with stack and code', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const testErr = new Error('Database connection failed');
      (testErr as any).code = 'ECONNREFUSED';

      StructuredLogger.error('OPERATION_FAILED', testErr, { queryTarget: 'accounts' });

      expect(errorSpy).toHaveBeenCalled();
      const lastCallArg = errorSpy.mock.calls[errorSpy.mock.calls.length - 1][0];
      const parsed = JSON.parse(lastCallArg);

      expect(parsed.level).toBe('error');
      expect(parsed.message).toBe('OPERATION_FAILED');
      expect(parsed.queryTarget).toBe('accounts');
      expect(parsed.error).toBeDefined();
      expect(parsed.error.message).toBe('Database connection failed');
      expect(parsed.error.code).toBe('ECONNREFUSED');
      expect(parsed.error.stack).toBeDefined();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('3. requestCorrelationMiddleware generates x-request-id if missing and preserves if provided', async () => {
    const testApp = express();
    testApp.use(requestCorrelationMiddleware);
    testApp.get('/test-correlation', (_req, res) => {
      res.json({ ok: true });
    });

    // Case A: Missing header -> generates unique id
    const resA = await request(testApp).get('/test-correlation');
    expect(resA.status).toBe(200);
    expect(resA.headers['x-request-id']).toBeDefined();
    expect(String(resA.headers['x-request-id'])).toMatch(/^req-/);

    // Case B: Existing header -> preserves client provided id
    const customId = 'client-trace-id-9999';
    const resB = await request(testApp)
      .get('/test-correlation')
      .set('x-request-id', customId);
    expect(resB.status).toBe(200);
    expect(resB.headers['x-request-id']).toBe(customId);
  });

  it('4. Exposes Prometheus metrics at /api/readyz/metrics and /api/v1/metrics', async () => {
    const res1 = await request(app).get('/api/readyz/metrics');
    expect(res1.status).toBe(200);
    expect(res1.headers['content-type']).toContain('text/plain');
    expect(res1.text).toContain('process_uptime_seconds');
    expect(res1.text).toContain('nodejs_heap_size_used_bytes');
    expect(res1.text).toContain('firmbooks_database_connected');

    const res2 = await request(app).get('/api/v1/metrics');
    expect(res2.status).toBe(200);
    expect(res2.headers['content-type']).toContain('text/plain');
    expect(res2.text).toContain('process_uptime_seconds');
  });
});
