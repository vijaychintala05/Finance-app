// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InvoicesView } from '../components/invoices/InvoicesView';
import * as BooksContextModule from '../context/BooksContext';
import { invoiceApi } from '../services/invoiceApi';

const invoice = {
  id: 'inv-trace-1', invoiceNumber: 'INV-TRACE-1', clientId: 'client-1', clientName: 'Trace Customer', clientEmail: '',
  issueDate: '2026-09-01', dueDate: '2026-10-01', items: [{ id: 'line-1', description: 'Trace service', quantity: 1, unitPrice: 100, taxRate: 0, amount: 100 }],
  subtotal: 100, taxTotal: 0, discount: 0, totalAmount: 100, paidAmount: 0, balanceDue: 100, status: 'Sent' as const, createdAt: '2026-09-01',
};
const settings = { firmName: 'Trace Firm', firmAddress: '', firmEmail: '', currencySymbol: '$', currencyCode: 'USD' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}
const completedGuard = {
  organizationId: 'org-1', userId: 'user-1', idempotencyKey: 'invoice-create-trace-0001', requestHash: 'a'.repeat(64), payload: {},
  status: 'committed', invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, invoiceStatus: 'POSTED', journalEntryId: 'je-original-1',
  notice: { tone: 'success', title: 'Invoice created', message: 'Invoice created' },
};

function renderInvoices(invoiceCreateGuard: any) {
  const value = {
    invoices: [invoice], settings, currentOrg: { id: 'org-1' }, invoiceVoidGuards: [], invoiceCreateGuard,
    verifyInvoiceCreateOperationStatus: vi.fn(), dismissInvoiceCreateGuard: vi.fn(),
    clients: [], projects: [], salespersons: [], accounts: [], paymentsReceived: [],
    deleteInvoice: vi.fn(), updateInvoice: vi.fn(),
  };
  vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue(value as any);
  return render(<InvoicesView />);
}

afterEach(() => { vi.restoreAllMocks(); cleanup(); });

describe('invoice-create receipt ledger trace', () => {
  it('opens the exact original posting journal from a committed receipt', async () => {
    const journalSpy = vi.spyOn(invoiceApi, 'getInvoiceJournal').mockResolvedValue({
      journalEntry: { id: 'je-original-1', entryNumber: 'JE-ORIGINAL-1', date: '2026-09-01', reference: 'INV-TRACE-1', lines: [] },
      sourceDocument: { type: 'INVOICE', id: invoice.id, documentNumber: invoice.invoiceNumber },
    });
    renderInvoices(completedGuard);

    fireEvent.click(screen.getByRole('button', { name: 'View original posting journal' }));

    await waitFor(() => expect(journalSpy).toHaveBeenCalledWith(invoice.id, 'je-original-1'));
    expect(await screen.findByText('Original Posting Journal')).toBeTruthy();
    expect(screen.getByText(`Verified journal je-original-1 for invoice ${invoice.invoiceNumber}`)).toBeTruthy();
    journalSpy.mockResolvedValueOnce({
      journalEntry: { id: 'je-current-2', entryNumber: 'JE-CURRENT-2', date: '2026-09-02', reference: 'INV-TRACE-1', lines: [] },
      sourceDocument: { type: 'INVOICE', id: invoice.id, documentNumber: invoice.invoiceNumber },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close journal drill-down' }));
    await waitFor(() => expect(screen.queryByText('Original Posting Journal')).toBeNull());
    fireEvent.click(screen.getByTitle('More actions'));
    fireEvent.click(screen.getByText('View Journal Entry'));

    await waitFor(() => expect(journalSpy).toHaveBeenNthCalledWith(2, invoice.id, undefined));
    expect(await screen.findByText('Accounting Journal Entry')).toBeTruthy();
    expect(screen.queryByText(`Verified journal je-original-1 for invoice ${invoice.invoiceNumber}`)).toBeNull();
  });

  it('ignores a stale original-journal response after the user switches to the current journal', async () => {
    const originalRequest = deferred<any>();
    const currentRequest = deferred<any>();
    const journalSpy = vi.spyOn(invoiceApi, 'getInvoiceJournal')
      .mockReturnValueOnce(originalRequest.promise)
      .mockReturnValueOnce(currentRequest.promise);
    renderInvoices(completedGuard);

    fireEvent.click(screen.getByRole('button', { name: 'View original posting journal' }));
    await waitFor(() => expect(journalSpy).toHaveBeenCalledWith(invoice.id, 'je-original-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Close journal drill-down' }));
    fireEvent.click(screen.getByTitle('More actions'));
    fireEvent.click(screen.getByText('View Journal Entry'));
    await waitFor(() => expect(journalSpy).toHaveBeenNthCalledWith(2, invoice.id, undefined));

    currentRequest.resolve({
      journalEntry: { id: 'je-current-2', entryNumber: 'JE-CURRENT-2', date: '2026-09-02', reference: invoice.invoiceNumber, lines: [] },
      sourceDocument: { type: 'INVOICE', id: invoice.id, documentNumber: invoice.invoiceNumber },
    });
    expect(await screen.findByText('Accounting Journal Entry')).toBeTruthy();
    expect(await screen.findByText('JE-CURRENT-2')).toBeTruthy();

    originalRequest.resolve({
      journalEntry: { id: 'je-original-1', entryNumber: 'JE-ORIGINAL-1', date: '2026-09-01', reference: invoice.invoiceNumber, lines: [] },
      sourceDocument: { type: 'INVOICE', id: invoice.id, documentNumber: invoice.invoiceNumber },
    });
    await waitFor(() => expect(screen.getByText('JE-CURRENT-2')).toBeTruthy());
    expect(screen.queryByText('Original Posting Journal')).toBeNull();
    expect(screen.queryByText('JE-ORIGINAL-1')).toBeNull();
  });
  it('does not offer a posting journal for an approval-submitted receipt', () => {
    renderInvoices({ ...completedGuard, invoiceStatus: 'SUBMITTED', journalEntryId: undefined });
    expect(screen.queryByRole('button', { name: 'View original posting journal' })).toBeNull();
  });
});
