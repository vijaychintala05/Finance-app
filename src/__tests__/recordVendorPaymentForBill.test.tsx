// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { RecordVendorPaymentModal } from '../components/purchases/RecordVendorPaymentModal';
import { BillDetailsModal } from '../components/purchases/BillDetailsModal';
import { SettlementWorkspace } from '../components/accounting/SettlementWorkspace';
import * as BooksContext from '../context/BooksContext';
import { Bill, Vendor } from '../types';
import { apiClient } from '../api/client';

describe('Verification Suite: Record Vendor Payment for Bill Workflow', () => {
  const mockVendor: Vendor = {
    id: 'vend-acme',
    name: 'Acme Supplies',
    companyName: 'Acme Supplies Pvt Ltd',
    payablesBalance: 15000,
    status: 'Active',
  };

  const mockVendor2: Vendor = {
    id: 'vend-beta',
    name: 'Beta Global Logistics',
    companyName: 'Beta Global Logistics',
    payablesBalance: 5000,
    status: 'Active',
  };

  const mockBill: Bill = {
    id: 'bill-101',
    billNumber: 'BILL-2026-001',
    vendorId: 'vend-acme',
    vendorName: 'Acme Supplies Pvt Ltd',
    billDate: '2026-09-01',
    dueDate: '2026-09-30',
    totalAmount: 15000,
    amountPaid: 5000,
    balanceDue: 10000,
    status: 'Partially Paid',
  };

  const mockBill2: Bill = {
    id: 'bill-202',
    billNumber: 'BILL-2026-002',
    vendorId: 'vend-beta',
    vendorName: 'Beta Global Logistics',
    billDate: '2026-09-05',
    dueDate: '2026-10-05',
    totalAmount: 5000,
    amountPaid: 0,
    balanceDue: 5000,
    status: 'Unpaid',
  };

  const mockAccounts = [
    { id: 'acc-hdfc', code: '1010', name: 'HDFC Current Account', type: 'Asset', subType: 'Bank', status: 'Active', allowDirectPosting: true, balance: 500000 },
    { id: 'acc-petty', code: '1000', name: 'Petty Cash', type: 'Asset', subType: 'Cash', status: 'Active', allowDirectPosting: true, balance: 25000 },
  ];

  const mockAddPaymentMade = vi.fn().mockResolvedValue({ id: 'pay-1', amount: 10000 });
  const mockAddVendorAdvance = vi.fn().mockResolvedValue({ id: 'adv-1', amount: 10000 });

  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('firmbooks_current_org_id', 'test-org');

    vi.spyOn(BooksContext, 'useBooks').mockReturnValue({
      vendors: [mockVendor, mockVendor2],
      bills: [mockBill, mockBill2],
      accounts: mockAccounts as any,
      paymentsMade: [],
      addPaymentMade: mockAddPaymentMade,
      addVendorAdvance: mockAddVendorAdvance,
      refreshAccounts: vi.fn().mockResolvedValue(undefined),
      deleteBill: vi.fn().mockResolvedValue(undefined),
      updateBill: vi.fn(),
      settings: {
        currencySymbol: '₹',
        currencyCode: 'INR',
        dateFormat: 'YYYY-MM-DD',
      },
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it('1. RecordVendorPaymentModal initializes with initialBill matching vendor by companyName and auto-fills remaining balance', () => {
    const handleClose = vi.fn();

    render(
      <RecordVendorPaymentModal
        isOpen={true}
        onClose={handleClose}
        initialBill={mockBill}
      />
    );

    // Modal renders
    expect(screen.getByText('Record Vendor Payment')).toBeDefined();

    // Vendor select should be set to Acme Supplies
    const vendorSelect = screen.getByLabelText(/vendor \/ supplier/i) as HTMLSelectElement;
    expect(vendorSelect).toBeDefined();
    expect(vendorSelect.value).toBe('vend-acme');

    // Target bill is selected and amount is 10000 (balance due)
    const amountInput = screen.getByLabelText(/disbursement amount/i) as HTMLInputElement;
    expect(amountInput).toBeDefined();
    expect(amountInput.value).toBe('10000');
  });

  it('2. Changing vendor dynamically switches the open bills and updates balance due', () => {
    render(
      <RecordVendorPaymentModal
        isOpen={true}
        onClose={vi.fn()}
        initialBill={mockBill}
      />
    );

    const vendorSelect = screen.getByLabelText(/vendor \/ supplier/i) as HTMLSelectElement;
    // Switch to Beta vendor
    fireEvent.change(vendorSelect, { target: { value: 'vend-beta' } });

    expect(vendorSelect.value).toBe('vend-beta');

    // Amount input updates to the Beta bill balance (5000)
    const amountInput = screen.getByLabelText(/disbursement amount/i) as HTMLInputElement;
    expect(amountInput.value).toBe('5000');

    // Target bill select shows BILL-2026-002
    const billSelect = screen.getByLabelText(/target open bill/i) as HTMLSelectElement;
    expect(billSelect.value).toBe('bill-202');
  });

  it('3. Submitting payment records allocation to bill and closes modal', async () => {
    const handleClose = vi.fn();

    render(
      <RecordVendorPaymentModal
        isOpen={true}
        onClose={handleClose}
        initialBill={mockBill}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /post payment remittance/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAddPaymentMade).toHaveBeenCalledWith(
        expect.objectContaining({
          vendorId: 'vend-acme',
          billId: 'bill-101',
          amount: 10000,
          allocations: [{ billId: 'bill-101', amount: 10000 }],
        })
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('4. BillDetailsModal opens RecordVendorPaymentModal directly without error or dead alert when Record Bill Payment is clicked', () => {
    const handleClose = vi.fn();

    render(
      <BillDetailsModal
        isOpen={true}
        onClose={handleClose}
        bill={mockBill}
      />
    );

    const payBtn = screen.getByRole('button', { name: /record bill payment/i });
    expect(payBtn).toBeDefined();
    fireEvent.click(payBtn);

    // Should open the payment modal
    expect(screen.getByText('Record Vendor Payment')).toBeDefined();
  });

  it('5. SettlementWorkspace populates open bills dropdown for payables with camelCase vendorId and balanceDue', async () => {
    // Mock apiClient.get
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/finance/vendor-payments') {
        return { data: [] };
      }
      if (url === '/finance/vendors') {
        return {
          data: [
            { id: 'vend-acme', name: 'Acme Supplies', display_name: 'Acme Supplies' },
            { id: 'vend-beta', name: 'Beta Global Logistics', display_name: 'Beta Global Logistics' },
          ],
        };
      }
      if (url === '/finance/bills') {
        return {
          data: [
            {
              id: 'bill-101',
              billNumber: 'BILL-2026-001',
              vendorId: 'vend-acme',
              vendorName: 'Acme Supplies',
              totalAmount: 15000,
              balanceDue: 10000,
              status: 'Partially Paid',
            },
          ],
        };
      }
      if (url === '/finance/accounts') {
        return {
          data: [
            { id: 'acc-bank', code: '1010', name: 'HDFC Checking', type: 'Asset', status: 'Active' },
          ],
        };
      }
      if (url === '/finance/vendor-advances') {
        return { data: [] };
      }
      if (url === '/finance/debit-notes') {
        return { data: [] };
      }
      return { data: [] };
    });

    render(
      <SettlementWorkspace side="payable" initialResource="payments" />
    );

    // Open create modal
    await waitFor(() => {
      expect(screen.getByText('Payables settlement')).toBeDefined();
    });

    const newTxBtn = screen.getByRole('button', { name: /new transaction/i });
    fireEvent.click(newTxBtn);

    // Modal appears
    await waitFor(() => {
      expect(screen.getByText(/new payables settlement transaction/i)).toBeDefined();
    });

    // Select Vendor vend-acme
    const vendorSelect = screen.getByLabelText(/^vendor$/i) as HTMLSelectElement;
    fireEvent.change(vendorSelect, { target: { value: 'vend-acme' } });

    // The Bill dropdown should now list BILL-2026-001!
    await waitFor(() => {
      const billSelect = screen.getByLabelText(/bill/i) as HTMLSelectElement;
      expect(billSelect).toBeDefined();
      const options = Array.from(billSelect.options).map((o) => o.text);
      expect(options.some((text) => text.includes('BILL-2026-001'))).toBe(true);
    });
  });
});
