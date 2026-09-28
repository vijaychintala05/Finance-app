/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BankAccountWorkspace } from '../components/banking/BankAccountWorkspace';

const serviceMocks = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  getBookMovements: vi.fn(),
  getBookMovementSuggestions: vi.fn(),
  getCanonicalStatementReceipt: vi.fn(),
  reviewStatementTransaction: vi.fn(),
  allocateBookMovement: vi.fn(),
  createMissingEntryFromStatement: vi.fn(),
}));
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../services/bankingService', () => ({ BankingService: serviceMocks }));
vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return { ...actual, apiClient: apiMocks };
});
vi.mock('../capabilities/useFinanceCapabilities', () => ({
  useFinanceCapabilities: () => ({
    loading: false, capabilities: [], getCapability: () => undefined,
    isEnabled: (key: string) => key === 'bank-movement-allocations' || key === 'bank-statement-entry-creation',
  }),
}));

const account = { id: 'ledger-bank-resolution', code: '1001', name: 'Operating Bank', type: 'Asset', subType: 'Bank', balance: 1000 } as any;
const bankAccount = { id: 'bank-resolution', organizationId: 'org-resolution', ledgerAccountId: account.id, accountName: 'Operating', currency: 'INR', currentBalance: 1000, status: 'Active', isActive: true } as any;
const statement = (status: string) => ({
  id: 'statement-resolution', organizationId: 'org-resolution', bankAccountId: bankAccount.id, statementImportId: 'import-resolution',
  transactionDate: '2026-09-15', amount: 50, direction: 'DEBIT', narration: 'Office supplies', reference: 'REF-50', currency: 'INR',
  reconciliationStatus: status, fingerprint: 'statement-fingerprint', createdAt: '2026-09-15T12:00:00Z',
});

function renderWorkspace(row: ReturnType<typeof statement>) {
  return render(<BankAccountWorkspace
    account={account} bankAccount={bankAccount} journalEntries={[]} currencySymbol="₹"
    onBackToOverview={vi.fn()} onImportStatement={vi.fn()} onReconcile={vi.fn()}
    onTransferFunds={vi.fn()} onRecordTransaction={vi.fn()} onOpenMatch={vi.fn()}
    onOpenCategorize={vi.fn()} onSelectTxDetails={vi.fn()} onRefresh={vi.fn()} refreshTrigger={1}
  />);
}

describe('Bank statement resolution workflow', () => {
  beforeEach(() => {
    serviceMocks.getWorkspace.mockResolvedValue({ transactions: [statement('TO_REVIEW')], balances: {} });
    serviceMocks.getBookMovementSuggestions.mockResolvedValue([{
      movementId: 'journal-line-resolution', journalEntryId: 'journal-resolution', entryNumber: 'JE-50',
      date: '2026-09-15', amount: 50, direction: 'OUTFLOW', reference: 'REF-50', description: 'Office supplies',
      confidenceScore: 100, reasons: ['Exact amount'], readonlyOnly: true,
    }]);
    serviceMocks.getCanonicalStatementReceipt.mockResolvedValue({ statementTransactionId: 'statement-resolution', statementStatus: 'UNMATCHED', reviewDecision: 'ACCEPT', legacyMatches: [], allocations: [] });
    serviceMocks.reviewStatementTransaction.mockResolvedValue({ statementTransactionId: 'statement-resolution', decision: 'ACCEPT', status: 'UNMATCHED', candidateIds: [] });
    serviceMocks.allocateBookMovement.mockResolvedValue({ allocationId: 'allocation-resolution', statementTransactionId: 'statement-resolution', journalLineId: 'journal-line-resolution', journalEntryId: 'journal-resolution', amount: '50.00', statementStatus: 'MATCHED' });
    serviceMocks.createMissingEntryFromStatement.mockResolvedValue({ journalEntryId: 'journal-created', journalLineId: 'line-created', allocationId: 'allocation-created', amount: '50.00', statementStatus: 'MATCHED' });
    apiMocks.get.mockResolvedValue({ data: [{ id: 'expense-supplies', code: '6001', name: 'Office Supplies', type: 'Expense', status: 'Active' }], error: null, status: 200 });
  });

  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('requires explicit confirmation before a new imported line becomes allocatable', async () => {
    serviceMocks.getWorkspace.mockResolvedValue({ transactions: [statement('TO_REVIEW')], balances: {} });
    renderWorkspace(statement('TO_REVIEW'));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm line' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm genuine line' }));
    await waitFor(() => expect(serviceMocks.reviewStatementTransaction).toHaveBeenCalledWith({
      statementTransactionId: 'statement-resolution', decision: 'ACCEPT', acknowledgedCandidateIds: [],
    }));
  });

  it('lets the user confirm a suggested posted journal line and exact amount', async () => {
    serviceMocks.getWorkspace.mockResolvedValue({ transactions: [statement('UNMATCHED')], balances: {} });
    renderWorkspace(statement('UNMATCHED'));
    fireEvent.click(await screen.findByRole('button', { name: 'Find match' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm match' }));
    await waitFor(() => expect(serviceMocks.allocateBookMovement).toHaveBeenCalledWith({
      statementTransactionId: 'statement-resolution', journalLineId: 'journal-line-resolution', amount: '50.00',
    }));
  });

  it('posts and links a simple expense from the bank statement using an allowed expense account', async () => {
    serviceMocks.getWorkspace.mockResolvedValue({ transactions: [statement('UNMATCHED')], balances: {} });
    renderWorkspace(statement('UNMATCHED'));
    fireEvent.click(await screen.findByRole('button', { name: 'Add simple entry' }));
    const accountSelect = await screen.findByLabelText('Expense account');
    fireEvent.change(accountSelect, { target: { value: 'expense-supplies' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post and link entry' }));
    await waitFor(() => expect(serviceMocks.createMissingEntryFromStatement).toHaveBeenCalledWith(expect.objectContaining({
      statementTransactionId: 'statement-resolution', counterAccountId: 'expense-supplies', expectedRemainderAmount: '50.00', description: 'Office supplies',
    })));
  });

  it('shows partially matched status and the exact remainder before creation', async () => {
    serviceMocks.getWorkspace.mockResolvedValue({ transactions: [statement('PARTIALLY_MATCHED')], balances: {} });
    serviceMocks.getCanonicalStatementReceipt.mockResolvedValue({
      statementTransactionId: 'statement-resolution', statementStatus: 'PARTIALLY_MATCHED', reviewDecision: 'ACCEPT', legacyMatches: [],
      allocations: [{ allocationId: 'allocation-existing', journalLineId: 'line-existing', journalEntryId: 'journal-existing', entryNumber: 'JE-1', reversalJournalEntryId: null, reversalEntryNumber: null, amount: '20.00', allocationState: 'ACTIVE', identityState: 'VERIFIED', creationOrigin: 'CANONICAL_ALLOCATION' }],
    });
    renderWorkspace(statement('PARTIALLY_MATCHED'));
    expect(await screen.findByText('Partially matched')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add missing amount' }));
    expect(await screen.findByLabelText('Expense account')).toBeTruthy();
    expect(await screen.findByText('₹30.00')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Expense account'), { target: { value: 'expense-supplies' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post and link entry' }));
    await waitFor(() => expect(serviceMocks.createMissingEntryFromStatement).toHaveBeenCalledWith(expect.objectContaining({
      statementTransactionId: 'statement-resolution', counterAccountId: 'expense-supplies', expectedRemainderAmount: '30.00', description: 'Office supplies',
    })));
  });

  it('refreshes and requires reconfirmation if another allocation changes the remainder in the dialog', async () => {
    serviceMocks.getWorkspace.mockResolvedValue({ transactions: [statement('PARTIALLY_MATCHED')], balances: {} });
    const receipt = (amount: string) => ({
      statementTransactionId: 'statement-resolution', statementStatus: 'PARTIALLY_MATCHED', reviewDecision: 'ACCEPT', legacyMatches: [],
      allocations: [{ allocationId: 'allocation-existing', journalLineId: 'line-existing', journalEntryId: 'journal-existing', entryNumber: 'JE-1', reversalJournalEntryId: null, reversalEntryNumber: null, amount, allocationState: 'ACTIVE', identityState: 'VERIFIED', creationOrigin: 'CANONICAL_ALLOCATION' }],
    });
    serviceMocks.getCanonicalStatementReceipt.mockResolvedValueOnce(receipt('20.00')).mockResolvedValueOnce(receipt('25.00'));
    renderWorkspace(statement('PARTIALLY_MATCHED'));
    fireEvent.click(await screen.findByRole('button', { name: 'Add missing amount' }));
    expect(await screen.findByText('₹30.00')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Expense account'), { target: { value: 'expense-supplies' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post and link entry' }));
    expect(await screen.findByText('₹25.00')).toBeTruthy();
    expect(serviceMocks.createMissingEntryFromStatement).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Allocations changed while this dialog was open/).length).toBeGreaterThan(0);
  });

  it('does not claim a failed create succeeded from an older active statement-created allocation', async () => {
    serviceMocks.getWorkspace.mockResolvedValue({ transactions: [statement('PARTIALLY_MATCHED')], balances: {} });
    serviceMocks.getCanonicalStatementReceipt.mockResolvedValue({
      statementTransactionId: 'statement-resolution', statementStatus: 'PARTIALLY_MATCHED', reviewDecision: 'ACCEPT', legacyMatches: [],
      allocations: [{ allocationId: 'old-created-allocation', journalLineId: 'old-line', journalEntryId: 'old-journal', entryNumber: 'JE-OLD', reversalJournalEntryId: null, reversalEntryNumber: null, amount: '20.00', allocationState: 'ACTIVE', identityState: 'VERIFIED', creationOrigin: 'STATEMENT_CREATION', creationOperationId: 'bankentry-old-operation' }],
    });
    serviceMocks.createMissingEntryFromStatement.mockRejectedValueOnce(new Error('connection unavailable'));
    renderWorkspace(statement('PARTIALLY_MATCHED'));
    fireEvent.click(await screen.findByRole('button', { name: 'Add missing amount' }));
    expect(await screen.findByText('₹30.00')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Expense account'), { target: { value: 'expense-supplies' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post and link entry' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getAllByText(/connection unavailable/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Entry and match were saved/)).toBeNull();
  });

  it('recovers an ambiguous response only when the receipt has this operation id', async () => {
    serviceMocks.getWorkspace.mockResolvedValue({ transactions: [statement('UNMATCHED')], balances: {} });
    let operationId = '';
    serviceMocks.createMissingEntryFromStatement.mockImplementationOnce(async (input: { creationOperationId: string }) => {
      operationId = input.creationOperationId;
      throw new Error('connection unavailable');
    });
    serviceMocks.getCanonicalStatementReceipt
      .mockResolvedValueOnce({ statementTransactionId: 'statement-resolution', statementStatus: 'UNMATCHED', reviewDecision: 'ACCEPT', legacyMatches: [], allocations: [] })
      .mockResolvedValueOnce({ statementTransactionId: 'statement-resolution', statementStatus: 'UNMATCHED', reviewDecision: 'ACCEPT', legacyMatches: [], allocations: [] })
      .mockImplementationOnce(async () => ({
        statementTransactionId: 'statement-resolution', statementStatus: 'MATCHED', reviewDecision: 'ACCEPT', legacyMatches: [],
        allocations: [
          { allocationId: 'old-created-allocation', journalLineId: 'old-line', journalEntryId: 'old-journal', entryNumber: 'JE-OLD', reversalJournalEntryId: null, reversalEntryNumber: null, amount: '20.00', allocationState: 'ACTIVE', identityState: 'VERIFIED', creationOrigin: 'STATEMENT_CREATION', creationOperationId: 'bankentry-old-operation' },
          { allocationId: 'new-created-allocation', journalLineId: 'new-line', journalEntryId: 'new-journal', entryNumber: 'JE-NEW', reversalJournalEntryId: null, reversalEntryNumber: null, amount: '50.00', allocationState: 'ACTIVE', identityState: 'VERIFIED', creationOrigin: 'STATEMENT_CREATION', creationOperationId: operationId },
        ],
      }));
    renderWorkspace(statement('UNMATCHED'));
    fireEvent.click(await screen.findByRole('button', { name: 'Add simple entry' }));
    fireEvent.change(await screen.findByLabelText('Expense account'), { target: { value: 'expense-supplies' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post and link entry' }));
    expect(await screen.findByText(/Entry and match were saved\. Journal JE-NEW/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
