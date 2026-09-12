// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { InvoicePreviewModal } from '../components/invoices/InvoicePreviewModal';
import * as BooksContextModule from '../context/BooksContext';
import { invoiceApi } from '../services/invoiceApi';

describe('Zoho Books Invoice Toolbar & Payment Actions', () => {
  const mockInvoice = {
    id: 'inv-test-101',
    invoiceNumber: 'INV-2026-0099',
    clientId: 'cli-acme-1',
    clientName: 'Acme Global Enterprises',
    clientEmail: 'finance@acme.com',
    issueDate: '2026-09-10',
    dueDate: '2026-10-10',
    items: [
      {
        id: 'item-1',
        description: 'Enterprise Cloud Architecture Consulting',
        quantity: 2,
        unitPrice: 5000,
        taxRate: 18,
        amount: 10000,
      },
    ],
    subtotal: 10000,
    taxTotal: 1800,
    discount: 0,
    totalAmount: 11800,
    paidAmount: 0,
    balanceDue: 11800,
    status: 'Sent' as const,
    notes: 'Thank you for your business.',
    createdAt: '2026-09-10T10:00:00.000Z',
  };

  const mockAccounts = [
    {
      id: 'acc-bank-1',
      code: '1000',
      name: 'Corporate Operating Bank Account',
      type: 'Asset',
      subType: 'Bank',
      balance: 150000,
      status: 'Active',
      allowDirectPosting: true,
      isLocked: false,
    },
  ];

  let mockAddPaymentReceived: any;
  let mockUpdateInvoice: any;
  let mockDeleteInvoice: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockAddPaymentReceived = vi.fn().mockResolvedValue({ id: 'pay-1', paymentNumber: 'PAY-001' });
    mockUpdateInvoice = vi.fn().mockImplementation((id, updated) => Promise.resolve({ ...mockInvoice, ...updated }));
    mockDeleteInvoice = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue({
      invoices: [mockInvoice] as any,
      paymentsReceived: [],
      accounts: mockAccounts as any,
      refreshAccounts: vi.fn().mockResolvedValue(undefined),
      settings: {
        firmName: 'Apex Accounting LLC',
        firmAddress: '100 Wall Street, New York, NY',
        firmEmail: 'billing@apex.com',
        currencySymbol: '$',
        currencyCode: 'USD',
      } as any,
      addPaymentReceived: mockAddPaymentReceived,
      updateInvoice: mockUpdateInvoice,
      deleteInvoice: mockDeleteInvoice,
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Renders the complete Zoho Books action toolbar (Edit, Send, Share, Reminders, PDF/Print, Record Payment, ...)', () => {
    render(<InvoicePreviewModal invoice={mockInvoice as any} onClose={() => {}} onEdit={() => {}} />);

    // Verify main toolbar buttons
    expect(screen.getByRole('button', { name: /Edit/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Send/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Share/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Reminders/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /PDF Documents/i })).toBeDefined();
    expect(screen.getAllByRole('button', { name: /Record Payment/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTitle('More actions')).toBeDefined();
  });

  it('2. Clicking Record Payment opens RecordCustomerPaymentModal with invoice and balance prefilled', async () => {
    render(<InvoicePreviewModal invoice={mockInvoice as any} onClose={() => {}} />);

    // Click Record Payment button
    const recordPayBtn = screen.getByTitle('Record Customer Payment');
    fireEvent.click(recordPayBtn);

    // Verify Record Customer Payment modal appears with prefilled data
    expect(screen.getAllByText('Record Customer Payment').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Settle outstanding customer receivables into the general ledger.').length).toBeGreaterThanOrEqual(1);

    // Amount should be prefilled with balanceDue (11800.00)
    const amountInput = screen.getByDisplayValue('11800.00');
    expect(amountInput).toBeDefined();

    // Select payment mode and enter reference
    const refInput = screen.getByPlaceholderText(/TXN-9482910/i);
    fireEvent.change(refInput, { target: { value: 'WIRE-ACME-991' } });

    // Submit payment
    const submitBtn = screen.getByRole('button', { name: /Post Payment/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAddPaymentReceived).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: 'inv-test-101',
          amount: 11800,
          reference: 'WIRE-ACME-991',
        })
      );
    });
  });

  it('3. Reminders -> Expected Payment Date prompts and persists date to invoice', async () => {
    render(<InvoicePreviewModal invoice={mockInvoice as any} onClose={() => {}} />);

    // Open Reminders dropdown
    const remindersBtn = screen.getByRole('button', { name: /Reminders/i });
    fireEvent.click(remindersBtn);

    // Click Expected Payment Date
    const expectedDateBtn = screen.getByText('Expected Payment Date');
    fireEvent.click(expectedDateBtn);

    // Modal should be open
    expect(screen.getByText("Record customer promised settlement date")).toBeDefined();

    const dateInput = screen.getByLabelText(/Promised Settlement Date/i) || screen.getByDisplayValue('2026-10-10');
    fireEvent.change(dateInput, { target: { value: '2026-10-25' } });

    const saveDateBtn = screen.getByRole('button', { name: 'Save Date' });
    fireEvent.click(saveDateBtn);

    await waitFor(() => {
      expect(mockUpdateInvoice).toHaveBeenCalledWith(
        'inv-test-101',
        expect.objectContaining({
          expectedPaymentDate: '2026-10-25',
        })
      );
    });
  });

  it('4. PDF/Print -> Delivery Slip toggles Delivery Challan mode (prices hidden, items retained)', async () => {
    render(<InvoicePreviewModal invoice={mockInvoice as any} onClose={() => {}} />);

    // Initially shows TAX INVOICE and rates
    expect(screen.getByText('TAX INVOICE')).toBeDefined();
    expect(screen.getByText('Rate')).toBeDefined();
    expect(screen.getByText('Tax %')).toBeDefined();

    // Open PDF/Print dropdown
    const pdfMenuBtn = screen.getByRole('button', { name: /PDF Documents/i });
    fireEvent.click(pdfMenuBtn);

    // Click Delivery Challan / Slip
    const slipBtn = screen.getByText(/Delivery Challan \/ Slip/i);
    fireEvent.click(slipBtn);

    // Should switch to Delivery Challan mode
    expect(screen.getByText('DELIVERY CHALLAN')).toBeDefined();
    expect(screen.getByText(/Delivery Challan Mode:/i)).toBeDefined();
    expect(screen.getByText('Quantity Dispatched')).toBeDefined();
    expect(screen.queryByText('Rate')).toBeNull();
    expect(screen.getByText('Delivery Declaration')).toBeDefined();
  });

  it('5. More actions (...) -> Write Off opens dialog and records write-off', async () => {
    const mockRecordWriteOff = vi.spyOn(invoiceApi, 'recordWriteOff').mockResolvedValue({ success: true });

    render(<InvoicePreviewModal invoice={mockInvoice as any} onClose={() => {}} />);

    // Open More dropdown
    const moreBtn = screen.getByTitle('More actions');
    fireEvent.click(moreBtn);

    // Click Write Off
    const writeOffBtn = screen.getByText('Write Off');
    fireEvent.click(writeOffBtn);

    // Modal should be open
    expect(screen.getByText('Write Off Invoice Balance')).toBeDefined();
    expect(screen.getByText('Balance to Write Off:')).toBeDefined();

    const confirmBtn = screen.getByRole('button', { name: 'Confirm Write-Off' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockRecordWriteOff).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: 'inv-test-101',
          amount: 11800,
        })
      );
    });
  });
});
