// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { BooksProvider, useBooks } from '../context/BooksContext';
import { PaymentsReceivedView } from '../components/sales/PaymentsReceivedView';
import { apiClient, ApiRequestError } from '../api/client';

const organizations = [
  { id: 'org-1', name: 'Northwind Books', publicOrgId: 'PUB-1', currency: 'USD', timezone: 'UTC', status: 'Active' },
  { id: 'org-2', name: 'Southwind Books', publicOrgId: 'PUB-2', currency: 'USD', timezone: 'UTC', status: 'Active' },
];
const paymentRow = {
  id: 'payment-1', organizationId: 'org-1', paymentNumber: 'PAY-101', clientId: 'client-1', clientName: 'Northwind',
  paymentDate: '2026-09-01', paymentMethod: 'Bank Transfer', depositToAccountId: 'account-1', referenceNumber: 'REF-1',
  amount: 100, unallocatedAmount: 0, invoiceId: 'invoice-1', invoiceNumber: 'INV-101', status: 'Recorded',
};
const wrapper = ({ children }: { children: React.ReactNode }) => <BooksProvider>{children}</BooksProvider>;

function mockInitialization(getPaymentRows: () => typeof paymentRow[]) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string, organizationId?: string) => {
    if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
    if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.test', fullName: 'Owner' } }, error: null, status: 200 } as any;
    if (endpoint === '/finance/payments-received') return { data: getPaymentRows(), error: null, status: 200, requestId: 'req-read', organizationId } as any;
    return { data: [], error: null, status: 200 } as any;
  });
}

describe('Payment received reversal recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
  });
  afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });

  it('requires authoritative status and matching journal evidence before marking a confirmed reversal verified', async () => {
    let reversed = false;
    const getSpy = mockInitialization(() => [reversed ? { ...paymentRow, status: 'REVERSED', reversalJournalId: 'journal-reversal' } : paymentRow]);
    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (endpoint: string, body: any) => {
      expect(endpoint).toBe('/finance/payments-received/payment-1/reverse');
      expect(body).toEqual({ reason: 'Duplicate receipt' });
      reversed = true;
      return { data: { success: true, paymentId: 'payment-1', journalEntryId: 'journal-reversal' }, error: null, status: 200, requestId: 'req-reverse' } as any;
    });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.paymentsReceived.some((payment) => payment.id === 'payment-1')).toBe(true));

    let receipt: Awaited<ReturnType<typeof result.current.deletePaymentReceived>> | undefined;
    await act(async () => { receipt = await result.current.deletePaymentReceived('payment-1', ' Duplicate receipt '); });

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(receipt).toEqual({ requestId: 'req-reverse', reversalJournalId: 'journal-reversal', refreshFailed: false });
    expect(getSpy).toHaveBeenCalledWith('/finance/payments-received', 'org-1');
    expect(result.current.paymentsReceived.find((payment) => payment.id === 'payment-1')).toMatchObject({ status: 'REVERSED', reversalJournalId: 'journal-reversal' });
    expect(result.current.paymentReversalGuards).toMatchObject([{ paymentId: 'payment-1', status: 'verified', committed: true, requestId: 'req-reverse', reversalJournalId: 'journal-reversal' }]);
  });

  it('keeps financial actions guarded when the reversal response conflicts with the authoritative payment list', async () => {
    mockInitialization(() => [paymentRow]);
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true, paymentId: 'payment-1', journalEntryId: 'journal-reversal' }, error: null, status: 200, requestId: 'req-reverse-conflict',
    } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.paymentsReceived.some((payment) => payment.id === 'payment-1')).toBe(true));

    let receipt: Awaited<ReturnType<typeof result.current.deletePaymentReceived>> | undefined;
    await act(async () => { receipt = await result.current.deletePaymentReceived('payment-1', 'Duplicate receipt'); });

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(receipt?.refreshFailed).toBe(true);
    expect(result.current.paymentsReceived.find((payment) => payment.id === 'payment-1')?.status).toBe('Recorded');
    expect(result.current.paymentReversalGuards).toMatchObject([{ paymentId: 'payment-1', status: 'conflict', committed: true, reversalJournalId: 'journal-reversal' }]);
  });

  it('does not project an uncertain reversal and keeps the payment guarded until status is verified', async () => {
    const getSpy = mockInitialization(() => [paymentRow]);
    vi.spyOn(apiClient, 'post').mockRejectedValue(new ApiRequestError({ data: null, error: 'Network timed out', status: 500, errorCode: 'NETWORK_FAILURE', requestId: 'req-uncertain' }, 'Payment could not be reversed'));
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.paymentsReceived.some((payment) => payment.id === 'payment-1')).toBe(true));

    await act(async () => { await expect(result.current.deletePaymentReceived('payment-1', 'Duplicate receipt')).rejects.toThrow('Network timed out'); });
    expect(result.current.paymentsReceived.find((payment) => payment.id === 'payment-1')?.status).toBe('Recorded');
    expect(result.current.paymentReversalGuards).toMatchObject([{ paymentId: 'payment-1', status: 'needs-verification', committed: false, requestId: 'req-uncertain' }]);

    let verification: Awaited<ReturnType<typeof result.current.verifyPaymentReversalStatus>> | undefined;
    await act(async () => { verification = await result.current.verifyPaymentReversalStatus('payment-1'); });
    expect(verification?.status).toBe('pending');
    expect(getSpy).toHaveBeenCalledWith('/finance/payments-received', 'org-1');
    expect(result.current.paymentReversalGuards).toMatchObject([{ paymentId: 'payment-1', status: 'needs-verification', committed: false }]);
  });

  it.each([
    ['missing', undefined],
    ['different', 'journal-other'],
  ])('keeps an authoritative reversed row conflict-guarded when its reversal journal is %s', async (_caseName, journalId) => {
    mockInitialization(() => [{ ...paymentRow, status: 'REVERSED', reversalJournalId: journalId } as any]);
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true, paymentId: 'payment-1', journalEntryId: 'journal-reversal' }, error: null, status: 200, requestId: 'req-reverse-evidence',
    } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.paymentsReceived.some((payment) => payment.id === 'payment-1')).toBe(true));

    const receipt = await act(async () => result.current.deletePaymentReceived('payment-1', 'Duplicate receipt'));
    expect(receipt.refreshFailed).toBe(true);
    expect(result.current.paymentReversalGuards).toMatchObject([{ paymentId: 'payment-1', status: 'conflict', committed: true, reversalJournalId: 'journal-reversal' }]);
  });

  it('keeps a verified payment read-only when a pre-reversal list response resolves late', async () => {
    let releaseInitialPaymentRead!: (value: any) => void;
    let initialPaymentReadHeld = false;
    let reversalCommitted = false;
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.test', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/payments-received') {
        if (!initialPaymentReadHeld) {
          initialPaymentReadHeld = true;
          return await new Promise((resolve) => { releaseInitialPaymentRead = resolve; }) as any;
        }
        return { data: [reversalCommitted ? { ...paymentRow, status: 'REVERSED', reversalJournalId: 'journal-reversal' } : paymentRow], error: null, status: 200 } as any;
      }
      return { data: [], error: null, status: 200 } as any;
    });
    vi.spyOn(apiClient, 'post').mockImplementation(async () => {
      reversalCommitted = true;
      return { data: { success: true, paymentId: 'payment-1', journalEntryId: 'journal-reversal' }, error: null, status: 200, requestId: 'req-late-read' } as any;
    });
    let books: any;
    const ContextProbe = () => { books = useBooks(); return null; };
    render(<BooksProvider><ContextProbe /><PaymentsReceivedView /></BooksProvider>);
    await waitFor(() => expect(releaseInitialPaymentRead).toBeDefined());

    await act(async () => { await books.deletePaymentReceived('payment-1', 'Duplicate receipt'); });
    expect(books.paymentReversalGuards).toMatchObject([{ paymentId: 'payment-1', status: 'verified', committed: true }]);
    await act(async () => releaseInitialPaymentRead({ data: [paymentRow], error: null, status: 200 }));

    await waitFor(() => expect(screen.getByText('PAY-101 · Reversed')).toBeTruthy());
    expect(document.querySelector('button[title="Edit payment"]')).toBeNull();
    fireEvent.click(screen.getByText('PAY-101 · Reversed'));
    fireEvent.click(screen.getByRole('button', { name: 'More payment actions' }));
    expect(screen.queryByRole('button', { name: 'Reverse Payment' })).toBeNull();
  });

  it('keeps a committed reversal scoped to its original organization if the user switches while POST is pending', async () => {
    const getSpy = mockInitialization(() => [paymentRow]);
    let resolvePost!: (value: any) => void;
    vi.spyOn(apiClient, 'post').mockImplementation(() => new Promise((resolve) => { resolvePost = resolve; }) as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.paymentsReceived.some((payment) => payment.id === 'payment-1')).toBe(true));

    let pendingReversal!: ReturnType<typeof result.current.deletePaymentReceived>;
    act(() => { pendingReversal = result.current.deletePaymentReceived('payment-1', 'Duplicate receipt'); });
    await waitFor(() => expect(resolvePost).toBeDefined());
    act(() => result.current.switchOrganization('org-2'));
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-2'));
    const readsBeforePostResolution = getSpy.mock.calls.length;
    await act(async () => resolvePost({ data: { success: true, paymentId: 'payment-1', journalEntryId: 'journal-reversal' }, error: null, status: 200, requestId: 'req-post-switch' }));
    await act(async () => { await pendingReversal; });
    expect(getSpy).toHaveBeenCalledTimes(readsBeforePostResolution);

    act(() => result.current.switchOrganization('org-1'));
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-1'));
    expect(result.current.paymentReversalGuards).toMatchObject([{ paymentId: 'payment-1', status: 'needs-verification', committed: true, requestId: 'req-post-switch' }]);
    await act(async () => { await result.current.verifyPaymentReversalStatus('payment-1'); });
    expect(getSpy).toHaveBeenCalledWith('/finance/payments-received', 'org-1');
  });
});
