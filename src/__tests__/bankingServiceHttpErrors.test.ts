// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../api/client';
import { BankingService } from '../services/bankingService';
import { isUncertainMutationOutcome, mutationExceptionNotice } from '../utils/operationNotice';

const httpResponse = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(
  typeof body === 'string' ? body : JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json', ...headers } },
);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('active_organization_id', 'org-a');
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('BankingService HTTP error metadata', () => {
  it.each([400, 403])('preserves deterministic HTTP %i rejection and request metadata', async (status) => {
    vi.mocked(fetch).mockResolvedValue(httpResponse(status, {
      error: 'Bank account setup rejected', code: 'BANK_SETUP_INVALID', requestId: 'req-body', recovery: 'Correct the bank details.',
    }, { 'x-request-id': 'req-header' }));

    const error = await BankingService.createAccount({ accountName: 'Operating' }).then(() => null, (cause) => cause as ApiRequestError);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      response: { status, error: 'Bank account setup rejected', errorCode: 'BANK_SETUP_INVALID', requestId: 'req-body', recovery: 'Correct the bank details.' },
    });
    expect(isUncertainMutationOutcome(error!.response)).toBe(false);
  });

  it('uses the request-id header when an error body omits it and treats 5xx as uncertain', async () => {
    vi.mocked(fetch).mockResolvedValue(httpResponse(500, { error: 'Banking unavailable' }, { 'x-request-id': 'req-header-only' }));
    const error = await BankingService.createAccount({ accountName: 'Operating' }).then(() => null, (cause) => cause as ApiRequestError);
    expect(error).toMatchObject({ response: { status: 500, error: 'Banking unavailable', requestId: 'req-header-only' } });
    expect(isUncertainMutationOutcome(error!.response)).toBe(true);
    expect(mutationExceptionNotice(error, { action: 'Bank setup' }).tone).toBe('warning');
  });

  it('accepts bank creation only with a valid linked tenant receipt', async () => {
    const bank = { id: 'bank-1', organizationId: 'org-a', ledgerAccountId: 'ledger-1', accountName: 'Operating', accountNumber: '•••• 1234' };
    vi.mocked(fetch).mockResolvedValue(httpResponse(201, { success: true, data: bank }));
    await expect(BankingService.createAccount({ ledgerAccountId: 'ledger-1', accountName: 'Operating' })).resolves.toMatchObject(bank);
  });

  it.each([
    ['empty body', () => new Response(null, { status: 201, headers: { 'x-request-id': 'req-empty' } })],
    ['unsuccessful envelope', () => httpResponse(200, { success: false, error: 'Bank setup failed' }, { 'x-request-id': 'req-false' })],
    ['wrong ledger link', () => httpResponse(201, { success: true, data: { id: 'bank-1', organizationId: 'org-a', ledgerAccountId: 'other-ledger' } }, { 'x-request-id': 'req-link' })],
  ])('rejects a 2xx %s bank create response as an uncertain malformed receipt', async (_label, makeResponse) => {
    vi.mocked(fetch).mockResolvedValue(makeResponse());
    const error = await BankingService.createAccount({ ledgerAccountId: 'ledger-1', accountName: 'Operating' }).then(() => null, (cause) => cause as ApiRequestError);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error!.response).toMatchObject({ status: 500, errorCode: 'MALFORMED_SUCCESS_RECEIPT' });
    expect(isUncertainMutationOutcome(error!.response)).toBe(true);
  });

  it('keeps fallback status text for non-JSON HTTP errors', async () => {
    vi.mocked(fetch).mockResolvedValue(httpResponse(403, 'Forbidden', { 'x-request-id': 'req-non-json' }));
    await expect(BankingService.createAccount({ accountName: 'Operating' })).rejects.toMatchObject({
      response: { status: 403, error: 'Banking request failed (403)', requestId: 'req-non-json' },
    });
  });

  it('leaves network rejection as an uncertain client error', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(BankingService.createAccount({ accountName: 'Operating' })).rejects.toThrow('Failed to fetch');
    expect(mutationExceptionNotice(new TypeError('Failed to fetch'), { action: 'Bank setup' }).tone).toBe('warning');
  });
});
