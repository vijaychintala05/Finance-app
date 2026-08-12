// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../api/client';

describe('API mutation reliability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reuses the idempotency key after an uncertain network outcome', async () => {
    localStorage.setItem('active_organization_id', 'org-a');
    const keys: string[] = [];
    let attempt = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      keys.push(new Headers(init?.headers).get('Idempotency-Key') || '');
      attempt += 1;
      if (attempt === 1) throw new Error('connection closed before response');
      return new Response(JSON.stringify({ id: 'exp-1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    const client = new ApiClient('/api/v1');
    const first = await client.post('/finance/expenses', { amount: 10 });
    const retry = await client.post('/finance/expenses', { amount: 10 });

    expect(first.data).toBeNull();
    expect(retry.data).toEqual({ id: 'exp-1' });
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it('uses a new key after success and isolates pending retries by tenant', async () => {
    localStorage.setItem('active_organization_id', 'org-a');
    const keys: string[] = [];
    let shouldFail = true;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      keys.push(new Headers(init?.headers).get('Idempotency-Key') || '');
      if (shouldFail) {
        shouldFail = false;
        throw new Error('uncertain outcome');
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    const client = new ApiClient('/api/v1');
    await client.post('/finance/expenses', { amount: 10 });
    localStorage.setItem('active_organization_id', 'org-b');
    await client.post('/finance/expenses', { amount: 10 });
    await client.post('/finance/expenses', { amount: 10 });

    expect(keys[1]).not.toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});
