// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { BooksProvider, useBooks } from '../context/BooksContext';
import { apiClient } from '../api/client';
import { Invoice, Bill, PaymentReceipt } from '../types';

describe('BooksContext State Management & Financial Mutations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BooksProvider>{children}</BooksProvider>
  );

  it('1. Initializes with default organizations and settings', () => {
    const { result } = renderHook(() => useBooks(), { wrapper });
    expect(result.current.organizations.length).toBeGreaterThan(0);
    expect(result.current.currentOrg).toBeDefined();
    expect(result.current.settings).toBeDefined();
    expect(Array.isArray(result.current.accounts)).toBe(true);
  });

  it('2. Switches active organization and updates currentOrg state', () => {
    const { result } = renderHook(() => useBooks(), { wrapper });
    const targetOrg = result.current.organizations[0];

    act(() => {
      result.current.switchOrganization(targetOrg.id);
    });

    expect(result.current.currentOrg.id).toBe(targetOrg.id);
  });

  it('3. addInvoice posts to server and returns normalized invoice', async () => {
    const mockServerInvoice = {
      id: 'inv-srv-1',
      invoiceNumber: 'INV-2026-001',
      clientId: 'client-1',
      clientName: 'Acme Global',
      issueDate: '2026-08-01',
      dueDate: '2026-08-30',
      totalAmount: 1000,
      balanceDue: 1000,
      paidAmount: 0,
      status: 'Sent',
    };

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: mockServerInvoice, error: null, status: 200 });
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [], error: null, status: 200 });

    const { result } = renderHook(() => useBooks(), { wrapper });

    let created: Invoice | undefined;
    await act(async () => {
      created = await result.current.addInvoice({
        clientId: 'client-1',
        clientName: 'Acme Global',
        issueDate: '2026-08-01',
        dueDate: '2026-08-30',
        items: [
          { id: 'item-1', description: 'Consulting', quantity: 10, unitPrice: 100, taxRate: 0, amount: 1000 },
        ],
        subtotal: 1000,
        taxTotal: 0,
        discount: 0,
        totalAmount: 1000,
        paidAmount: 0,
        balanceDue: 1000,
        notes: 'Test invoice',
      } as any);
    });

    expect(created).toBeDefined();
    expect(created?.id).toBe('inv-srv-1');
    expect(created?.invoiceNumber).toBe('INV-2026-001');
  });

  it('4. addBill posts to server and returns created bill', async () => {
    const mockBill = {
      id: 'bill-srv-1',
      billNumber: 'BILL-2026-001',
      vendorId: 'vend-1',
      vendorName: 'Global Cloud Services',
      billDate: '2026-08-01',
      dueDate: '2026-08-30',
      totalAmount: 500,
      amountPaid: 0,
      status: 'Unpaid',
    };

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: mockBill, error: null, status: 200 });
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [], error: null, status: 200 });

    const { result } = renderHook(() => useBooks(), { wrapper });

    let createdBill: Bill | undefined;
    await act(async () => {
      createdBill = await result.current.addBill({
        billNumber: 'BILL-2026-001',
        vendorId: 'vend-1',
        vendorName: 'Global Cloud Services',
        billDate: '2026-08-01',
        dueDate: '2026-08-30',
        totalAmount: 500,
        amountPaid: 0,
        status: 'Unpaid',
      });
    });

    expect(createdBill).toBeDefined();
    expect(createdBill?.id).toBe('bill-srv-1');
    expect(createdBill?.totalAmount).toBe(500);
  });

  it('5. addPaymentReceived posts payment receipt to server', async () => {
    const mockPayment = {
      id: 'pay-rec-1',
      paymentNumber: 'PAY-001',
      clientId: 'client-1',
      clientName: 'Acme Global',
      paymentDate: '2026-08-15',
      amount: 500,
      paymentMode: 'Bank Transfer',
      depositToAccountId: 'acc-bank-1',
    };

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: mockPayment, error: null, status: 200 });
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [], error: null, status: 200 });

    const { result } = renderHook(() => useBooks(), { wrapper });

    let paymentCreated: PaymentReceipt | undefined;
    await act(async () => {
      paymentCreated = await result.current.addPaymentReceived({
        paymentNumber: 'PAY-001',
        clientId: 'client-1',
        clientName: 'Acme Global',
        paymentDate: '2026-08-15',
        amount: 500,
        paymentMethod: 'Bank Transfer' as any,
        depositToAccountId: 'acc-bank-1',
      });
    });

    expect(paymentCreated).toBeDefined();
    expect(paymentCreated?.id).toBe('pay-rec-1');
  });

  it('6. updateSettings updates userPreferences state immediately', () => {
    const { result } = renderHook(() => useBooks(), { wrapper });

    act(() => {
      result.current.updateSettings({
        userPreferences: {
          ...result.current.settings.userPreferences,
          theme: 'Dark',
          currencyFormat: '1.234.567,89',
        },
      });
    });

    expect(result.current.settings.userPreferences.theme).toBe('Dark');
    expect(result.current.settings.userPreferences.currencyFormat).toBe('1.234.567,89');
  });

  it('7. addPaymentMade posts vendor payment to server and returns created record', async () => {
    const mockVendorPayment = {
      id: 'pay-made-1',
      paymentNumber: 'PAY-2026-001',
      vendorId: 'vend-1',
      vendorName: 'Global Cloud Services',
      paymentDate: '2026-08-15',
      amount: 500,
      paymentMode: 'Bank Wire / NEFT / RTGS',
      reference: 'UTR-123456',
    };

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: mockVendorPayment, error: null, status: 201 });
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [], error: null, status: 200 });

    const { result } = renderHook(() => useBooks(), { wrapper });

    let created: any;
    await act(async () => {
      created = await result.current.addPaymentMade({
        paymentNumber: 'PAY-2026-001',
        vendorId: 'vend-1',
        vendorName: 'Global Cloud Services',
        billNumber: 'BILL-001',
        paymentDate: '2026-08-15',
        paymentMethod: 'Bank Wire / NEFT / RTGS',
        paidFromAccountId: 'acc-bank-1',
        referenceNumber: 'UTR-123456',
        amount: 500,
      });
    });

    expect(created).toBeDefined();
    expect(created?.id).toBe('pay-made-1');
    expect(created?.amount).toBe(500);
  });

  it('8. addPaymentMade throws if paidFromAccountId is missing', async () => {
    const { result } = renderHook(() => useBooks(), { wrapper });
    await expect(
      result.current.addPaymentMade({
        paymentNumber: 'PAY-2026-002',
        vendorId: 'vend-1',
        vendorName: 'Global Cloud Services',
        billNumber: 'BILL-001',
        paymentDate: '2026-08-15',
        paymentMethod: 'Bank Wire / NEFT / RTGS',
        referenceNumber: 'UTR-123456',
        amount: 500,
      } as any)
    ).rejects.toThrow('Disbursement bank or cash account (paidFromAccountId) is required.');
  });

  it('9. addVendorAdvance posts to /finance/vendor-advances and returns created advance', async () => {
    const mockVendorAdvance = {
      id: 'adv-srv-1',
      advanceNumber: 'ADV-2026-001',
      vendorId: 'vend-1',
      amount: 1500,
      unappliedAmount: 1500,
      status: 'AVAILABLE',
    };

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: mockVendorAdvance, error: null, status: 201 });
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [], error: null, status: 200 });

    const { result } = renderHook(() => useBooks(), { wrapper });

    let created: any;
    await act(async () => {
      created = await result.current.addVendorAdvance({
        vendorId: 'vend-1',
        vendorName: 'Global Cloud Services',
        amount: 1500,
        paidFromAccountId: 'acc-bank-1',
        paidDate: '2026-08-15',
        paymentMode: 'Bank Wire / NEFT / RTGS',
        reference: 'ADV-REF-1',
      });
    });

    expect(created).toBeDefined();
    expect(created?.id).toBe('adv-srv-1');
    expect(created?.amount).toBe(1500);
  });

  it('10. keeps the chart of accounts available when vendor settlements are disabled', async () => {
    const account = {
      id: 'acc-plywood',
      code: '4003',
      name: 'Plywood',
      type: 'Expense',
      subType: 'Office & Administrative',
      balance: 0,
      status: 'Active',
    };
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');

    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') {
        return { data: [{ id: 'org-1', name: 'Sense Studios', publicOrgId: 'PUB-1', currency: 'INR', timezone: 'Asia/Kolkata', status: 'Active' }], error: null, status: 200 } as any;
      }
      if (endpoint === '/auth/me') {
        return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      }
      if (endpoint === '/finance/accounts') return { data: [account], error: null, status: 200 } as any;
      if (endpoint === '/finance/vendor-payments') {
        return { data: null, error: 'This financial workflow is unavailable until its atomic posting and reversal controls are enabled.', status: 503 } as any;
      }
      return { data: [], error: null, status: 200 } as any;
    });

    const { result } = renderHook(() => useBooks(), { wrapper });

    await waitFor(() => {
      expect(result.current.accounts).toEqual([account]);
    });
  });

  it('11. removes a chart account from local state only after the server confirms deletion', async () => {
    const account = {
      id: 'acc-delete', code: '6110', name: 'Temporary supplies', type: 'Expense', subType: 'Office & Administrative', balance: 0, status: 'Active',
    };
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: [{ id: 'org-1', name: 'Sense Studios', publicOrgId: 'PUB-1', currency: 'INR', timezone: 'Asia/Kolkata', status: 'Active' }], error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/accounts') return { data: [account], error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { deleted: true, id: account.id }, error: null, status: 200 });
    const { result } = renderHook(() => useBooks(), { wrapper });

    await waitFor(() => expect(result.current.accounts).toEqual([account]));
    await act(async () => { await result.current.deleteAccount(account.id); });

    expect(deleteSpy).toHaveBeenCalledWith('/finance/accounts/acc-delete');
    expect(result.current.accounts).toEqual([]);
  });

  it('12. useBooks throws if called outside BooksProvider', () => {
    expect(() => renderHook(() => useBooks())).toThrow('useBooks must be used within a BooksProvider');
  });
});
