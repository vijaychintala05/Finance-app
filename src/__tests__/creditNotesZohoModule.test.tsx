// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ApplyCreditNoteModal } from '../components/sales/ApplyCreditNoteModal';
import { RecordRefundModal } from '../components/sales/RecordRefundModal';
import { CreditNotesView } from '../components/sales/CreditNotesView';
import { CreditNote, Invoice, Account, Client } from '../types';
import * as BooksContextModule from '../context/BooksContext';
import { apiClient } from '../api/client';

describe('Zoho-Grade Credit Notes Module Frontend Tests', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  const mockCreditNote: CreditNote = {
    id: 'cn-101',
    cnNumber: 'CN-2026-0001',
    clientName: 'Acme Corporation',
    originalInvoiceNumber: 'INV-2026-001',
    issueDate: '2026-09-01',
    totalAmount: 1000,
    remainingAmount: 600,
    status: 'Open',
    reason: '01 - Sales Return: Defective batch',
  };

  const mockInvoices: Invoice[] = [
    {
      id: 'inv-1',
      invoiceNumber: 'INV-2026-001',
      clientId: 'client-1',
      clientName: 'Acme Corporation',
      clientEmail: 'acme@example.com',
      issueDate: '2026-08-01',
      dueDate: '2026-08-30',
      items: [],
      subtotal: 500,
      taxTotal: 0,
      discount: 0,
      totalAmount: 500,
      paidAmount: 200,
      balanceDue: 300,
      status: 'Partially Paid',
      createdAt: '2026-08-01',
    },
    {
      id: 'inv-2',
      invoiceNumber: 'INV-2026-002',
      clientId: 'client-1',
      clientName: 'Acme Corporation',
      clientEmail: 'acme@example.com',
      issueDate: '2026-08-15',
      dueDate: '2026-09-15',
      items: [],
      subtotal: 800,
      taxTotal: 0,
      discount: 0,
      totalAmount: 800,
      paidAmount: 0,
      balanceDue: 800,
      status: 'Sent',
      createdAt: '2026-08-15',
    },
    {
      id: 'inv-3',
      invoiceNumber: 'INV-2026-003',
      clientId: 'client-1',
      clientName: 'Acme Corporation',
      clientEmail: 'acme@example.com',
      issueDate: '2026-07-01',
      dueDate: '2026-07-31',
      items: [],
      subtotal: 400,
      taxTotal: 0,
      discount: 0,
      totalAmount: 400,
      paidAmount: 400,
      balanceDue: 0,
      status: 'Paid',
      createdAt: '2026-07-01',
    },
  ];

  const mockBankAccounts: Account[] = [
    {
      id: 'acc-bank-1',
      code: '1010',
      name: 'HDFC Operating Bank',
      type: 'Asset',
      subType: 'Bank',
      balance: 50000,
    },
    {
      id: 'acc-cash-1',
      code: '1020',
      name: 'Petty Cash',
      type: 'Asset',
      subType: 'Cash',
      balance: 5000,
    },
  ];

  const mockClients: Client[] = [
    {
      id: 'client-1',
      name: 'Acme Corporation',
      companyName: 'Acme Corp',
      email: 'acme@example.com',
      phone: '1234567890',
      billingAddress: '123 Market St',
      currency: 'INR',
      paymentTerms: 'Due on Receipt',
      createdAt: '2026-01-01',
    },
  ];

  const mockSettings = {
    firmName: 'Test Firm',
    baseCurrency: 'INR',
    currencySymbol: '₹',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. ApplyCreditNoteModal', () => {
    it('renders customer name, available credit, and eligible unpaid invoices', () => {
      vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue({
        invoices: mockInvoices,
        clients: mockClients,
        settings: mockSettings,
        applyCreditNoteToInvoice: vi.fn(),
      } as any);

      render(
        <ApplyCreditNoteModal
          isOpen={true}
          onClose={vi.fn()}
          creditNote={mockCreditNote}
        />
      );

      expect(screen.getByText('Apply Credits to Invoices')).toBeDefined();
      expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(0);
      expect(screen.getByText('INV-2026-001')).toBeDefined();
      expect(screen.getByText('INV-2026-002')).toBeDefined();
      // Fully paid invoice should NOT be displayed
      expect(screen.queryByText('INV-2026-003')).toBeNull();
    });

    it('auto-allocates credit from oldest to newest invoices without exceeding balance', async () => {
      vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue({
        invoices: mockInvoices,
        clients: mockClients,
        settings: mockSettings,
        applyCreditNoteToInvoice: vi.fn(),
      } as any);

      render(
        <ApplyCreditNoteModal
          isOpen={true}
          onClose={vi.fn()}
          creditNote={mockCreditNote} // 600 available
        />
      );

      const autoBtn = screen.getByText('Auto-Allocate');
      fireEvent.click(autoBtn);

      // INV-2026-001 has balance 300 -> gets 300
      // INV-2026-002 has balance 800 -> gets remaining 300
      const inputs = screen.getAllByPlaceholderText('0.00') as HTMLInputElement[];
      expect(inputs[0].value).toBe('300.00');
      expect(inputs[1].value).toBe('300.00');
    });

    it('blocks submission when total allocated exceeds available credit', async () => {
      const applyMock = vi.fn();
      vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue({
        invoices: mockInvoices,
        clients: mockClients,
        settings: mockSettings,
        applyCreditNoteToInvoice: applyMock,
      } as any);

      render(
        <ApplyCreditNoteModal
          isOpen={true}
          onClose={vi.fn()}
          creditNote={mockCreditNote} // 600 available
        />
      );

      const inputs = screen.getAllByPlaceholderText('0.00') as HTMLInputElement[];
      // Allocate 700 (exceeds 600)
      fireEvent.change(inputs[1], { target: { value: '700' } });

      const submitBtn = screen.getByText('Apply Credit');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/exceeds available credit/i)).toBeDefined();
      });
      expect(applyMock).not.toHaveBeenCalled();
    });

    it('successfully calls applyCreditNoteToInvoice and completes application', async () => {
      const applyMock = vi.fn().mockResolvedValue({ success: true });
      const onSuccessMock = vi.fn();
      const onCloseMock = vi.fn();

      vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue({
        invoices: mockInvoices,
        clients: mockClients,
        settings: mockSettings,
        applyCreditNoteToInvoice: applyMock,
      } as any);

      render(
        <ApplyCreditNoteModal
          isOpen={true}
          onClose={onCloseMock}
          creditNote={mockCreditNote}
          onSuccess={onSuccessMock}
        />
      );

      const autoBtn = screen.getByText('Auto-Allocate');
      fireEvent.click(autoBtn);

      const submitBtn = screen.getByText('Apply Credit');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(applyMock).toHaveBeenCalledTimes(2);
      });
      expect(applyMock).toHaveBeenCalledWith('cn-101', 'inv-1', 300, expect.any(String));
      expect(applyMock).toHaveBeenCalledWith('cn-101', 'inv-2', 300, expect.any(String));
    });
  });

  describe('2. RecordRefundModal', () => {
    it('renders remaining credit and populates bank/cash account options', () => {
      vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue({
        accounts: mockBankAccounts,
        clients: mockClients,
        settings: mockSettings,
        recordCustomerRefund: vi.fn(),
      } as any);

      render(
        <RecordRefundModal
          isOpen={true}
          onClose={vi.fn()}
          creditNote={mockCreditNote}
        />
      );

      expect(screen.getByText('Refund Customer')).toBeDefined();
      expect(screen.getByText(/HDFC Operating Bank/)).toBeDefined();
      expect(screen.getByText(/Petty Cash/)).toBeDefined();
    });

    it('validates refund amount does not exceed available credit', async () => {
      const refundMock = vi.fn();
      vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue({
        accounts: mockBankAccounts,
        clients: mockClients,
        settings: mockSettings,
        recordCustomerRefund: refundMock,
      } as any);

      render(
        <RecordRefundModal
          isOpen={true}
          onClose={vi.fn()}
          creditNote={mockCreditNote} // 600 available
        />
      );

      const amountInput = screen.getByDisplayValue('600') as HTMLInputElement;
      fireEvent.change(amountInput, { target: { value: '800' } });

      const submitBtn = screen.getByText('Confirm Refund');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/cannot exceed available credit/i)).toBeDefined();
      });
      expect(refundMock).not.toHaveBeenCalled();
    });

    it('submits refund payload correctly to recordCustomerRefund', async () => {
      const refundMock = vi.fn().mockResolvedValue({ refundId: 'ref-1' });
      vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue({
        accounts: mockBankAccounts,
        clients: mockClients,
        settings: mockSettings,
        recordCustomerRefund: refundMock,
      } as any);

      render(
        <RecordRefundModal
          isOpen={true}
          onClose={vi.fn()}
          creditNote={mockCreditNote}
        />
      );

      const submitBtn = screen.getByText('Confirm Refund');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(refundMock).toHaveBeenCalledWith({
          customerId: 'client-1',
          creditNoteId: 'cn-101',
          refundDate: expect.any(String),
          amount: 600,
          refundAccountId: 'acc-bank-1',
          reference: undefined,
          notes: 'Refund for Credit Note CN-2026-0001',
        });
      });
    });
  });

  describe('3. CreditNotesView KPIs & Actions', () => {
    it('accurately computes summary KPIs for credits issued, unused, and settled', () => {
      const testNotes: CreditNote[] = [
        {
          id: 'cn-1',
          cnNumber: 'CN-001',
          clientName: 'Client A',
          originalInvoiceNumber: 'INV-1',
          issueDate: '2026-09-01',
          totalAmount: 1000,
          remainingAmount: 400,
          status: 'Open',
          reason: 'Return',
        },
        {
          id: 'cn-2',
          cnNumber: 'CN-002',
          clientName: 'Client B',
          originalInvoiceNumber: 'INV-2',
          issueDate: '2026-09-02',
          totalAmount: 500,
          remainingAmount: 0,
          status: 'Closed',
          reason: 'Discount',
        },
      ];

      vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue({
        creditNotes: testNotes,
        addCreditNote: vi.fn(),
        invoices: [],
        clients: mockClients,
        accounts: mockBankAccounts,
        settings: mockSettings,
      } as any);

      render(<CreditNotesView />);

      // Total Issued = 1500
      expect(screen.getByText('₹1,500.00')).toBeDefined();
      // Unused Available = 400
      expect(screen.getAllByText('₹400.00').length).toBeGreaterThanOrEqual(1);
      // Applied / Settled = 1100
      expect(screen.getByText('₹1,100.00')).toBeDefined();
    });

    it('filters credit notes by search query', () => {
      const testNotes: CreditNote[] = [
        {
          id: 'cn-1',
          cnNumber: 'CN-ALPHA-01',
          clientName: 'Stark Industries',
          originalInvoiceNumber: 'INV-1',
          issueDate: '2026-09-01',
          totalAmount: 500,
          remainingAmount: 500,
          status: 'Open',
          reason: 'Deficiency',
        },
        {
          id: 'cn-2',
          cnNumber: 'CN-BETA-02',
          clientName: 'Wayne Enterprises',
          originalInvoiceNumber: 'INV-2',
          issueDate: '2026-09-02',
          totalAmount: 700,
          remainingAmount: 0,
          status: 'Closed',
          reason: 'Return',
        },
      ];

      vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue({
        creditNotes: testNotes,
        addCreditNote: vi.fn(),
        invoices: [],
        clients: mockClients,
        accounts: mockBankAccounts,
        settings: mockSettings,
      } as any);

      render(<CreditNotesView />);

      expect(screen.getByText('Stark Industries')).toBeDefined();
      expect(screen.getByText('Wayne Enterprises')).toBeDefined();

      const searchInput = screen.getByPlaceholderText(/search credit note/i);
      fireEvent.change(searchInput, { target: { value: 'Stark' } });

      expect(screen.getByText('Stark Industries')).toBeDefined();
      expect(screen.queryByText('Wayne Enterprises')).toBeNull();
    });
  });
});
