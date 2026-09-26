// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { BooksProvider, useBooks } from '../context/BooksContext';
import { apiClient, ApiRequestError } from '../api/client';

const organizations = [
  { id: 'org-1', name: 'Northwind Books', publicOrgId: 'PUB-1', currency: 'USD', timezone: 'UTC', status: 'Active' },
  { id: 'org-2', name: 'Southwind Books', publicOrgId: 'PUB-2', currency: 'USD', timezone: 'UTC', status: 'Active' },
];
const invoiceRow = {
  id: 'invoice-1', organizationId: 'org-1', invoiceNumber: 'INV-101', customerId: 'customer-1',
  customerName: 'Northwind', customerEmail: 'billing@example.test', issueDate: '2026-09-01', dueDate: '2026-09-30',
  subtotal: 100, taxTotal: 0, discount: 0, totalAmount: 100, paidAmount: 0, balanceDue: 100,
  status: 'SENT', journalEntryId: 'journal-original', lineItems: [], notes: '',
};
const wrapper = ({ children }: { children: React.ReactNode }) => <BooksProvider>{children}</BooksProvider>;

describe('Invoice void status recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(apiClient, 'getInvoiceVoidOperationStatus').mockResolvedValue({
      data: { state: 'COMPLETED', invoiceId: 'invoice-1', reversalJournalId: 'journal-reversal', requestId: 'req-void' },
      error: null, status: 200,
    } as any);
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
  });
  afterEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it('verifies a confirmed void by targeted read after broad refresh failure', async () => {
    let failBroadRefresh = false;
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.test', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/invoices/invoice-1') return { data: { invoice: { ...invoiceRow, status: 'VOIDED', balanceDue: 0, reversalJournalId: 'journal-reversal', lineItems: [{ id: 'line-1', description: 'Work', amount: 100 }] } }, error: null, status: 200, requestId: 'req-verify' } as any;
      if (endpoint === '/finance/accounts' && failBroadRefresh) return { data: null, error: 'Account list unavailable', status: 503 } as any;
      if (endpoint === '/finance/invoices') return { data: [invoiceRow], error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { result: { success: true, invoiceId: 'invoice-1', journalEntryId: 'journal-reversal' } },
      error: null, status: 200, requestId: 'req-void',
    } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.invoices.some((invoice) => invoice.id === 'invoice-1')).toBe(true));
    failBroadRefresh = true;

    let receipt: Awaited<ReturnType<typeof result.current.deleteInvoice>> | undefined;
    await act(async () => { receipt = await result.current.deleteInvoice('invoice-1', 'Duplicate entry'); });

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(receipt).toEqual({ requestId: 'req-void', reversalJournalId: 'journal-reversal', refreshFailed: true, verificationStatus: 'void' });
    expect(result.current.invoices.find((invoice) => invoice.id === 'invoice-1')).toMatchObject({ status: 'Void', balanceDue: 0, reversalJournalId: 'journal-reversal' });
    expect(result.current.invoiceVoidGuards).toMatchObject([{ invoiceId: 'invoice-1', status: 'verified', committed: true, reversalJournalId: 'journal-reversal' }]);

    let verification: Awaited<ReturnType<typeof result.current.verifyInvoiceVoidStatus>> | undefined;
    await act(async () => { verification = await result.current.verifyInvoiceVoidStatus('invoice-1'); });
    expect(getSpy).toHaveBeenCalledWith('/finance/invoices/invoice-1', 'org-1');
    expect(verification).toEqual({ status: 'void', requestId: 'req-void' });
    expect(result.current.invoiceVoidGuards).toMatchObject([{ invoiceId: 'invoice-1', status: 'verified', committed: true, reversalJournalId: 'journal-reversal' }]);
    expect(result.current.invoices.find((invoice) => invoice.id === 'invoice-1')).toMatchObject({
      status: 'Void', balanceDue: 0, reversalJournalId: 'journal-reversal', clientName: 'Northwind', items: [{ id: 'line-1' }],
    });
  });

  it('restores a pending guard after reload and checks status before enabling exact retry', async () => {
    sessionStorage.setItem('firmbooks_invoice_void_guards_v1', JSON.stringify([{
      invoiceId: 'invoice-1', organizationId: 'org-1', userId: 'user-1', status: 'pending', committed: false,
      idempotencyKey: 'invoice-void-reload-key-123', reason: 'Duplicate entry',
      notice: { tone: 'warning', title: 'Invoice void in progress', message: 'Verify the saved operation.' },
    }]));
    vi.mocked(apiClient.getInvoiceVoidOperationStatus).mockResolvedValueOnce({ data: { state: 'UNKNOWN' }, error: null, status: 200 } as any);
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.test', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/invoices') return { data: [invoiceRow], error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.invoices.some((invoice) => invoice.id === 'invoice-1')).toBe(true));
    expect(result.current.invoiceVoidGuards).toMatchObject([{ status: 'pending', idempotencyKey: 'invoice-void-reload-key-123' }]);

    let verification: Awaited<ReturnType<typeof result.current.verifyInvoiceVoidStatus>> | undefined;
    await act(async () => { verification = await result.current.verifyInvoiceVoidStatus('invoice-1'); });
    expect(verification?.status).toBe('pending');
    expect(apiClient.getInvoiceVoidOperationStatus).toHaveBeenCalledWith('invoice-1', 'invoice-void-reload-key-123', 'org-1', 'Duplicate entry');
    expect(getSpy).not.toHaveBeenCalledWith('/finance/invoices/invoice-1', 'org-1');
    expect(result.current.invoiceVoidGuards).toMatchObject([{ status: 'needs-verification', committed: false }]);
  });

  it('treats persisted verified state as a recovery hint and keeps an authoritative active invoice visible', async () => {
    sessionStorage.setItem('firmbooks_invoice_void_guards_v1', JSON.stringify([{
      invoiceId: 'invoice-1', organizationId: 'org-1', userId: 'user-1', status: 'verified', committed: true,
      idempotencyKey: 'invoice-void-stale-verified-key', reason: 'Duplicate entry', reversalJournalId: 'journal-reversal',
      notice: { tone: 'success', title: 'Invoice void verified', message: 'Old browser proof.' },
    }]));
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.test', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/invoices') return { data: [invoiceRow], error: null, status: 200 } as any;
      if (endpoint === '/finance/invoices/invoice-1') return { data: { invoice: invoiceRow }, error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.invoices.some((invoice) => invoice.id === 'invoice-1')).toBe(true));
    expect(result.current.invoices.find((invoice) => invoice.id === 'invoice-1')).toMatchObject({ status: 'Sent', balanceDue: 100 });
    expect(result.current.invoiceVoidGuards).toMatchObject([{ status: 'needs-verification', committed: true }]);

    let verification: Awaited<ReturnType<typeof result.current.verifyInvoiceVoidStatus>> | undefined;
    await act(async () => { verification = await result.current.verifyInvoiceVoidStatus('invoice-1'); });
    expect(verification?.status).toBe('conflict');
    expect(result.current.invoices.find((invoice) => invoice.id === 'invoice-1')).toMatchObject({ status: 'Sent', balanceDue: 100 });
    expect(result.current.invoiceVoidGuards).toMatchObject([{ status: 'conflict', committed: true }]);
    expect(getSpy).toHaveBeenCalledWith('/finance/invoices/invoice-1', 'org-1');
  });

  it('refreshes the authoritative invoice before clearing a rejected already-voided request', async () => {
    vi.mocked(apiClient.getInvoiceVoidOperationStatus).mockResolvedValueOnce({
      data: { state: 'REJECTED', responseStatus: 409, code: 'INVOICE_ALREADY_VOIDED', error: 'Invoice is already voided' }, error: null, status: 200,
    } as any);
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.test', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/invoices') return { data: [invoiceRow], error: null, status: 200 } as any;
      if (endpoint === '/finance/invoices/invoice-1') return { data: { invoice: { ...invoiceRow, status: 'VOIDED', balanceDue: 0, reversalJournalId: 'journal-other' } }, error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    sessionStorage.setItem('firmbooks_invoice_void_guards_v1', JSON.stringify([{
      invoiceId: 'invoice-1', organizationId: 'org-1', userId: 'user-1', status: 'needs-verification', committed: false,
      idempotencyKey: 'invoice-void-rejected-key-123', reason: 'Duplicate entry',
      notice: { tone: 'warning', title: 'Invoice void unresolved', message: 'Verify.' },
    }]));
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.invoices.some((invoice) => invoice.id === 'invoice-1')).toBe(true));
    let verification: Awaited<ReturnType<typeof result.current.verifyInvoiceVoidStatus>> | undefined;
    await act(async () => { verification = await result.current.verifyInvoiceVoidStatus('invoice-1'); });
    expect(getSpy).toHaveBeenCalledWith('/finance/invoices/invoice-1', 'org-1');
    expect(verification).toMatchObject({ status: 'conflict', error: expect.stringContaining('already void') });
    expect(result.current.invoices.find((invoice) => invoice.id === 'invoice-1')).toMatchObject({ status: 'Void', balanceDue: 0, reversalJournalId: 'journal-other' });
    expect(result.current.invoiceVoidGuards).toEqual([]);
  });

  it('keeps an uncertain POST pending until the exact operation receipt and reversal journal are verified', async () => {
    vi.mocked(apiClient.getInvoiceVoidOperationStatus)
      .mockResolvedValueOnce({ data: { state: 'UNKNOWN' }, error: null, status: 200 } as any);
    let reversalVisible = false;
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.test', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/invoices/invoice-1') return { data: { invoice: reversalVisible ? { ...invoiceRow, status: 'VOIDED', balanceDue: 0, reversalJournalId: 'journal-reversal' } : invoiceRow }, error: null, status: 200, requestId: reversalVisible ? 'req-verify-void' : 'req-verify-active' } as any;
      if (endpoint === '/finance/invoices') return { data: [invoiceRow], error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    vi.spyOn(apiClient, 'post').mockRejectedValue(new ApiRequestError({ data: null, error: 'Network timed out', status: 500, errorCode: 'NETWORK_FAILURE', requestId: 'req-timeout' }, 'Invoice could not be voided'));
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.invoices.some((invoice) => invoice.id === 'invoice-1')).toBe(true));

    await act(async () => { await expect(result.current.deleteInvoice('invoice-1', 'Duplicate entry')).rejects.toThrow('Network timed out'); });
    expect(result.current.invoices.find((invoice) => invoice.id === 'invoice-1')?.status).toBe('Sent');
    expect(result.current.invoiceVoidGuards).toMatchObject([{ invoiceId: 'invoice-1', committed: false, requestId: 'req-timeout' }]);

    let verification: Awaited<ReturnType<typeof result.current.verifyInvoiceVoidStatus>> | undefined;
    await act(async () => { verification = await result.current.verifyInvoiceVoidStatus('invoice-1'); });
    expect(verification?.status).toBe('pending');
    expect(result.current.invoiceVoidGuards).toMatchObject([{ invoiceId: 'invoice-1', status: 'needs-verification', committed: false, requestId: 'req-timeout' }]);
    expect(result.current.invoices.find((invoice) => invoice.id === 'invoice-1')?.status).toBe('Sent');

    reversalVisible = true;
    await act(async () => { verification = await result.current.verifyInvoiceVoidStatus('invoice-1'); });
    expect(verification?.status).toBe('void');
    expect(result.current.invoiceVoidGuards).toMatchObject([{ invoiceId: 'invoice-1', status: 'verified', committed: true, reversalJournalId: 'journal-reversal' }]);
    expect(result.current.invoices.find((invoice) => invoice.id === 'invoice-1')).toMatchObject({ status: 'Void', reversalJournalId: 'journal-reversal' });
  });


  it.each([
    { label: 'missing journal', reversalJournalId: undefined },
    { label: 'different journal', reversalJournalId: 'journal-other' },
  ])('keeps a committed void guard on a $label and reconciles only after the exact journal appears', async ({ reversalJournalId }) => {
    vi.mocked(apiClient.getInvoiceVoidOperationStatus).mockResolvedValueOnce({
      data: { state: 'CONFLICT', invoiceId: 'invoice-1', reversalJournalId: 'journal-reversal', error: 'Evidence not reconciled.' }, error: null, status: 200,
    } as any);
    let authoritativeInvoice: any = { ...invoiceRow, status: 'VOIDED', balanceDue: 0, reversalJournalId };
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.test', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/invoices/invoice-1') return { data: { invoice: authoritativeInvoice }, error: null, status: 200, requestId: 'req-authoritative' } as any;
      if (endpoint === '/finance/invoices') return { data: [invoiceRow], error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { result: { success: true, invoiceId: 'invoice-1', journalEntryId: 'journal-reversal' } }, error: null, status: 200, requestId: 'req-confirmed-void' } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.invoices.some((invoice) => invoice.id === 'invoice-1')).toBe(true));

    let receipt: Awaited<ReturnType<typeof result.current.deleteInvoice>> | undefined;
    await act(async () => { receipt = await result.current.deleteInvoice('invoice-1', 'Duplicate entry'); });
    expect(receipt).toMatchObject({ verificationStatus: 'conflict', refreshFailed: true, reversalJournalId: 'journal-reversal' });
    expect(getSpy).not.toHaveBeenCalledWith('/finance/invoices/invoice-1', 'org-1');
    expect(result.current.invoiceVoidGuards).toMatchObject([{ invoiceId: 'invoice-1', status: 'conflict', committed: true, reversalJournalId: 'journal-reversal', requestId: 'req-confirmed-void' }]);
    expect(result.current.invoices.find((invoice) => invoice.id === 'invoice-1')?.status).toBe('Sent');

    authoritativeInvoice = { ...authoritativeInvoice, reversalJournalId: 'journal-reversal' };
    let verification: Awaited<ReturnType<typeof result.current.verifyInvoiceVoidStatus>> | undefined;
    await act(async () => { verification = await result.current.verifyInvoiceVoidStatus('invoice-1'); });
    expect(verification?.status).toBe('void');
    expect(result.current.invoiceVoidGuards).toMatchObject([{ invoiceId: 'invoice-1', status: 'verified', committed: true, reversalJournalId: 'journal-reversal' }]);
  });


  it('keeps a verified void projected when a pre-void invoice read resolves late', async () => {
    let delayNextInvoiceList = false;
    let delayedReadStarted = false;
    let releaseOldInvoiceRead!: (value: any) => void;
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.test', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/invoices/invoice-1') return { data: { invoice: { ...invoiceRow, status: 'VOIDED', balanceDue: 0, reversalJournalId: 'journal-reversal' } }, error: null, status: 200, requestId: 'req-verified' } as any;
      if (endpoint === '/finance/invoices' && delayNextInvoiceList) {
        delayNextInvoiceList = false;
        delayedReadStarted = true;
        return await new Promise((resolve) => { releaseOldInvoiceRead = resolve; }) as any;
      }
      if (endpoint === '/finance/invoices') return { data: [invoiceRow], error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { result: { success: true, invoiceId: 'invoice-1', journalEntryId: 'journal-reversal' } }, error: null, status: 200, requestId: 'req-void-before-stale-read' } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.invoices.some((invoice) => invoice.id === 'invoice-1')).toBe(true));

    delayNextInvoiceList = true;
    let oldRefresh!: ReturnType<typeof result.current.refreshTimeOperationStatus>;
    act(() => { oldRefresh = result.current.refreshTimeOperationStatus(); });
    await waitFor(() => expect(delayedReadStarted).toBe(true));

    let receipt: Awaited<ReturnType<typeof result.current.deleteInvoice>> | undefined;
    await act(async () => { receipt = await result.current.deleteInvoice('invoice-1', 'Duplicate entry'); });
    expect(receipt?.verificationStatus).toBe('void');
    expect(result.current.invoiceVoidGuards).toMatchObject([{ invoiceId: 'invoice-1', status: 'verified', reversalJournalId: 'journal-reversal' }]);
    await expect(result.current.deleteInvoice('invoice-1', 'Repeated after verification')).rejects.toThrow(/paused/i);
    expect(postSpy).toHaveBeenCalledTimes(1);

    await act(async () => releaseOldInvoiceRead({ data: [invoiceRow], error: null, status: 200 }));
    await act(async () => { await oldRefresh; });
    expect(getSpy).toHaveBeenCalledWith('/finance/invoices', 'org-1');
    expect(result.current.invoices.find((invoice) => invoice.id === 'invoice-1')).toMatchObject({ status: 'Void', balanceDue: 0, reversalJournalId: 'journal-reversal' });
  });

  it('does not let a void guard be bypassed by direct shared edit or payment calls, while unrelated invoice writes remain available', async () => {
    let resolveVoid!: (value: any) => void;
    let postCalls = 0;
    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(() => {
      postCalls += 1;
      if (postCalls === 1) return new Promise((resolve) => { resolveVoid = resolve; }) as any;
      return Promise.resolve({ data: { id: 'payment-2', paymentNumber: 'PAY-2' }, error: null, status: 201 } as any);
    });
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: { ...invoiceRow, id: 'invoice-2', invoiceNumber: 'INV-102' }, error: null, status: 200 } as any);
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.test', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/invoices') return { data: [invoiceRow, { ...invoiceRow, id: 'invoice-2', invoiceNumber: 'INV-102' }], error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.invoices.some((invoice) => invoice.id === 'invoice-1')).toBe(true));
    let pendingVoid!: ReturnType<typeof result.current.deleteInvoice>;
    let blockedDuplicateVoid!: ReturnType<typeof result.current.deleteInvoice>;
    let blockedUpdate!: ReturnType<typeof result.current.updateInvoice>;
    let blockedPayment!: ReturnType<typeof result.current.addPaymentReceived>;
    act(() => {
      pendingVoid = result.current.deleteInvoice('invoice-1', 'Duplicate entry');
      blockedDuplicateVoid = result.current.deleteInvoice('invoice-1', 'Repeated request');
      blockedUpdate = result.current.updateInvoice('invoice-1', { notes: 'late edit' }, '1');
      blockedPayment = result.current.addPaymentReceived({ invoiceId: 'invoice-1', paymentNumber: 'PAY-1', clientId: 'customer-1', clientName: 'Northwind', paymentDate: '2026-09-23', amount: 10, paymentMethod: 'Bank Transfer' } as any);
    });
    await expect(blockedDuplicateVoid).rejects.toThrow(/paused/i);
    await expect(blockedUpdate).rejects.toThrow(/paused/i);
    await expect(blockedPayment).rejects.toThrow(/paused/i);
    await waitFor(() => expect(resolveVoid).toBeDefined());
    expect(putSpy).not.toHaveBeenCalled();
    expect(postCalls).toBe(1);

    await act(async () => { await result.current.updateInvoice('invoice-2', { notes: 'unrelated edit' }, '1'); });
    await act(async () => { await result.current.addPaymentReceived({ invoiceId: 'invoice-2', paymentNumber: 'PAY-2', clientId: 'customer-1', clientName: 'Northwind', paymentDate: '2026-09-23', amount: 10, paymentMethod: 'Bank Transfer' } as any); });
    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(postCalls).toBe(2);
    act(() => resolveVoid({ data: { result: { success: true, invoiceId: 'invoice-1', journalEntryId: 'journal-reversal' } }, error: null, status: 200, requestId: 'req-void-late' }));
    await act(async () => { await pendingVoid; });
  });

  it('keeps a confirmed void recoverable when the organization changes during POST', async () => {
    let resolvePost!: (value: any) => void;
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.test', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/invoices/invoice-1') return { data: { invoice: { ...invoiceRow, status: 'VOIDED', balanceDue: 0, reversalJournalId: 'journal-reversal' } }, error: null, status: 200, requestId: 'req-verify-after-switch' } as any;
      if (endpoint === '/finance/invoices') return { data: [invoiceRow], error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    vi.spyOn(apiClient, 'post').mockImplementation(() => new Promise((resolve) => { resolvePost = resolve; }) as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.invoices.some((invoice) => invoice.id === 'invoice-1')).toBe(true));

    let pendingVoid!: ReturnType<typeof result.current.deleteInvoice>;
    act(() => { pendingVoid = result.current.deleteInvoice('invoice-1', 'Duplicate entry'); });
    await waitFor(() => expect(resolvePost).toBeDefined());
    act(() => result.current.switchOrganization('org-2'));
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-2'));
    const readsBeforePostResolution = getSpy.mock.calls.length;
    expect(localStorage.getItem('active_organization_id')).toBe('org-2');
    await act(async () => resolvePost({ data: { result: { success: true, invoiceId: 'invoice-1', journalEntryId: 'journal-reversal' } }, error: null, status: 200, requestId: 'req-post-switch' }));
    await act(async () => { await pendingVoid; });
    expect(getSpy).toHaveBeenCalledTimes(readsBeforePostResolution);
    expect(localStorage.getItem('active_organization_id')).toBe('org-2');

    act(() => result.current.switchOrganization('org-1'));
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-1'));
    expect(result.current.invoiceVoidGuards).toMatchObject([{ invoiceId: 'invoice-1', status: 'needs-verification', committed: true, requestId: 'req-post-switch' }]);
    await act(async () => { await result.current.verifyInvoiceVoidStatus('invoice-1'); });
    expect(getSpy).toHaveBeenCalledWith('/finance/invoices/invoice-1', 'org-1');
    expect(result.current.invoiceVoidGuards).toMatchObject([{ invoiceId: 'invoice-1', status: 'verified', committed: true, reversalJournalId: 'journal-reversal' }]);
  });

  it('keeps a confirmed void recoverable when the organization changes during refresh', async () => {
    let releaseAccounts!: (value: any) => void;
    let accountReadStarted = false;
    let postCommitted = false;
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.test', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/invoices/invoice-1') return { data: { invoice: { ...invoiceRow, status: 'VOIDED', balanceDue: 0, reversalJournalId: 'journal-reversal' } }, error: null, status: 200, requestId: 'req-verify-refresh-switch' } as any;
      if (endpoint === '/finance/accounts' && postCommitted && !accountReadStarted) {
        accountReadStarted = true;
        return await new Promise((resolve) => { releaseAccounts = resolve; }) as any;
      }
      if (endpoint === '/finance/invoices') return { data: [invoiceRow], error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    vi.spyOn(apiClient, 'post').mockImplementation(async () => {
      postCommitted = true;
      return { data: { result: { success: true, invoiceId: 'invoice-1', journalEntryId: 'journal-reversal' } }, error: null, status: 200, requestId: 'req-refresh-switch' } as any;
    });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.invoices.some((invoice) => invoice.id === 'invoice-1')).toBe(true));

    let pendingVoid!: ReturnType<typeof result.current.deleteInvoice>;
    act(() => { pendingVoid = result.current.deleteInvoice('invoice-1', 'Duplicate entry'); });
    await waitFor(() => expect(accountReadStarted).toBe(true));
    act(() => result.current.switchOrganization('org-2'));
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-2'));
    act(() => result.current.switchOrganization('org-1'));
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-1'));
    const readsBeforeRelease = getSpy.mock.calls.length;
    await act(async () => releaseAccounts({ data: [], error: null, status: 200 }));
    await act(async () => { await pendingVoid; });
    expect(getSpy.mock.calls.slice(readsBeforeRelease).filter(([endpoint]) => String(endpoint).startsWith('/finance/'))
      .every(([, organizationId]) => organizationId === 'org-1')).toBe(true);
    expect(localStorage.getItem('active_organization_id')).toBe('org-1');
    expect(result.current.invoiceVoidGuards).toMatchObject([{ invoiceId: 'invoice-1', status: 'needs-verification', committed: true, requestId: 'req-refresh-switch' }]);
    await act(async () => { await result.current.verifyInvoiceVoidStatus('invoice-1'); });
    expect(getSpy).toHaveBeenCalledWith('/finance/invoices/invoice-1', 'org-1');
    expect(result.current.invoiceVoidGuards).toMatchObject([{ invoiceId: 'invoice-1', status: 'verified', committed: true, reversalJournalId: 'journal-reversal' }]);
  });
});
