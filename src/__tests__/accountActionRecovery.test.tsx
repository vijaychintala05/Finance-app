// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { apiClient } from '../api/client';
import { BooksProvider, useBooks } from '../context/BooksContext';

const organizations = [
  { id: 'org-a', uuid: 'org-a', public_org_id: 'org-a', org_code: 'A', name: 'Org A', base_currency: 'USD', currency_symbol: '$', created_at: '2026-01-01', owner_user_id: 'user-1' },
  { id: 'org-b', uuid: 'org-b', public_org_id: 'org-b', org_code: 'B', name: 'Org B', base_currency: 'USD', currency_symbol: '$', created_at: '2026-01-01', owner_user_id: 'user-1' },
];
const account = { id: 'acc-1', organizationId: 'org-a', code: '5100', name: 'Office Expense', type: 'Expense', subType: 'Office & Administrative', status: 'Active', balance: 0 };
const accountRows = (status: string) => [{ ...account, status }];
const wrapper = ({ children }: { children: React.ReactNode }) => <BooksProvider>{children}</BooksProvider>;

function mockReads(rows: unknown[] = accountRows('Active')) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => ({
    data: endpoint === '/auth/me' ? { user: { id: 'user-1', email: 'user@example.test', fullName: 'User One' } } : endpoint === '/organizations' ? organizations : endpoint === '/finance/accounts' ? rows : [],
    error: null,
    status: 200,
  } as any));
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('firmbooks_authenticated', 'true');
  localStorage.setItem('active_organization_id', 'org-a');
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('BooksContext account action recovery', () => {
  it('returns the committed account receipt when the list refresh cannot verify the new row', async () => {
    mockReads(accountRows('Active'));
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { ...account, id: 'acc-created', code: '5200', name: 'New Expense' },
      error: null,
      status: 201,
      requestId: 'req-account-create',
    } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-a'));

    let receipt: any;
    await act(async () => {
      receipt = await result.current.addAccount({ ...account, id: undefined, code: '5200', name: 'New Expense' } as any);
    });

    expect(post).toHaveBeenCalledWith('/finance/accounts', expect.objectContaining({ code: '5200', name: 'New Expense' }), 'org-a');
    expect(receipt).toMatchObject({ requestId: 'req-account-create', refreshFailed: true, organizationChanged: false, data: { id: 'acc-created' } });
    expect(result.current.accounts.some((row) => row.id === 'acc-created')).toBe(true);
  });

  it('returns verified success only when the server account list contains the created row', async () => {
    let rows: unknown[] = accountRows('Active');
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => ({
      data: endpoint === '/auth/me' ? { user: { id: 'user-1', email: 'user@example.test', fullName: 'User One' } } : endpoint === '/organizations' ? organizations : endpoint === '/finance/accounts' ? rows : [], error: null, status: 200,
    } as any));
    vi.spyOn(apiClient, 'post').mockImplementation(async (_endpoint: string, _body: any, organizationId?: string) => {
      expect(organizationId).toBe('org-a');
      rows = [...rows, { ...account, id: 'acc-created', code: '5200', name: 'New Expense' }];
      return { data: { ...account, id: 'acc-created', code: '5200', name: 'New Expense' }, error: null, status: 201, requestId: 'req-account-create-ok' } as any;
    });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-a'));

    let receipt: any;
    await act(async () => { receipt = await result.current.addAccount({ ...account, id: undefined, code: '5200', name: 'New Expense' } as any); });

    expect(receipt).toMatchObject({ requestId: 'req-account-create-ok', refreshFailed: false, organizationChanged: false, data: { id: 'acc-created' } });
    expect(result.current.accounts.some((row) => row.id === 'acc-created')).toBe(true);
  });
  it('keeps a verified account when the older mount batch finishes later', async () => {
    let rows: unknown[] = accountRows('Active');
    let releaseClients!: () => void;
    const clientsHeld = new Promise<void>((resolve) => { releaseClients = resolve; });
    let clientReadStarted = false;
    let clientReadCount = 0;
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'user@example.test', fullName: 'User One' } }, error: null, status: 200 } as any;
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/finance/accounts') return { data: rows, error: null, status: 200 } as any;
      if (endpoint === '/finance/clients') {
        clientReadStarted = true;
        clientReadCount += 1;
        await clientsHeld;
        return { data: [{ id: 'client-from-mount', name: 'Mount Client' }], error: null, status: 200 } as any;
      }
      return { data: [], error: null, status: 200 } as any;
    });
    vi.spyOn(apiClient, 'post').mockImplementation(async () => {
      const created = { ...account, id: 'acc-created', code: '5200', name: 'New Expense' };
      rows = [...rows, created];
      return { data: created, error: null, status: 201, requestId: 'req-account-before-mount-finish' } as any;
    });
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-a'));
    await waitFor(() => expect(clientReadStarted).toBe(true));

    let receipt: any;
    await act(async () => {
      receipt = await result.current.addAccount({ ...account, id: undefined, code: '5200', name: 'New Expense' } as any);
    });
    expect(receipt).toMatchObject({ requestId: 'req-account-before-mount-finish', refreshFailed: false });
    expect(result.current.accounts.some((row) => row.id === 'acc-created')).toBe(true);

    await act(async () => { releaseClients(); });
    await waitFor(() => expect(clientReadCount).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.clients.some((row: any) => row.id === 'client-from-mount')).toBe(true));
    expect(result.current.accounts.some((row) => row.id === 'acc-created')).toBe(true);
  });

  it.each(['manual-read-finishes-first', 'create-read-finishes-first'])('keeps only the newest account read when refresh and create verification overlap (%s)', async (completionOrder) => {
    let deferAccountReads = false;
    const pendingReads: Array<(value: any) => void> = [];
    const created = { ...account, id: 'acc-created', code: '5200', name: 'New Expense' };
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'user@example.test', fullName: 'User One' } }, error: null, status: 200 } as any;
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/finance/accounts') {
        if (deferAccountReads) return await new Promise<any>((resolve) => pendingReads.push(resolve));
        return { data: accountRows('Active'), error: null, status: 200 } as any;
      }
      return { data: [], error: null, status: 200 } as any;
    });
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: created, error: null, status: 201, requestId: 'req-overlapping-account-read' } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-a'));
    deferAccountReads = true;

    let createReceipt: any;
    let createPromise!: Promise<any>;
    act(() => { createPromise = result.current.addAccount({ ...account, id: undefined, code: '5200', name: 'New Expense' } as any); });
    await waitFor(() => expect(pendingReads).toHaveLength(1));
    let manualPromise!: Promise<void>;
    act(() => { manualPromise = result.current.refreshAccounts(); });
    await waitFor(() => expect(pendingReads).toHaveLength(2));

    const resolveCreateRead = () => pendingReads[0]({ data: [{ ...account, name: 'Stale create verification' }], error: null, status: 200 });
    const resolveManualRead = () => pendingReads[1]({ data: [...accountRows('Active'), created], error: null, status: 200 });
    if (completionOrder === 'manual-read-finishes-first') {
      await act(async () => { resolveManualRead(); await manualPromise; });
      await act(async () => { resolveCreateRead(); createReceipt = await createPromise; });
    } else {
      await act(async () => { resolveCreateRead(); createReceipt = await createPromise; });
      await act(async () => { resolveManualRead(); await manualPromise; });
    }

    expect(createReceipt).toMatchObject({ requestId: 'req-overlapping-account-read', refreshFailed: true });
    expect(result.current.accounts.some((row) => row.id === 'acc-created')).toBe(true);
  });

  it('does not apply a delayed account refresh after switching organizations', async () => {
    let accountReadCount = 0;
    let resolveRefresh!: (value: any) => void;
    const refresh = new Promise<any>((resolve) => { resolveRefresh = resolve; });
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string, organizationId?: string) => {
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'user@example.test', fullName: 'User One' } }, error: null, status: 200 } as any;
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/finance/accounts') {
        accountReadCount += 1;
        if (organizationId === 'org-a' && accountReadCount > 1) return await refresh;
        return { data: accountRows('Active'), error: null, status: 200 } as any;
      }
      return { data: [], error: null, status: 200 } as any;
    });
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { ...account, id: 'acc-created', code: '5200', name: 'New Expense' }, error: null, status: 201, requestId: 'req-account-delayed',
    } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(accountReadCount).toBe(1));
    await waitFor(() => expect(result.current.accounts.some((row) => row.id === account.id)).toBe(true));

    let pending!: Promise<any>;
    act(() => { pending = result.current.addAccount({ ...account, id: undefined, code: '5200', name: 'New Expense' } as any); });
    await waitFor(() => expect(accountReadCount).toBeGreaterThanOrEqual(2));
    act(() => { expect(result.current.switchOrganization('org-b')).toBe(true); });
    await act(async () => {
      resolveRefresh({ data: [...accountRows('Active'), { ...account, id: 'acc-created', code: '5200', name: 'New Expense' }], error: null, status: 200 });
      const receipt = await pending;
      expect(receipt).toMatchObject({ requestId: 'req-account-delayed', refreshFailed: true, organizationChanged: true });
    });

    expect(result.current.currentOrg.id).toBe('org-b');
    expect(result.current.accounts.some((row) => row.id === 'acc-created')).toBe(false);
  });

  it('does not apply a delayed account refresh after the authenticated session changes', async () => {
    let accountReadCount = 0;
    let resolveRefresh!: (value: any) => void;
    const refresh = new Promise<any>((resolve) => { resolveRefresh = resolve; });
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string, organizationId?: string) => {
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'user@example.test', fullName: 'User One' } }, error: null, status: 200 } as any;
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/finance/accounts') {
        accountReadCount += 1;
        if (organizationId === 'org-a' && accountReadCount > 1) return await refresh;
        return { data: accountRows('Active'), error: null, status: 200 } as any;
      }
      return { data: [], error: null, status: 200 } as any;
    });
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { ...account, id: 'acc-created', code: '5200', name: 'New Expense' }, error: null, status: 201, requestId: 'req-account-session-change',
    } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(accountReadCount).toBe(1));
    await waitFor(() => expect(result.current.accounts.find((row) => row.id === account.id)?.name).toBe('Office Expense'));

    let pending!: Promise<any>;
    act(() => { pending = result.current.addAccount({ ...account, id: undefined, code: '5200', name: 'New Expense' } as any); });
    await waitFor(() => expect(accountReadCount).toBeGreaterThanOrEqual(2));
    localStorage.setItem('auth_token', 'replacement-session');
    await act(async () => {
      resolveRefresh({ data: [{ ...account, name: 'Stale refresh account' }, { ...account, id: 'acc-created', code: '5200', name: 'New Expense' }], error: null, status: 200 });
      const receipt = await pending;
      expect(receipt).toMatchObject({ requestId: 'req-account-session-change', refreshFailed: true, organizationChanged: false });
    });

    expect(result.current.accounts.find((row) => row.id === account.id)?.name).toBe('Office Expense');
  });
  it('does not write an account response into the newly selected organization', async () => {
    mockReads(accountRows('Active'));
    let resolvePost!: (value: any) => void;
    const post = vi.spyOn(apiClient, 'post').mockImplementation(() => new Promise((resolve) => { resolvePost = resolve; }) as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-a'));

    let pending!: Promise<any>;
    act(() => { pending = result.current.addAccount({ ...account, id: undefined, code: '5200', name: 'New Expense' } as any); });
    act(() => { expect(result.current.switchOrganization('org-b')).toBe(true); });
    const accountRefreshesBeforeResponse = vi.mocked(apiClient.get).mock.calls.filter(([endpoint]) => endpoint === '/finance/accounts').length;
    await act(async () => {
      resolvePost({ data: { ...account, id: 'acc-created', code: '5200', name: 'New Expense' }, error: null, status: 201, requestId: 'req-account-create' });
      const receipt = await pending;
      expect(receipt).toMatchObject({ requestId: 'req-account-create', refreshFailed: true, organizationChanged: true, data: { id: 'acc-created' } });
    });

    expect(post).toHaveBeenCalledWith('/finance/accounts', expect.objectContaining({ code: '5200' }), 'org-a');
    expect(result.current.currentOrg.id).toBe('org-b');
    expect(result.current.accounts.some((row) => row.id === 'acc-created')).toBe(false);
    expect(vi.mocked(apiClient.get).mock.calls.filter(([endpoint]) => endpoint === '/finance/accounts')).toHaveLength(accountRefreshesBeforeResponse);
  });
  it('keeps a guard until a pinned authoritative read confirms the exact target state', async () => {
    let rows: unknown[] = accountRows('Active');
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => ({
      data: endpoint === '/auth/me' ? { user: { id: 'user-1', email: 'user@example.test', fullName: 'User One' } } : endpoint === '/organizations' ? organizations : endpoint === '/finance/accounts' ? rows : [], error: null, status: 200,
    } as any));
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({
      data: { ...account, status: 'Archived' }, error: null, status: 200, requestId: 'req-account-archive',
    } as any);
    const { result, unmount } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-a'));

    let receipt: any;
    await act(async () => { receipt = await result.current.updateAccount(account.id, { status: 'Archived' }); });

    expect(patch).toHaveBeenCalledWith('/finance/accounts/acc-1', { status: 'Archived' }, 'org-a', expect.any(String));
    expect(receipt.refreshFailed).toBe(true);
    expect(result.current.accountActionGuards).toHaveLength(1);
    expect(JSON.parse(sessionStorage.getItem('firmbooks_account_action_guards_v1') || '[]')).toHaveLength(1);

    rows = accountRows('Archived');
    let verification: string | undefined;
    await act(async () => { verification = await result.current.verifyAccountActionStatus(account.id, 'org-a'); });
    expect(verification).toBe('verified');
    expect(result.current.accountActionGuards).toHaveLength(0);
    expect(result.current.accounts.find((row) => row.id === account.id)?.status).toBe('Archived');
    unmount();
  });

  it('preserves a pending guard across provider remount after an uncertain write', async () => {
    mockReads(accountRows('Active'));
    vi.spyOn(apiClient, 'patch').mockResolvedValue({
      data: null, error: 'Service unavailable', status: 503, requestId: 'req-uncertain',
    } as any);
    const first = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(first.result.current.currentOrg.id).toBe('org-a'));
    await act(async () => {
      await expect(first.result.current.updateAccount(account.id, { status: 'Archived' })).rejects.toThrow();
    });
    first.unmount();
    expect(JSON.parse(sessionStorage.getItem('firmbooks_account_action_guards_v1') || '[]')).toHaveLength(1);

    const second = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(second.result.current.accountActionGuards).toHaveLength(1));
    expect(second.result.current.accountActionGuards[0].idempotencyKey).toBeTruthy();
    second.unmount();
  });

  it('keeps an unresolved account guard bound to its initiating user in the same tab', async () => {
    let signedInUserId = 'user-1';
    let accountReadCount = 0;
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/auth/me') return { data: { user: { id: signedInUserId, email: signedInUserId + '@example.test', fullName: signedInUserId } }, error: null, status: 200 } as any;
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/finance/accounts') { accountReadCount += 1; return { data: accountRows('Active'), error: null, status: 200 } as any; }
      return { data: [], error: null, status: 200 } as any;
    });
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: null, error: 'Service unavailable', status: 503, requestId: 'req-user-bound' } as any);
    const first = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(first.result.current.currentUser.userId).toBe('user-1'));
    await act(async () => { await expect(first.result.current.updateAccount(account.id, { status: 'Archived' })).rejects.toThrow(); });
    expect(JSON.parse(sessionStorage.getItem('firmbooks_account_action_guards_v1') || '[]')).toMatchObject([{ userId: 'user-1', idempotencyKey: expect.any(String) }]);
    first.unmount();

    signedInUserId = 'user-2';
    const second = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(second.result.current.currentUser.userId).toBe('user-2'));
    await waitFor(() => expect(accountReadCount).toBeGreaterThan(0));
    const accountReadsBeforeVerification = accountReadCount;
    let verification: string | undefined;
    await act(async () => { verification = await second.result.current.verifyAccountActionStatus(account.id, 'org-a'); });
    expect(verification).toBe('unknown');
    expect(accountReadCount).toBe(accountReadsBeforeVerification);
    expect(second.result.current.accountActionGuards).toMatchObject([{ userId: 'user-1', idempotencyKey: expect.any(String) }]);
    await act(async () => {
      await expect(second.result.current.updateAccount(account.id, { status: 'Archived' })).rejects.toMatchObject({ response: { errorCode: 'COMMAND_IN_PROGRESS' } });
    });
    expect(patch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem('firmbooks_account_action_guards_v1') || '[]')).toMatchObject([{ userId: 'user-1', idempotencyKey: expect.any(String) }]);
    expect(get).toHaveBeenCalled();
  });

  it('does not clear a guard or write old-organization data when verification finishes after a switch', async () => {
    let resolveAccounts!: (value: any) => void;
    const accountRead = new Promise<any>((resolve) => { resolveAccounts = resolve; });
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string, organizationId?: string) => {
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'user@example.test', fullName: 'User One' } }, error: null, status: 200 } as any;
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/finance/accounts') return organizationId === 'org-a' ? await accountRead : { data: [], error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    vi.spyOn(apiClient, 'patch').mockResolvedValue({
      data: null, error: 'Service unavailable', status: 503, requestId: 'req-uncertain-switch',
    } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-a'));
    await act(async () => { await expect(result.current.updateAccount(account.id, { status: 'Archived' })).rejects.toThrow(); });

    let verification!: Promise<string>;
    act(() => { verification = result.current.verifyAccountActionStatus(account.id, 'org-a'); });
    act(() => { result.current.switchOrganization('org-b'); });
    resolveAccounts({ data: accountRows('Archived'), error: null, status: 200 });

    let status: string | undefined;
    await act(async () => { status = await verification; });
    expect(status).toBe('unknown');
    expect(result.current.currentOrg.id).toBe('org-b');
    expect(result.current.accounts.some((row) => row.id === 'acc-created')).toBe(false);
    expect(JSON.parse(sessionStorage.getItem('firmbooks_account_action_guards_v1') || '[]')).toHaveLength(1);
  });

  it('treats a wrong-account success receipt as uncertain and keeps its guard', async () => {
    mockReads(accountRows('Active'));
    vi.spyOn(apiClient, 'patch').mockResolvedValue({
      data: { ...account, id: 'some-other-account', status: 'Archived' }, error: null, status: 200,
    } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-a'));

    await act(async () => {
      await expect(result.current.updateAccount(account.id, { status: 'Archived' })).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'MALFORMED_SUCCESS_RECEIPT' }),
      });
    });
    expect(result.current.accountActionGuards).toHaveLength(1);
  });

  it('reports an organization switch during a mutation without refreshing the new tenant', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string, organizationId?: string) => {
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-1', email: 'user@example.test', fullName: 'User One' } }, error: null, status: 200 } as any;
      if (endpoint === '/organizations') return { data: organizations, error: null, status: 200 } as any;
      if (endpoint === '/finance/accounts') return { data: organizationId === 'org-a' ? accountRows('Archived') : [], error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    let resolvePatch!: (value: any) => void;
    const pendingPatch = new Promise<any>((resolve) => { resolvePatch = resolve; });
    vi.spyOn(apiClient, 'patch').mockReturnValue(pendingPatch);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-a'));

    let operation!: Promise<any>;
    act(() => { operation = result.current.updateAccount(account.id, { status: 'Archived' }); });
    act(() => { result.current.switchOrganization('org-b'); });
    resolvePatch({ data: { ...account, status: 'Archived' }, error: null, status: 200, requestId: 'req-switched-write' });

    let receipt: any;
    await act(async () => { receipt = await operation; });
    expect(receipt.organizationChanged).toBe(true);
    expect(receipt.refreshFailed).toBe(true);
    expect(result.current.currentOrg.id).toBe('org-b');
    expect(result.current.accounts.some((row) => row.id === 'acc-created')).toBe(false);
  });

  it('keeps the guard when the update receipt has the right ID but wrong requested status', async () => {
    mockReads(accountRows('Active'));
    vi.spyOn(apiClient, 'patch').mockResolvedValue({
      data: { ...account, status: 'Active' }, error: null, status: 200,
    } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-a'));

    await act(async () => {
      await expect(result.current.updateAccount(account.id, { status: 'Archived' })).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'MALFORMED_SUCCESS_RECEIPT' }),
      });
    });
    expect(result.current.accountActionGuards).toHaveLength(1);
  });

  it('does not even query a previous organization after the active tenant changes', async () => {
    const getSpy = mockReads(accountRows('Active'));
    vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: null, error: 'Service unavailable', status: 503 } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-a'));
    await act(async () => { await expect(result.current.updateAccount(account.id, { status: 'Archived' })).rejects.toThrow(); });
    act(() => { result.current.switchOrganization('org-b'); });
    const readsBefore = getSpy.mock.calls.filter(([endpoint]) => endpoint === '/finance/accounts').length;

    let status: string | undefined;
    await act(async () => { status = await result.current.verifyAccountActionStatus(account.id, 'org-a'); });

    expect(status).toBe('unknown');
    expect(getSpy.mock.calls.filter(([endpoint]) => endpoint === '/finance/accounts')).toHaveLength(readsBefore);
    expect(JSON.parse(sessionStorage.getItem('firmbooks_account_action_guards_v1') || '[]')).toHaveLength(1);
  });
  it('verifies blank description and reporting group against the server’s null representation', async () => {
    mockReads([{ ...account, description: null, reportingGroup: null }]);
    vi.spyOn(apiClient, 'patch').mockResolvedValue({
      data: { ...account, description: null, reportingGroup: null }, error: null, status: 200, requestId: 'req-empty-text',
    } as any);
    const { result } = renderHook(() => useBooks(), { wrapper });
    await waitFor(() => expect(result.current.currentOrg.id).toBe('org-a'));

    let receipt: any;
    await act(async () => {
      receipt = await result.current.updateAccount(account.id, { description: '', reportingGroup: '' });
    });

    expect(receipt.refreshFailed).toBe(false);
    expect(result.current.accountActionGuards).toHaveLength(0);
    expect(JSON.parse(sessionStorage.getItem('firmbooks_account_action_guards_v1') || '[]')).toHaveLength(0);
  });
});
