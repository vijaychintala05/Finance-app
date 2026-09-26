import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../api/client';

describe('ApiClient successful empty responses', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([200, 201, 202, 204, 205])('treats an empty HTTP %i response as a successful no-content result', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
    const client = new ApiClient('/api/v1');

    const response = await client.delete('/finance/time-entries/time-1');

    expect(response).toMatchObject({ data: null, error: null, status });
    expect(response.errorCode).toBeUndefined();
  });

  it('continues parsing JSON success and structured error responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'invoice-1' }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Billed time cannot be deleted', code: 'VALIDATION_ERROR' }), { status: 422, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('/api/v1');

    const created = await client.post('/finance/invoices', { projectId: 'project-1' });
    const rejected = await client.delete('/finance/time-entries/time-1');

    expect(created.data).toEqual({ id: 'invoice-1' });
    expect(created.error).toBeNull();
    expect(rejected).toMatchObject({ data: null, error: 'Billed time cannot be deleted', status: 422, errorCode: 'VALIDATION_ERROR' });
  });

  it('clears an idempotency key after a definitive 409 business rejection', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'No unbilled billable time', code: 'VALIDATION_ERROR' }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'invoice-1' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('/api/v1');
    const payload = { issueDate: '2026-09-23', dueDate: '2026-09-23' };

    await client.post('/finance/projects/project-1/invoice-unbilled-time', payload);
    await client.post('/finance/projects/project-1/invoice-unbilled-time', payload);

    const firstKey = new Headers(fetchMock.mock.calls[0][1].headers).get('Idempotency-Key');
    const secondKey = new Headers(fetchMock.mock.calls[1][1].headers).get('Idempotency-Key');
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBeTruthy();
    expect(secondKey).not.toBe(firstKey);
  });

  it('retains the idempotency key after an in-progress 409', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Identical request is already being processed', code: 'COMMAND_IN_PROGRESS' }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'invoice-1' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('/api/v1');
    const payload = { issueDate: '2026-09-23', dueDate: '2026-09-23' };

    await client.post('/finance/projects/project-1/invoice-unbilled-time', payload);
    await client.post('/finance/projects/project-1/invoice-unbilled-time', payload);

    const firstKey = new Headers(fetchMock.mock.calls[0][1].headers).get('Idempotency-Key');
    const secondKey = new Headers(fetchMock.mock.calls[1][1].headers).get('Idempotency-Key');
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
  });

  it('pins a mutation and its idempotency fingerprint to the requested organization', async () => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'active_organization_id' ? 'org-2' : null });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ item: { id: 'item-1' } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('/api/v1');

    await client.put('/items/item-1', { name: 'Updated' }, 'org-1');

    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('X-Organization-ID')).toBe('org-1');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Idempotency-Key')).toBeTruthy();
  });
  it('reuses an item mutation idempotency key after a network timeout', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ item: { id: 'item-2' } }), { status: 201, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('/api/v1');
    const draft = { name: 'Consulting', salesRate: 120 };

    const first = await client.post('/items', draft, 'org-1');
    const second = await client.post('/items', draft, 'org-1');

    expect(first).toMatchObject({ errorCode: 'NETWORK_FAILURE', retryable: true });
    expect(second.error).toBeNull();
    const firstHeaders = new Headers(fetchMock.mock.calls[0][1].headers);
    const secondHeaders = new Headers(fetchMock.mock.calls[1][1].headers);
    expect(firstHeaders.get('X-Organization-ID')).toBe('org-1');
    expect(secondHeaders.get('X-Organization-ID')).toBe('org-1');
    expect(firstHeaders.get('Idempotency-Key')).toBeTruthy();
    expect(secondHeaders.get('Idempotency-Key')).toBe(firstHeaders.get('Idempotency-Key'));
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify(draft));
  });
  it('proves only the exact org/body has a retained retry key', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('connection reset')));
    const client = new ApiClient('/api/v1');
    const payload = { projectId: 'project-1', taskName: 'Review', hours: 1.25 };

    await client.post('/finance/time-entries', payload, 'org-1');

    expect(await client.hasPendingPostIdempotencyKey('/finance/time-entries', payload, 'org-1')).toBe(true);
    expect(await client.hasPendingPostIdempotencyKey('/finance/time-entries', { ...payload, hours: 1.5 }, 'org-1')).toBe(false);
    expect(await client.hasPendingPostIdempotencyKey('/finance/time-entries', payload, 'org-2')).toBe(false);
  });
  it('pins a read to its captured organization when the active organization changes', async () => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'active_organization_id' ? 'org-2' : null });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('/api/v1');

    await client.get('/finance/invoices', 'org-1');

    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('X-Organization-ID')).toBe('org-1');
  });
  it('pins blob downloads to the captured organization', async () => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'active_organization_id' ? 'org-current' : null });
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(['report']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('/api/v1');

    const response = await client.getBlob('/finance/reports/export', 'org-captured');

    expect(response.error).toBeNull();
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('X-Organization-ID')).toBe('org-captured');
  });
});

describe('ApiClient time-entry operation receipts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('persists the exact caller key in mutation metadata and sends it to the scoped status lookup', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{malformed', { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ state: 'COMPLETED', responseStatus: 201, entryId: 'time-1' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('/api/v1');
    const payload = { projectId: 'project-1', taskName: 'Review', hours: 1 };
    const key = 'operation-key-123456789';

    const post = await client.post('/finance/time-entries', payload, 'org-1', key);
    const status = await client.getTimeEntryCreateOperationStatus(key, 'org-1');

    expect(post).toMatchObject({ errorCode: 'NETWORK_FAILURE', idempotencyKey: key });
    expect(status.data).toEqual({ state: 'COMPLETED', responseStatus: 201, entryId: 'time-1' });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Idempotency-Key')).toBe(key);
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('Idempotency-Key')).toBe(key);
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('X-Organization-ID')).toBe('org-1');
  });
});

describe('ApiClient invoice create operation receipts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hashes the exact create payload and sends that hash with the scoped status lookup', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: 'UNKNOWN' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('/api/v1');
    const payload = { clientId: 'client-1', issueDate: '2026-09-24', items: [{ description: 'Consulting', quantity: 1 }] };
    const hash = await client.createOperationRequestHash('POST', '/finance/invoices', payload);
    const sameHash = await client.createOperationRequestHash('POST', '/finance/invoices', payload);
    const changedHash = await client.createOperationRequestHash('POST', '/finance/invoices', { ...payload, issueDate: '2026-09-25' });

    await client.getInvoiceCreateOperationStatus('invoice-create-key-123456', hash, 'org-1');

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(sameHash).toBe(hash);
    expect(changedHash).not.toBe(hash);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/finance/invoices/create-operation-status');
    expect(headers.get('X-Organization-ID')).toBe('org-1');
    expect(headers.get('Idempotency-Key')).toBe('invoice-create-key-123456');
    expect(headers.get('X-Operation-Request-Hash')).toBe(hash);
  });
});

describe('ApiClient invoice void operation receipts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('encodes multiline Unicode reasons safely for exact status verification', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: 'UNKNOWN' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('/api/v1');
    const reason = 'First line\nCustomer requested correction — café';

    await client.getInvoiceVoidOperationStatus('invoice-1', 'invoice-void-key-123456', 'org-1', reason);

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    const encoded = headers.get('X-Operation-Reason-Base64');
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    const standard = encoded!.replace(/-/g, '+').replace(/_/g, '/');
    const binary = globalThis.atob(standard + '='.repeat((4 - standard.length % 4) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe(reason);
  });
});