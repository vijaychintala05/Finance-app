import { afterEach, describe, expect, it, vi } from 'vitest';
import { BankingService } from '../services/bankingService';

function success(data: unknown): Response {
  return {
    ok: true,
    status: 201,
    json: async () => ({ success: true, data }),
    headers: { get: () => null },
  } as unknown as Response;
}

describe('banking canonical write retries', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reuses the same idempotency key after a lost response, then clears it after a receipt', async () => {
    const receipt = {
      allocationId: 'allocation-1', statementTransactionId: 'statement-1', journalLineId: 'line-1',
      journalEntryId: 'journal-1', amount: '42.50', statementStatus: 'MATCHED',
    };
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('connection closed after server commit'))
      .mockResolvedValueOnce(success(receipt))
      .mockResolvedValueOnce(success({ ...receipt, allocationId: 'allocation-2' }));
    vi.stubGlobal('fetch', fetchMock);
    const input = { statementTransactionId: 'statement-1', journalLineId: 'line-1', amount: '42.50' };

    await expect(BankingService.allocateBookMovement(input)).rejects.toThrow('connection closed after server commit');
    await expect(BankingService.allocateBookMovement(input)).resolves.toMatchObject(receipt);
    await BankingService.allocateBookMovement(input);

    const firstKey = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const retryKey = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    const nextOperationKey = (fetchMock.mock.calls[2][1] as RequestInit).headers as Record<string, string>;
    expect(firstKey['Idempotency-Key']).toBe(retryKey['Idempotency-Key']);
    expect(nextOperationKey['Idempotency-Key']).not.toBe(firstKey['Idempotency-Key']);
  });

  it('sends the selected statement-created allocation with a stable reversal command', async () => {
    const fetchMock = vi.fn().mockResolvedValue(success({ statementTransactionId: 'statement-2', reversalJournalEntryId: 'journal-reversal-2' }));
    vi.stubGlobal('fetch', fetchMock);
    await BankingService.reverseCreatedTransactionFromStatement('statement-2', 'allocation-2', 'Reverse selected entry');
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({ allocationId: 'allocation-2', reason: 'Reverse selected entry' });
    expect((request.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
  });

  it.each([
    ['import confirmation', () => BankingService.confirmImport({
      fileContent: 'Date,Description,Debit,Credit', filename: 'statement.csv', mode: 'USE_EXISTING', bankAccountId: 'bank-1',
    })],
    ['reconciliation close', () => BankingService.completeReconciliationSession('bank-2', '2026-09-30', 100, 100)],
    ['reconciliation reopen', () => BankingService.reopenReconciliation('bank-3')],
  ])('reuses the idempotency key for an ambiguous %s response', async (_label, operation) => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('connection closed after server commit')).mockResolvedValueOnce(success({ reopened: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(operation()).rejects.toThrow('connection closed after server commit');
    await operation();
    const first = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const retry = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(first['Idempotency-Key']).toBe(retry['Idempotency-Key']);
  });
});
