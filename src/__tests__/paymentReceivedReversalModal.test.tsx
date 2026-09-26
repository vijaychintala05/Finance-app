// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PaymentReceivedDetailsModal } from '../components/sales/PaymentReceivedDetailsModal';
import { ApiRequestError } from '../api/client';

const mocks = vi.hoisted(() => ({ useBooks: vi.fn() }));
vi.mock('../context/BooksContext', () => ({ useBooks: mocks.useBooks }));

const payment = {
  id: 'payment-1', paymentNumber: 'PAY-101', clientId: 'client-1', clientName: 'Northwind', invoiceId: 'invoice-1', invoiceNumber: 'INV-101',
  paymentDate: '2026-09-01', paymentMethod: 'Bank Transfer', referenceNumber: 'REF-1', amount: 100, status: 'Recorded',
} as any;
const deletePaymentReceived = vi.fn();
const verifyPaymentReversalStatus = vi.fn();
const baseBooks = () => ({
  settings: { currencySymbol: '$' }, currentOrg: { id: 'org-1' }, paymentsReceived: [payment], deletePaymentReceived,
  paymentReversalGuards: [], verifyPaymentReversalStatus,
});
const openReverseDialog = () => {
  fireEvent.click(screen.getByRole('button', { name: 'More payment actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reverse Payment' }));
};

describe('Payment received reversal modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useBooks.mockImplementation(baseBooks);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('requires a meaningful reason and submits the trimmed reason for an audited reversal', async () => {
    deletePaymentReceived.mockResolvedValue({ requestId: 'req-reverse', reversalJournalId: 'journal-reversal', refreshFailed: false });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<PaymentReceivedDetailsModal isOpen onClose={vi.fn()} payment={payment} />);
    openReverseDialog();
    const reason = screen.getByLabelText('Reason for reversal');
    const submit = screen.getByRole('button', { name: 'Reverse payment', exact: true });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(reason, { target: { value: '  Duplicate receipt  ' } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(deletePaymentReceived).toHaveBeenCalledWith('payment-1', 'Duplicate receipt'));
    expect(await screen.findByText('Payment reversal completed')).toBeTruthy();
    expect(screen.getByText(/journal-reversal/)).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('shows each invoice allocation amount and any unapplied remainder', () => {
    const allocatedPayment = { ...payment, invoiceNumber: 'INV-101, INV-102', unallocatedAmount: 15, allocations: [
      { invoiceId: 'invoice-1', invoiceNumber: 'INV-101', amount: 65 },
      { invoiceId: 'invoice-2', invoiceNumber: 'INV-102', amount: 20 },
    ] };
    mocks.useBooks.mockReturnValue({ ...baseBooks(), paymentsReceived: [allocatedPayment] });
    render(<PaymentReceivedDetailsModal isOpen onClose={vi.fn()} payment={allocatedPayment as any} />);
    expect(screen.getByText('Allocation breakdown')).toBeTruthy();
    expect(screen.getByText('Invoice INV-101')).toBeTruthy();
    expect(screen.getByText('Invoice INV-102')).toBeTruthy();
    expect(screen.getByText('Unallocated $15.00')).toBeTruthy();
    expect(screen.getByText('$65.00')).toBeTruthy();
    expect(screen.getByText('$20.00')).toBeTruthy();
  });

  it('shows a recorded zero historical remainder and distinguishes unavailable legacy history', () => {
    const reversedPayment = { ...payment, status: 'REVERSED', unallocatedAmount: 0, unallocatedAmountBeforeReversal: 0, allocations: [] };
    mocks.useBooks.mockReturnValue({ ...baseBooks(), paymentsReceived: [reversedPayment] });
    const { unmount } = render(<PaymentReceivedDetailsModal isOpen onClose={vi.fn()} payment={reversedPayment as any} />);
    expect(screen.getByText('Unapplied at reversal $0.00')).toBeTruthy();
    unmount();

    const legacyReversal = { ...reversedPayment, unallocatedAmountBeforeReversal: null };
    mocks.useBooks.mockReturnValue({ ...baseBooks(), paymentsReceived: [legacyReversal] });
    render(<PaymentReceivedDetailsModal isOpen onClose={vi.fn()} payment={legacyReversal as any} />);
    expect(screen.getByText('Unapplied amount unavailable for this earlier reversal')).toBeTruthy();
  });

  it('shows the authoritative active status in a reversal conflict while keeping financial actions hidden', () => {
    mocks.useBooks.mockReturnValue({
      ...baseBooks(),
      paymentReversalGuards: [{ paymentId: 'payment-1', organizationId: 'org-1', status: 'conflict', committed: true, requestId: 'req-conflict', reversalJournalId: 'journal-reversal', notice: { tone: 'error', title: 'Payment reversal needs review', message: 'The authoritative payment and reversal evidence do not agree.' } }],
    });
    render(<PaymentReceivedDetailsModal isOpen onClose={vi.fn()} payment={payment} />);
    expect(screen.getByText('Received')).toBeTruthy();
    expect(screen.getByText('Payment reversal needs review')).toBeTruthy();
    expect(screen.queryByTitle('Edit payment')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More payment actions' }));
    expect(screen.queryByRole('button', { name: 'Reverse Payment' })).toBeNull();
  });

  it('shows an inline uncertain-outcome recovery notice without prompting or alerting', async () => {
    deletePaymentReceived.mockRejectedValue(new ApiRequestError({ data: null, error: 'Network timed out', status: 500, errorCode: 'NETWORK_FAILURE', requestId: 'req-timeout' }, 'Payment could not be reversed'));
    const promptSpy = vi.spyOn(window, 'prompt').mockImplementation(() => null);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<PaymentReceivedDetailsModal isOpen onClose={vi.fn()} payment={payment} />);
    openReverseDialog();
    fireEvent.change(screen.getByLabelText('Reason for reversal'), { target: { value: 'Duplicate receipt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reverse payment', exact: true }));

    await waitFor(() => expect(screen.getAllByText('Payment reversal outcome could not be confirmed').length).toBeGreaterThan(0));
    expect(screen.getAllByText('req-timeout').length).toBeGreaterThan(0);
    expect(promptSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
