// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiRequestError } from '../api/client';

const mocks = vi.hoisted(() => ({ updateInvoice: vi.fn(), refreshAccounts: vi.fn() }));
vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    clients: [{ id: 'client-1', name: 'Acme', companyName: 'Acme Co', email: 'billing@acme.test' }],
    projects: [],
    accounts: [{ id: 'revenue-1', name: 'Revenue', type: 'Revenue', status: 'Active', allowDirectPosting: true }],
    refreshAccounts: mocks.refreshAccounts,
    settings: { currencySymbol: '$', defaultTaxRate: 0 },
    salespersons: [],
    addInvoice: vi.fn(),
    updateInvoice: mocks.updateInvoice,
    expenses: [],
    currentOrg: { id: 'org-1' },
    invoiceVoidGuards: [],
    invoiceCreateGuard: null,
  }),
}));
import { InvoiceEditorModal } from '../components/invoices/InvoiceEditorModal';

describe('invoice edit conflict recovery', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('preserves the draft, shows current server values, and requires explicit rebase and resave', async () => {
    mocks.refreshAccounts.mockResolvedValue(undefined);
    mocks.updateInvoice
      .mockRejectedValueOnce(new ApiRequestError({
        data: null,
        error: 'Invoice changed while you were editing it',
        status: 409,
        errorCode: 'INVOICE_EDIT_CONFLICT',
        currentState: {
          invoiceId: 'invoice-1',
          editVersion: '2',
          clientName: 'Acme Co',
          issueDate: '2026-09-20',
          dueDate: '2026-10-20',
          totalAmount: 250,
          discount: 25,
          status: 'SENT',
          notes: 'Concurrent server notes',
          terms: 'Server terms',
          projectId: 'project-current',
          salespersonName: 'Current salesperson',
          lineItems: [{ description: 'Server line', quantity: 5, unitPrice: 55, taxRate: 10, amount: 275 }],
        },
      }, 'Invoice could not be updated'))
      .mockResolvedValueOnce({ id: 'invoice-1', invoiceNumber: 'INV-1', editVersion: '3' });

    const invoice: any = {
      id: 'invoice-1', invoiceNumber: 'INV-1', clientId: 'client-1', clientName: 'Acme Co', clientEmail: 'billing@acme.test',
      issueDate: '2026-09-01', dueDate: '2026-09-30', items: [{ id: 'line-1', description: 'Draft line', quantity: 1, unitPrice: 100, taxRate: 0, amount: 100 }],
      subtotal: 100, taxTotal: 0, discount: 0, totalAmount: 100, paidAmount: 0, balanceDue: 100, status: 'Sent',
      notes: 'Original notes', terms: 'Original terms', editVersion: '1', createdAt: '2026-09-01',
    };
    const onClose = vi.fn();
    render(<InvoiceEditorModal isOpen onClose={onClose} editingInvoice={invoice} />);

    fireEvent.change(screen.getByDisplayValue('Original notes'), { target: { value: 'My preserved draft notes' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Corrected line item pricing, revised quantities'), { target: { value: 'My draft reason' } });
    fireEvent.click(screen.getAllByText('Save Changes')[0]);

    await waitFor(() => expect(screen.getByText(/Invoice changed while you were editing/)).toBeTruthy());
    expect(screen.getByText(/Current notes: Concurrent server notes/)).toBeTruthy();
    expect(screen.getByText(/Server line — 5 × \$55\.00; tax 10%; line total \$275\.00/)).toBeTruthy();
    expect((screen.getByDisplayValue('My preserved draft notes') as HTMLTextAreaElement).value).toBe('My preserved draft notes');
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.updateInvoice).toHaveBeenCalledTimes(1);
    expect(mocks.updateInvoice.mock.calls[0][2]).toBe('1');

    fireEvent.click(screen.getByText('Keep my draft and rebase'));
    fireEvent.click(screen.getAllByText('Save Changes')[0]);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mocks.updateInvoice).toHaveBeenCalledTimes(2);
    expect(mocks.updateInvoice.mock.calls[1][1].notes).toBe('My preserved draft notes');
    expect(mocks.updateInvoice.mock.calls[1][2]).toBe('2');
  });
});