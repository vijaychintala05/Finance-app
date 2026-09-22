// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettlementWorkspace } from '../components/accounting/SettlementWorkspace';

const { getMock, postMock, capabilityMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  capabilityMock: {
    loading: false,
    capabilities: [{ key: 'payables-settlement', state: 'enabled' }],
    isEnabled: (key: string) => key === 'payables-settlement',
  },
}));

vi.mock('../api/client', () => ({ apiClient: { get: getMock, post: postMock } }));
vi.mock('../context/BooksContext', () => ({ useBooks: () => ({ settings: { currencySymbol: '₹' } }) }));
vi.mock('../capabilities/useFinanceCapabilities', () => ({ useFinanceCapabilities: () => capabilityMock }));

const payment = {
  id: 'payment-1', payment_number: 'PAY-001', vendor_id: 'vendor-1', vendor_name: 'Supply Partner',
  payment_date: '2026-09-20', amount: 800, status: 'POSTED', journal_entry_id: 'journal-1',
};
const credit = {
  id: 'credit-1', credit_number: 'VC-001', vendor_id: 'vendor-1', vendor_name: 'Supply Partner',
  date: '2026-09-18', total_amount: 500, remaining_credit: 500, status: 'Open',
};

function successfulGet(endpoint: string) {
  const data: Record<string, unknown[]> = {
    '/finance/vendor-payments': [payment],
    '/finance/vendor-refunds': [],
    '/finance/vendors': [{ id: 'vendor-1', name: 'Supply Partner' }],
    '/finance/bills': [{ id: 'bill-1', vendor_id: 'vendor-1', bill_number: 'BILL-001', balance_due: 800 }],
    '/finance/accounts': [{ id: 'bank-1', code: '1010', name: 'Operating Bank', type: 'Asset', status: 'Active' }],
    '/finance/vendor-advances': [{ id: 'advance-1', vendor_id: 'vendor-1', unapplied_amount: 300, status: 'POSTED' }],
    '/finance/debit-notes': [credit],
    '/finance/expenses': [{ id: 'expense-1', vendor_id: 'vendor-1', reference_number: 'EXP-001', amount: 200, status: 'POSTED' }],
  };
  return Promise.resolve({ data: data[endpoint] || [], error: null, status: 200 });
}

describe('SettlementWorkspace authoritative payable lifecycle', () => {
  beforeEach(() => {
    getMock.mockReset(); postMock.mockReset();
    getMock.mockImplementation(successfulGet);
    postMock.mockResolvedValue({ data: { id: 'created-1' }, error: null, status: 201 });
  });

  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('records a vendor refund against an explicit source and deposit account', async () => {
    render(<SettlementWorkspace side="payable" initialResource="refunds" />);
    await screen.findByText('No authoritative vendor refunds records.');
    fireEvent.click(screen.getByRole('button', { name: 'New transaction' }));

    fireEvent.change(screen.getByLabelText('Vendor'), { target: { value: 'vendor-1' } });
    fireEvent.change(screen.getByLabelText('Refund source'), { target: { value: 'credit:credit-1' } });
    fireEvent.change(screen.getByLabelText('Deposit account'), { target: { value: 'bank-1' } });
    fireEvent.change(screen.getByLabelText('Reason or reference'), { target: { value: 'Supplier cash refund' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post transaction' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/finance/vendor-refunds', expect.objectContaining({
      vendorId: 'vendor-1', debitNoteId: 'credit-1', depositToAccountId: 'bank-1', amount: 500,
    })));
    expect(await screen.findByText('Vendor refund posted')).toBeTruthy();
  });

  it('requires an in-app reversal reason and preserves the immutable-record consequence', async () => {
    render(<SettlementWorkspace side="payable" initialResource="payments" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reverse PAY-001' }));
    expect(screen.getByRole('dialog', { name: 'Reverse PAY-001?' })).toBeTruthy();
    expect(screen.getByText(/original remains immutable/i)).toBeTruthy();
    expect(postMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Reversal reason'), { target: { value: 'Duplicate bank disbursement' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post reversal' }));
    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/finance/vendor-payments/payment-1/reverse', { reason: 'Duplicate bank disbursement' }));
    expect(await screen.findByText('Reversal posted')).toBeTruthy();
  });

  it('opens report and search deep links into posting evidence', async () => {
    const closed = vi.fn();
    render(<SettlementWorkspace side="payable" initialResource="payments" selectedEntityId="payment-1" onSelectedEntityClosed={closed} />);
    expect(await screen.findByRole('dialog', { name: 'PAY-001' })).toBeTruthy();
    expect(screen.getByText('Journal: journal-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close transaction details' }));
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('warns about an uncertain posting without inviting a duplicate submission', async () => {
    postMock.mockResolvedValue({ data: null, error: 'Connection closed', status: 500, errorCode: 'NETWORK_FAILURE', requestId: 'web-payment-trace-1' });
    render(<SettlementWorkspace side="payable" initialResource="payments" />);
    await screen.findByText('PAY-001');
    fireEvent.click(screen.getByRole('button', { name: 'New transaction' }));
    fireEvent.change(screen.getByLabelText('Vendor'), { target: { value: 'vendor-1' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Bank account'), { target: { value: 'bank-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post transaction' }));
    expect(await screen.findByText('Posting outcome could not be confirmed')).toBeTruthy();
    expect(screen.getByText(/may already have committed/i)).toBeTruthy();
    expect(screen.getByText('web-payment-trace-1')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: /new payables settlement transaction/i })).toBeTruthy();
  });

  it('hides write-offs when their separately certified deployment capability is disabled', async () => {
    render(<SettlementWorkspace side="payable" initialResource="payments" />);
    await screen.findByText('PAY-001');
    expect(screen.queryByRole('button', { name: 'Write-offs' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New transaction' }));
    expect(screen.queryByRole('option', { name: 'Payable write-off' })).toBeNull();
  });
});
