// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { BooksProvider, useBooks } from '../context/BooksContext';
import { ApiRequestError, apiClient } from '../api/client';
import { Invoice, Bill, PaymentReceipt } from '../types';

describe('BooksContext State Management & Financial Mutations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
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

  it('maps the project customer field and preserves the server no-op receipt', async () => {
    const responseData = {
      id: 'project-1', organizationId: 'org-1', code: 'PRJ-1', name: 'Updated project',
      customerId: null, clientName: '', status: 'Active', budgetType: 'Fixed Cost',
      totalBudget: 1000, hourlyRate: 100, changed: false,
    };
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValueOnce({
      data: responseData, error: null, status: 200, requestId: 'req-project-context',
    });
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [], error: null, status: 200 });
    const { result } = renderHook(() => useBooks(), { wrapper });

    let receipt: Awaited<ReturnType<typeof result.current.updateProject>> | undefined;
    await act(async () => {
      receipt = await result.current.updateProject('project-1', { name: 'Updated project', clientId: '' } as any);
    });

    expect(patchSpy).toHaveBeenCalledWith('/finance/projects/project-1', expect.objectContaining({
      name: 'Updated project', customerId: null,
    }));
    expect(receipt?.data.changed).toBe(false);
    expect(receipt?.data.clientId).toBeUndefined();
    expect(receipt?.requestId).toBe('req-project-context');
  });

  it('3. addInvoice posts to server and returns normalized invoice', async () => {
    const mockServerInvoice = {
      id: 'inv-srv-1',
      commandId: 'cmd-inv-srv-1',
      journalEntryId: 'je-inv-srv-1',
      editVersion: '1',
      invoiceNumber: 'INV-2026-001',
      clientId: 'client-1',
      clientName: 'Acme Global',
      issueDate: '2026-08-01',
      dueDate: '2026-08-30',
      totalAmount: 1000,
      balanceDue: 1000,
      paidAmount: 0,
      status: 'POSTED',
    };

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: mockServerInvoice, error: null, status: 201 });
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [], error: null, status: 200 });
    localStorage.setItem('active_organization_id', 'org-1');
    localStorage.setItem('firmbooks_authenticated', 'true');
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any);

    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentUser.userId).toBe('user-1'));

    let created: Awaited<ReturnType<typeof result.current.addInvoice>> | undefined;
    await act(async () => {
      created = await result.current.addInvoice({
        clientId: 'client-1',
        clientName: 'Acme Global',
        salespersonId: 'sp-1',
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
    expect(created?.data.id).toBe('inv-srv-1');
    expect(created?.data.invoiceNumber).toBe('INV-2026-001');
    expect(created?.data.editVersion).toBe('1');

    expect(created?.refreshFailed).toBe(true);
    expect(postSpy).toHaveBeenCalledWith('/finance/invoices', expect.objectContaining({ salespersonId: 'sp-1' }), expect.any(String), expect.any(String));
    expect(JSON.parse(sessionStorage.getItem('firmbooks_invoice_create_guards_v1') || '[]')[0]).toMatchObject({ status: 'committed', invoiceId: 'inv-srv-1' });
  });

  it('keeps an uncertain invoice request frozen and blocks another create', async () => {
    localStorage.setItem('active_organization_id', 'org-1');
    localStorage.setItem('firmbooks_authenticated', 'true');
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any);
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: null, error: 'Network timeout', status: 500, errorCode: 'NETWORK_FAILURE' });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentUser.userId).toBe('user-1'));
    const payload = { clientId: 'client-1', clientName: 'Acme', issueDate: '2026-09-24', dueDate: '2026-10-24', items: [] } as any;

    await act(async () => { await expect(result.current.addInvoice(payload)).rejects.toThrow('Network timeout'); });

    expect(result.current.invoiceCreateGuard).toMatchObject({ status: 'needs-verification', organizationId: 'org-1', userId: 'user-1', payload: expect.objectContaining({ clientName: 'Acme' }) });
    const frozen = JSON.parse(sessionStorage.getItem('firmbooks_invoice_create_guards_v1') || '[]')[0];
    expect(frozen.requestHash).toMatch(/^[a-f0-9]{64}$/);
    await act(async () => { await expect(result.current.addInvoice({ ...payload, clientName: 'Changed' })).rejects.toThrow('Verify or dismiss'); });
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('reserves one create across simultaneous submits', async () => {
    localStorage.setItem('active_organization_id', 'org-1');
    localStorage.setItem('firmbooks_authenticated', 'true');
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any);
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: null, error: 'Network timeout', status: 500, errorCode: 'NETWORK_FAILURE' });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentUser.userId).toBe('user-1'));
    const payload = { clientId: 'client-1', clientName: 'Acme' } as any;
    let settled: PromiseSettledResult<any>[] = [];
    await act(async () => { settled = await Promise.allSettled([result.current.addInvoice(payload), result.current.addInvoice(payload)]); });
    expect(settled.filter(result => result.status === 'rejected')).toHaveLength(2);
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem('firmbooks_invoice_create_guards_v1') || '[]')).toHaveLength(1);
  });

  it('preserves user A invoice guards across user B and back to user A', async () => {
    localStorage.setItem('active_organization_id', 'org-1');
    localStorage.setItem('firmbooks_authenticated', 'true');
    const identity = (id: string) => ({ data: { user: { id, email: id + '@example.com', fullName: id } }, error: null, status: 200 } as any);
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => endpoint === '/auth/me' ? identity('user-a') : { data: [], error: null, status: 200 } as any);
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: null, error: 'Network timeout', status: 500, errorCode: 'NETWORK_FAILURE' });
    const first = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(first.result.current.currentUser.userId).toBe('user-a'));
    await act(async () => { await expect(first.result.current.addInvoice({ clientId: 'client-1', clientName: 'Acme' } as any)).rejects.toThrow('Network timeout'); });
    const originalKey = first.result.current.invoiceCreateGuard?.idempotencyKey;
    act(() => first.result.current.dismissInvoiceCreateGuard());
    expect(first.result.current.invoiceCreateGuard?.idempotencyKey).toBe(originalKey);
    first.unmount();

    getSpy.mockImplementation(async (endpoint: string) => endpoint === '/auth/me' ? identity('user-b') : { data: [], error: null, status: 200 } as any);
    const second = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(second.result.current.currentUser.userId).toBe('user-b'));
    expect(second.result.current.invoiceCreateGuard).toBeNull();
    second.unmount();

    getSpy.mockImplementation(async (endpoint: string) => endpoint === '/auth/me' ? identity('user-a') : { data: [], error: null, status: 200 } as any);
    const third = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(third.result.current.invoiceCreateGuard?.idempotencyKey).toBe(originalKey));
    expect(third.result.current.invoiceCreateGuard?.status).toBe('needs-verification');
  });

  it('accepts an approval-submitted invoice without a journal and explains it is not posted', async () => {
    localStorage.setItem('active_organization_id', 'org-1');
    localStorage.setItem('firmbooks_authenticated', 'true');
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => endpoint === '/auth/me' ? { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any : { data: [], error: null, status: 200 } as any);
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: { id: 'inv-submitted-1', invoiceNumber: 'INV-SUB-1', commandId: 'cmd-submitted-1', status: 'SUBMITTED' }, error: null, status: 201 });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentUser.userId).toBe('user-1'));
    let created: Awaited<ReturnType<typeof result.current.addInvoice>> | undefined;
    await act(async () => { created = await result.current.addInvoice({ clientId: 'client-1', clientName: 'Acme' } as any); });
    expect(created?.data.status).toBe('Submitted');
    expect(result.current.invoiceCreateGuard).toMatchObject({
      status: 'committed', invoiceStatus: 'SUBMITTED', invoiceId: 'inv-submitted-1',
      notice: { tone: 'warning', title: 'Invoice INV-SUB-1 submitted for approval', message: expect.stringContaining('not posted to the ledger yet') },
    });
  });

  it('keeps approval-pending messaging when the invoice list refresh fails', async () => {
    localStorage.setItem('active_organization_id', 'org-1');
    localStorage.setItem('firmbooks_authenticated', 'true');
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/invoices') return { data: null, error: 'Invoice list unavailable', status: 503 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: { id: 'inv-submitted-refresh', invoiceNumber: 'INV-SUB-R', commandId: 'cmd-submitted-refresh', status: 'SUBMITTED' }, error: null, status: 201 });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentUser.userId).toBe('user-1'));
    let created: Awaited<ReturnType<typeof result.current.addInvoice>> | undefined;
    await act(async () => { created = await result.current.addInvoice({ clientId: 'client-1', clientName: 'Acme' } as any); });
    expect(created?.refreshFailed).toBe(true);
    expect(result.current.invoiceCreateGuard?.notice).toMatchObject({
      title: 'Invoice INV-SUB-R submitted for approval',
      message: expect.stringContaining('awaiting approval'),
    });
    expect(result.current.invoiceCreateGuard?.notice.message).toContain('reload to update the invoice list');
  });
  it.each([
    ['invoice ID', { id: '' }],
    ['invoice number', { invoiceNumber: '   ' }],
    ['command ID', { commandId: '' }],
  ])('keeps a receipt with a blank %s locked for verification', async (_field, override) => {
    localStorage.setItem('active_organization_id', 'org-1');
    localStorage.setItem('firmbooks_authenticated', 'true');
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any);
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: { id: 'inv-1', invoiceNumber: 'INV-1', commandId: 'cmd-1', journalEntryId: 'je-1', status: 'POSTED', ...override }, error: null, status: 201 });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentUser.userId).toBe('user-1'));
    await act(async () => { await expect(result.current.addInvoice({ clientId: 'client-1', clientName: 'Acme' } as any)).rejects.toThrow('verifiable financial receipt'); });
    expect(result.current.invoiceCreateGuard).toMatchObject({ status: 'needs-verification' });
  });

  it('discards an unsent invoice guard if the authentication token changes while hashing', async () => {
    localStorage.setItem('active_organization_id', 'org-1');
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('auth_token', 'user-a-token');
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any);
    let resolveHash!: (hash: string) => void;
    vi.spyOn(apiClient, 'createOperationRequestHash').mockReturnValue(new Promise((resolve) => { resolveHash = resolve; }));
    const postSpy = vi.spyOn(apiClient, 'post');
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentUser.userId).toBe('user-1'));
    await act(async () => {
      const pending = result.current.addInvoice({ clientId: 'client-1', clientName: 'Acme' } as any);
      await Promise.resolve();
      localStorage.setItem('auth_token', 'user-b-token');
      resolveHash('a'.repeat(64));
      await expect(pending).rejects.toThrow('identity changed before invoice creation was sent');
    });
    expect(postSpy).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem('firmbooks_invoice_create_guards_v1') || '[]')).toEqual([]);
  });
  it('keeps a malformed successful invoice response locked for status verification', async () => {
    localStorage.setItem('active_organization_id', 'org-1');
    localStorage.setItem('firmbooks_authenticated', 'true');
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any);
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: { id: 'inv-1', invoiceNumber: 'INV-1', commandId: 'cmd-1', status: 'POSTED' }, error: null, status: 201 });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentUser.userId).toBe('user-1'));
    await act(async () => { await expect(result.current.addInvoice({ clientId: 'client-1', clientName: 'Acme' } as any)).rejects.toThrow('verifiable financial receipt'); });
    expect(result.current.invoiceCreateGuard).toMatchObject({ status: 'needs-verification' });
    await act(async () => { await expect(result.current.addInvoice({ clientId: 'client-1', clientName: 'Acme' } as any)).rejects.toThrow('Verify or dismiss'); });
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('sends an explicit null when an invoice salesperson is cleared', async () => {
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: { id: 'inv-edit-1', invoiceNumber: 'INV-EDIT-1', totalAmount: 100, balanceDue: 100, status: 'Sent', editVersion: '2' },
      error: null, status: 200,
    });
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [], error: null, status: 200 });
    const { result } = renderHook(() => useBooks(), { wrapper });

    await act(async () => {
      await result.current.updateInvoice('inv-edit-1', { salespersonId: null }, '1');
    });

    expect(putSpy).toHaveBeenCalledWith('/finance/invoices/inv-edit-1', expect.objectContaining({ salespersonId: null, expectedVersion: '1' }));
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

  it('5b. updatePaymentReceived sends PUT request to server and refreshes', async () => {
    const updatedMockPayment = {
      id: 'pay-rec-1',
      paymentNumber: 'PAY-001',
      clientId: 'client-1',
      clientName: 'Acme Global',
      paymentDate: '2026-08-18',
      amount: 650,
      paymentMode: 'UPI',
      depositToAccountId: 'acc-bank-1',
      notes: 'Updated note',
    };

    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({ data: { payment: updatedMockPayment }, error: null, status: 200 });
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [], error: null, status: 200 });

    const { result } = renderHook(() => useBooks(), { wrapper });

    let paymentUpdated: PaymentReceipt | undefined;
    await act(async () => {
      paymentUpdated = await result.current.updatePaymentReceived('pay-rec-1', {
        clientId: 'client-1',
        clientName: 'Acme Global',
        paymentDate: '2026-08-18',
        amount: 650,
        paymentMethod: 'UPI' as any,
        depositToAccountId: 'acc-bank-1',
        notes: 'Updated note',
      });
    });

    expect(paymentUpdated).toBeDefined();
    expect(paymentUpdated?.amount).toBe(650);
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
    let serverAccounts: any[] = [account];
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: [{ id: 'org-1', name: 'Sense Studios', publicOrgId: 'PUB-1', currency: 'INR', timezone: 'Asia/Kolkata', status: 'Active' }], error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/accounts') return { data: serverAccounts, error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { deleted: true, id: account.id }, error: null, status: 200 });
    const { result } = renderHook(() => useBooks(), { wrapper });

    await waitFor(() => expect(result.current.accounts).toEqual([account]));
    serverAccounts = [];
    await act(async () => { await result.current.deleteAccount(account.id); });

    expect(deleteSpy).toHaveBeenCalledWith('/finance/accounts/acc-delete', 'org-1', expect.any(String));
    expect(result.current.accounts).toEqual([]);
  });
  it('returns a committed sales-order receipt when its authoritative refresh fails', async () => {
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
    let failSalesOrderRefresh = false;
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: [{ id: 'org-1', name: 'Sense Studios', publicOrgId: 'PUB-1', currency: 'INR', timezone: 'Asia/Kolkata', status: 'Active' }], error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/sales-orders' && failSalesOrderRefresh) return { data: null, error: 'Sales order list unavailable', status: 503, requestId: 'req-sales-order-refresh' } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const posted = { id: 'sales-order-1', orderNumber: 'SO-2026-0001', customerId: 'client-1', customerName: 'Acme', orderDate: '2026-09-23', totalAmount: 12000, status: 'CONFIRMED' };
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: posted, error: null, status: 201, requestId: 'req-sales-order-create' });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-1'));
    failSalesOrderRefresh = true;

    let receipt: Awaited<ReturnType<typeof result.current.addSalesOrder>> | undefined;
    await act(async () => {
      receipt = await result.current.addSalesOrder({
        orderNumber: 'SO-2026-0001', clientId: 'client-1', clientName: 'Acme', orderDate: '2026-09-23',
        expectedDeliveryDate: '2026-10-07', totalAmount: 12000, status: 'Confirmed', notes: 'Order scope',
      }, 'org-1');
    });

    expect(postSpy).toHaveBeenCalledWith('/finance/sales-orders', expect.objectContaining({ customerId: 'client-1', totalAmount: 12000 }), 'org-1');
    expect(receipt?.data.id).toBe('sales-order-1');
    expect(receipt?.requestId).toBe('req-sales-order-create');
    expect(receipt?.refreshFailed).toBe(true);
  });

  it('preserves structured API errors when sales-order creation is rejected', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [], error: null, status: 200 } as any);
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: null, error: 'Order amount exceeds policy', status: 422, errorCode: 'SALES_ORDER_LIMIT', requestId: 'req-sales-order-422',
    } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    let caught: unknown;
    await act(async () => {
      try {
        await result.current.addSalesOrder({
          orderNumber: 'SO-1', clientId: 'client-1', clientName: 'Acme', orderDate: '2026-09-23',
          expectedDeliveryDate: '2026-10-07', totalAmount: 12000, status: 'Confirmed', notes: 'Order scope',
        });
      } catch (error) { caught = error; }
    });
    expect(caught).toBeInstanceOf(ApiRequestError);
    expect((caught as ApiRequestError).response).toMatchObject({
      status: 422, errorCode: 'SALES_ORDER_LIMIT', requestId: 'req-sales-order-422',
    });
  });

  it('reports a committed customer edit as stale when the authoritative client refresh fails', async () => {
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
    let failClientRefresh = false;
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: [{ id: 'org-1', name: 'Sense Studios', publicOrgId: 'PUB-1', currency: 'INR', timezone: 'Asia/Kolkata', status: 'Active' }], error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/clients' && failClientRefresh) return { data: null, error: 'Client list unavailable', status: 503, requestId: 'req-refresh-failed' } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: { id: 'customer-1', changed: true }, error: null, status: 200, requestId: 'req-edit-committed' });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-1'));
    failClientRefresh = true;

    let receipt: Awaited<ReturnType<typeof result.current.updateClient>> | undefined;
    await act(async () => {
      receipt = await result.current.updateClient('customer-1', { name: 'Updated Contact', companyName: 'Updated Company', taxId: 'GST-1' });
    });

    expect(patchSpy).toHaveBeenCalledWith('/finance/customers/customer-1', {
      name: 'Updated Contact', legalName: 'Updated Company', gstin: 'GST-1',
    });
    expect(receipt?.requestId).toBe('req-edit-committed');
    expect(receipt?.refreshFailed).toBe(true);
  });

  it('returns a committed project receipt when the project list refresh fails', async () => {
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
    let failProjectRefresh = false;
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: [{ id: 'org-1', name: 'Sense Studios', publicOrgId: 'PUB-1', currency: 'INR', timezone: 'Asia/Kolkata', status: 'Active' }], error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/projects' && failProjectRefresh) return { data: null, error: 'Project list unavailable', status: 503, requestId: 'req-project-refresh' } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const posted = { id: 'project-1', name: 'Migration', createdAt: '2026-09-23T00:00:00Z' };
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: posted, error: null, status: 201, requestId: 'req-project-create' });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-1'));
    failProjectRefresh = true;

    let receipt: Awaited<ReturnType<typeof result.current.addProject>> | undefined;
    await act(async () => {
      receipt = await result.current.addProject({
        code: 'PRJ-1', name: 'Migration', clientId: 'customer-1', clientName: 'Asha Rao', description: '', status: 'Active',
        budgetType: 'Fixed Cost', totalBudget: 0, hourlyRate: 0, startDate: '2026-09-23', manager: 'Project Manager',
      });
    });

    expect(postSpy).toHaveBeenCalledWith('/finance/projects', expect.objectContaining({ code: 'PRJ-1', clientId: 'customer-1' }));
    expect(receipt?.data.id).toBe('project-1');
    expect(receipt?.requestId).toBe('req-project-create');
    expect(receipt?.refreshFailed).toBe(true);
  });

  it('returns a committed time-delete receipt when verification fails after HTTP 204', async () => {
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
    let failTimeRefresh = false;
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: [{ id: 'org-1', name: 'Sense Studios', publicOrgId: 'PUB-1', currency: 'INR', timezone: 'Asia/Kolkata', status: 'Active' }], error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/time-entries' && failTimeRefresh) return { data: null, error: 'Time log unavailable', status: 503, requestId: 'req-refresh-time-failed' } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: null, error: null, status: 204, requestId: 'req-time-delete' });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-1'));
    failTimeRefresh = true;

    let receipt: Awaited<ReturnType<typeof result.current.deleteTimeEntry>> | undefined;
    await act(async () => {
      receipt = await result.current.deleteTimeEntry('time-1');
    });

    expect(deleteSpy).toHaveBeenCalledWith('/finance/time-entries/time-1');
    expect(receipt?.requestId).toBe('req-time-delete');
    expect(receipt?.refreshFailed).toBe(true);
  });
  it('keeps an uncertain time guard after a 403 and clears it after a valid time-entry read', async () => {
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
    let denyTimeRead = true;
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: [{ id: 'org-1', name: 'Sense Studios', publicOrgId: 'PUB-1', currency: 'INR', timezone: 'Asia/Kolkata', status: 'Active' }], error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/time-entries' && denyTimeRead) return { data: null, error: 'Time-entry read denied', status: 403 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-1'));
    act(() => result.current.holdTimeOperationGuard('delete:time-1', 'project-1', {
      tone: 'warning', title: 'Deletion could not be confirmed', message: 'Waiting for verification.', requestId: 'req-delete-guard',
    }));

    let verified = true;
    await act(async () => { verified = await result.current.refreshTimeOperationStatus(); });
    expect(verified).toBe(false);
    expect(result.current.timeOperationGuards).toHaveLength(1);

    denyTimeRead = false;
    await act(async () => { verified = await result.current.refreshTimeOperationStatus(); });
    expect(verified).toBe(true);
    await waitFor(() => expect(result.current.timeOperationGuards).toHaveLength(0));
  });

  it('preserves structured time-entry POST failure metadata for safe recovery', async () => {
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: [{ id: 'org-1', name: 'Sense Studios', publicOrgId: 'PUB-1', currency: 'INR', timezone: 'Asia/Kolkata', status: 'Active' }], error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const response = { data: null, error: 'Network timeout', status: 500, errorCode: 'NETWORK_FAILURE', retryable: true, requestId: 'req-time-entry-timeout', recovery: 'Check Time Logs before retrying.' };
    vi.spyOn(apiClient, 'post').mockResolvedValue(response as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-1'));
    await expect(result.current.addTimeEntry({ projectId: 'project-1', taskName: 'Review' } as any, 'org-1')).rejects.toMatchObject({
      response: expect.objectContaining({ status: 500, errorCode: 'NETWORK_FAILURE', retryable: true, requestId: 'req-time-entry-timeout', recovery: 'Check Time Logs before retrying.' }),
    });
  });

  it('discards an operation-status result after an organization generation change', async () => {
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: [
        { id: 'org-1', name: 'One', publicOrgId: 'PUB-1', currency: 'INR', timezone: 'Asia/Kolkata', status: 'Active' },
        { id: 'org-2', name: 'Two', publicOrgId: 'PUB-2', currency: 'USD', timezone: 'UTC', status: 'Active' },
      ], error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    let resolveStatus!: (value: any) => void;
    const statusPromise = new Promise((resolve) => { resolveStatus = resolve; });
    vi.spyOn(apiClient, 'getTimeEntryCreateOperationStatus').mockReturnValue(statusPromise as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-1'));

    let status!: ReturnType<typeof result.current.getTimeEntryCreateOperationStatus> | undefined;
    act(() => { status = result.current.getTimeEntryCreateOperationStatus('operation-key-123456789', 'org-1'); });
    act(() => result.current.switchOrganization('org-2'));
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-2'));
    await act(async () => {
      resolveStatus({ data: { state: 'COMPLETED', responseStatus: 201, entryId: 'time-old-org' }, error: null, status: 200 });
      expect(await status).toBeNull();
    });
  });

  it('does not verify an org-pinned time entry against the newly active organization', async () => {
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
    let resolvePost!: (value: any) => void;
    const postPromise = new Promise((resolve) => { resolvePost = resolve; });
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: [
        { id: 'org-1', name: 'One', publicOrgId: 'PUB-1', currency: 'INR', timezone: 'Asia/Kolkata', status: 'Active' },
        { id: 'org-2', name: 'Two', publicOrgId: 'PUB-2', currency: 'USD', timezone: 'UTC', status: 'Active' },
      ], error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockReturnValue(postPromise as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-1'));

    let operation!: Promise<Awaited<ReturnType<typeof result.current.addTimeEntry>>>;
    act(() => { operation = result.current.addTimeEntry({ projectId: 'project-1', taskName: 'Review' } as any, 'org-1'); });
    expect(postSpy).toHaveBeenCalledWith('/finance/time-entries', expect.any(Object), 'org-1', undefined);
    act(() => result.current.switchOrganization('org-2'));
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-2'));
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/finance/time-entries', 'org-2'));
    const orgTwoReadsBeforePostSettles = getSpy.mock.calls.filter(([endpoint, orgId]) => endpoint === '/finance/time-entries' && orgId === 'org-2').length;

    let receipt: Awaited<ReturnType<typeof result.current.addTimeEntry>> | undefined;
    await act(async () => {
      resolvePost({ data: { id: 'time-org-one', projectId: 'project-1' }, error: null, status: 201, requestId: 'req-time-org-one' });
      receipt = await operation;
    });

    expect(receipt).toMatchObject({ data: { id: 'time-org-one' }, requestId: 'req-time-org-one', refreshFailed: true });
    expect(getSpy.mock.calls.filter(([endpoint, orgId]) => endpoint === '/finance/time-entries' && orgId === 'org-2')).toHaveLength(orgTwoReadsBeforePostSettles);
  });
  it('treats a successful time-entry response without an ID as uncertain, not rejected', async () => {
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: [{ id: 'org-1', name: 'Sense Studios', publicOrgId: 'PUB-1', currency: 'INR', timezone: 'Asia/Kolkata', status: 'Active' }], error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {}, error: null, status: 201, requestId: 'req-time-no-id' } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-1'));
    await expect(result.current.addTimeEntry({ projectId: 'project-1', taskName: 'Review' } as any, 'org-1')).rejects.toMatchObject({
      response: expect.objectContaining({ status: 201, retryable: true, requestId: 'req-time-no-id', recovery: expect.stringContaining('Open Time Logs') }),
    });
  });

  it('returns a committed time-entry receipt when the authoritative refresh fails', async () => {
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
    let failTimeRead = false;
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: [{ id: 'org-1', name: 'Sense Studios', publicOrgId: 'PUB-1', currency: 'INR', timezone: 'Asia/Kolkata', status: 'Active' }], error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/time-entries' && failTimeRead) return { data: null, error: 'Time list unavailable', status: 503 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { id: 'time-committed', projectId: 'project-1' }, error: null, status: 201, requestId: 'req-time-committed' } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-1'));
    failTimeRead = true;
    let receipt: Awaited<ReturnType<typeof result.current.addTimeEntry>> | undefined;
    await act(async () => { receipt = await result.current.addTimeEntry({ projectId: 'project-1', taskName: 'Review' } as any, 'org-1'); });
    expect(receipt).toEqual({ data: { id: 'time-committed', projectId: 'project-1' }, requestId: 'req-time-committed', refreshFailed: true });
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith('/finance/time-entries', expect.any(Object), 'org-1', undefined);
    expect(getSpy).toHaveBeenCalledWith('/finance/time-entries', 'org-1');
  });

  it('reconciles a confirmed billed-time invoice from a full authoritative refresh', async () => {
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
    let refreshRows: any[] = [{ id: 'time-1', projectId: 'project-1', isBillable: true, isBilled: false }];
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: [{ id: 'org-1', name: 'Sense Studios', publicOrgId: 'PUB-1', currency: 'INR', timezone: 'Asia/Kolkata', status: 'Active' }], error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      if (endpoint === '/finance/time-entries') return { data: refreshRows, error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { id: 'time-new', projectId: 'project-1' }, error: null, status: 201 } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-1'));
    await waitFor(() => expect(result.current.timeEntries.some((entry) => entry.id === 'time-1')).toBe(true));
    act(() => result.current.beginTimeOperation('invoice:project-1', 'project-1'));
    act(() => result.current.holdTimeOperationGuard('invoice:project-1', 'project-1', {
      tone: 'warning', title: 'Invoice outcome could not be confirmed', message: 'Waiting for verification.', requestId: 'req-invoice-guard',
    }));
    refreshRows = [
      { id: 'time-history', projectId: 'project-1', isBillable: true, isBilled: true, invoiceId: 'old-invoice' },
      { id: 'time-1', projectId: 'project-1', isBillable: true, isBilled: false },
    ];

    await act(async () => {
      await result.current.addTimeEntry({
        projectId: 'project-1', projectName: 'Migration', clientName: 'Northwind', staffName: 'Alex', taskName: 'Review',
        date: '2026-09-23', hours: 1, hourlyRate: 100, isBillable: false, isBilled: false, description: '',
      } as any);
    });
    expect(result.current.timeOperationGuards[0]?.status).toBe('uncertain');

    refreshRows = [
      { id: 'time-history', projectId: 'project-1', isBillable: true, isBilled: true, invoiceId: 'old-invoice' },
      { id: 'time-1', projectId: 'project-1', isBillable: true, isBilled: true, invoiceId: 'invoice-99' },
      { id: 'time-new', projectId: 'project-1', isBillable: true, isBilled: false },
    ];
    await act(async () => {
      await result.current.addTimeEntry({
        projectId: 'project-1', projectName: 'Migration', clientName: 'Northwind', staffName: 'Alex', taskName: 'Review',
        date: '2026-09-23', hours: 1, hourlyRate: 100, isBillable: false, isBilled: false, description: '',
      } as any);
    });

    await waitFor(() => expect(result.current.timeOperationGuards[0]?.status).toBe('resolved'));
    expect(result.current.timeOperationGuards[0].notice.message).toContain('invoice-99');
  });

  it('does not project a confirmed time invoice into another active organization', async () => {
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-1');
    const organizations = [
      { id: 'org-1', name: 'Sense Studios', publicOrgId: 'PUB-1', currency: 'INR', timezone: 'Asia/Kolkata', status: 'Active' },
      { id: 'org-2', name: 'Other Org', publicOrgId: 'PUB-2', currency: 'USD', timezone: 'UTC', status: 'Active' },
    ];
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'owner@example.com', fullName: 'Owner' } }, error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    let resolvePost!: (value: unknown) => void;
    vi.spyOn(apiClient, 'post').mockReturnValueOnce(new Promise((resolve) => { resolvePost = resolve; }) as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-1'));

    let invoicePromise!: Promise<unknown>;
    act(() => { invoicePromise = result.current.convertUnbilledTimeToInvoice('project-1', 'customer-1'); });
    act(() => result.current.switchOrganization('org-2'));
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-2'));
    resolvePost({ data: { id: 'invoice-org-1', invoiceNumber: 'INV-ORG-1', totalAmount: 100 }, error: null, status: 201 });

    await act(async () => { await invoicePromise; });
    expect(result.current.invoices.some((invoice) => invoice.id === 'invoice-org-1')).toBe(false);
  });

  it('12. useBooks throws if called outside BooksProvider', () => {
    expect(() => renderHook(() => useBooks())).toThrow('useBooks must be used within a BooksProvider');
  });
});
