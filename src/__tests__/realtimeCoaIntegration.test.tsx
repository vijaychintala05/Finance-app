// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BillsView } from '../components/purchases/BillsView';
import { RecordVendorPaymentModal } from '../components/purchases/RecordVendorPaymentModal';
import { InvoiceEditorModal } from '../components/invoices/InvoiceEditorModal';
import { RecordCustomerPaymentModal } from '../components/sales/RecordCustomerPaymentModal';
import { Account, Bill, Vendor, Client, Invoice } from '../types';

const mockAccounts: Account[] = [
  {
    id: 'acc-cogs-1',
    code: '5010',
    name: 'Raw Materials & Hardware',
    type: 'Cost of Goods Sold',
    subType: 'Materials',
    balance: 5000,
    status: 'Active',
    normalBalance: 'Debit',
  },
  {
    id: 'acc-exp-1',
    code: '6010',
    name: 'Office Electricity',
    type: 'Expense',
    subType: 'Office & Administrative',
    balance: 800,
    status: 'Active',
    normalBalance: 'Debit',
  },
  {
    id: 'acc-oth-exp',
    code: '6900',
    name: 'Bank Financing Fees',
    type: 'Other Expense',
    subType: 'Other Expenses',
    balance: 150,
    status: 'Active',
    normalBalance: 'Debit',
  },
  {
    id: 'acc-rev-1',
    code: '4010',
    name: 'Design & Architecture Fees',
    type: 'Revenue',
    subType: 'Operating Revenue',
    balance: 20000,
    status: 'Active',
    normalBalance: 'Credit',
  },
  {
    id: 'acc-oth-inc',
    code: '4900',
    name: 'Interest on Fixed Deposits',
    type: 'Other Income',
    subType: 'Interest Income',
    balance: 300,
    status: 'Active',
    normalBalance: 'Credit',
  },
  {
    id: 'acc-bank-1',
    code: '1010',
    name: 'HDFC Corporate Current Account',
    type: 'Asset',
    subType: 'Bank',
    balance: 50000,
    status: 'Active',
    normalBalance: 'Debit',
  },
  {
    id: 'acc-cc-1',
    code: '2110',
    name: 'ICICI Business Credit Card',
    type: 'Liability',
    subType: 'Credit Cards',
    balance: 12000,
    status: 'Active',
    normalBalance: 'Credit',
  },
];

const mockVendors: Vendor[] = [
  {
    id: 'vend-1',
    name: 'Steel Suppliers Ltd',
    companyName: 'Steel Suppliers Ltd',
    contactPerson: 'Arun',
    email: 'arun@steel.com',
    phone: '9999999999',
    category: 'Materials',
    paymentTerms: 'Net 30',
    address: 'Industrial Area',
    payablesBalance: 0,
    status: 'Active',
  },
];

const mockClients: Client[] = [
  {
    id: 'client-1',
    name: 'Metropolis Infra',
    companyName: 'Metropolis Infra Pvt Ltd',
    email: 'info@metropolis.com',
    phone: '8888888888',
    billingAddress: 'Tower A',
    currency: 'INR',
    paymentTerms: 'Net 30',
    createdAt: '2026-01-01',
  },
];

const mockBills: Bill[] = [
  {
    id: 'bill-1',
    billNumber: 'BILL-001',
    vendorId: 'vend-1',
    vendorName: 'Steel Suppliers Ltd',
    billDate: '2026-03-01',
    dueDate: '2026-03-31',
    totalAmount: 1000,
    amountPaid: 0,
    balanceDue: 1000,
    status: 'Unpaid',
    notes: 'Materials bill',
  },
];

const mockInvoices: Invoice[] = [
  {
    id: 'inv-1',
    invoiceNumber: 'INV-001',
    clientId: 'client-1',
    clientName: 'Metropolis Infra',
    clientEmail: 'billing@metropolis.infra',
    issueDate: '2026-03-01',
    dueDate: '2026-03-31',
    subtotal: 5000,
    taxTotal: 0,
    discount: 0,
    totalAmount: 5000,
    paidAmount: 0,
    balanceDue: 5000,
    status: 'Sent',
    items: [],
    createdAt: '2026-03-01',
  },
];

const mockRefreshAccounts = vi.fn().mockResolvedValue(undefined);

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    accounts: mockAccounts,
    refreshAccounts: mockRefreshAccounts,
    vendors: mockVendors,
    clients: mockClients,
    bills: mockBills,
    invoices: mockInvoices,
    projects: [],
    salespersons: [],
    settings: { currencyCode: 'INR', currencySymbol: '₹', defaultTaxRate: 18 },
    addBill: vi.fn(),
    addPaymentMade: vi.fn(),
    addPaymentReceived: vi.fn(),
    addInvoice: vi.fn(),
    updateInvoice: vi.fn(),
  }),
}));

describe('System-wide Realtime Chart of Accounts Integration Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('BillsView Integration', () => {
    it('triggers realtime account fetch and shows Cost of Goods Sold in the bill creation modal', async () => {
      render(<BillsView autoOpenCreateModal={true} />);

      expect(mockRefreshAccounts).toHaveBeenCalled();

      // Check Cost of Goods Sold and Other Expense appear in the dropdown
      expect(screen.getByText(/5010 - Raw Materials & Hardware \(Cost of Goods Sold\)/i)).toBeDefined();
      expect(screen.getByText(/6010 - Office Electricity \(Expense\)/i)).toBeDefined();
      expect(screen.getByText(/6900 - Bank Financing Fees \(Other Expense\)/i)).toBeDefined();
    });

    it('provides an inline refresh button in bill creation to re-query accounts', () => {
      render(<BillsView autoOpenCreateModal={true} />);

      const refreshBtn = screen.getByRole('button', { name: /refresh/i });
      expect(refreshBtn).toBeDefined();

      fireEvent.click(refreshBtn);
      expect(mockRefreshAccounts).toHaveBeenCalledTimes(2);
    });
  });

  describe('RecordVendorPaymentModal Integration', () => {
    it('triggers realtime account fetch and includes Credit Cards in disbursement accounts', () => {
      render(<RecordVendorPaymentModal isOpen={true} onClose={vi.fn()} initialBill={mockBills[0]} />);

      expect(mockRefreshAccounts).toHaveBeenCalled();

      // Check both Bank and Credit Cards are available
      expect(screen.getByText(/1010 — HDFC Corporate Current Account \(Bank\)/i)).toBeDefined();
      expect(screen.getByText(/2110 — ICICI Business Credit Card \(Credit Cards\)/i)).toBeDefined();
    });
  });

  describe('InvoiceEditorModal Integration', () => {
    it('triggers realtime account fetch and includes Other Income accounts', () => {
      render(<InvoiceEditorModal isOpen={true} onClose={vi.fn()} />);

      expect(mockRefreshAccounts).toHaveBeenCalled();

      // Revenue and Other Income both available
      expect(screen.getAllByText(/4010 — Design & Architecture Fees/i)).toHaveLength(2);
      expect(screen.getAllByText(/4900 — Interest on Fixed Deposits/i)).toHaveLength(2);
    });
  });

  describe('RecordCustomerPaymentModal Integration', () => {
    it('triggers realtime account fetch and lists active bank deposit accounts', () => {
      render(
        <RecordCustomerPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          targetInvoice={mockInvoices[0]}
        />
      );

      expect(mockRefreshAccounts).toHaveBeenCalled();
      expect(screen.getByText(/1010 — HDFC Corporate Current Account/i)).toBeDefined();
    });
  });
});
