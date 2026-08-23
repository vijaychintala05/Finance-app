import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../index';

describe('CORS and HTTP Security Regression Tests', () => {
  const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

  beforeEach(() => {
    process.env.ALLOWED_ORIGINS = 'https://app.firmbooks.io,https://staging.firmbooks.io';
  });

  afterEach(() => {
    process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
  });

  it('1. Allows requests without Origin header (e.g. server-to-server, cURL)', async () => {
    const res = await request(app).get('/api/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('2. Allows requests with configured origin in ALLOWED_ORIGINS', async () => {
    const res = await request(app)
      .get('/api/healthz')
      .set('Origin', 'https://app.firmbooks.io');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://app.firmbooks.io');
    expect(res.headers['vary']).toContain('Origin');
  });

  it('3. Allows requests with staging configured origin', async () => {
    const res = await request(app)
      .get('/api/healthz')
      .set('Origin', 'https://staging.firmbooks.io');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://staging.firmbooks.io');
  });

  it('4. Rejects requests with arbitrary unconfigured origin with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/healthz')
      .set('Origin', 'https://malicious-site.com');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Origin is not allowed/i);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('5. Handles OPTIONS preflight request for allowed origin with 204 No Content', async () => {
    const res = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'https://app.firmbooks.io');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://app.firmbooks.io');
    expect(res.headers['access-control-allow-methods']).toBeDefined();
    expect(res.headers['access-control-allow-headers']).toBeDefined();
  });

  it('6. Rejects OPTIONS preflight request for unconfigured origin with 403 Forbidden', async () => {
    const res = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'https://unauthorized-domain.com');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Origin is not allowed/i);
  });

  it('7. Enforces application/json Content-Type for POST requests with body', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'text/plain')
      .send('plain text payload');

    expect(res.status).toBe(415);
    expect(res.body.error).toMatch(/Content-Type must be application\/json/i);
  });
});
