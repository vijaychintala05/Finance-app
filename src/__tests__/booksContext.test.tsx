// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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

  it('7. useBooks throws if called outside BooksProvider', () => {
    expect(() => renderHook(() => useBooks())).toThrow('useBooks must be used within a BooksProvider');
  });
});
