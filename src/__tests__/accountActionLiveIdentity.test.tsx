// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { apiClient } from '../api/client';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { BooksProvider, useBooks } from '../context/BooksContext';

const orgs = [{ id: 'org-a', uuid: 'org-a', public_org_id: 'org-a', org_code: 'A', name: 'Org A', base_currency: 'USD', currency_symbol: '$', created_at: '2026-01-01', owner_user_id: 'user-a' }];
const account = { id: 'account-a', organizationId: 'org-a', code: '5100', name: 'Office Expense', type: 'Expense', subType: 'Office & Administrative', status: 'Active', balance: 0 };
const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider><BooksProvider>{children}</BooksProvider></AuthProvider>;

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('firmbooks_authenticated', 'true');
  localStorage.setItem('auth_token', 'token-a');
  localStorage.setItem('active_organization_id', 'org-a');
});
afterEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('account recovery live identity binding', () => {
  it('fails closed during token replacement, blocks user B, and lets user A recover after returning', async () => {
    let accountStatus = 'Active';
    let pendingAccountRead: Promise<any> | null = null;
    let pendingProfile: Promise<any> | null = null;
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/auth/me') {
        if (pendingProfile) { const profile = pendingProfile; pendingProfile = null; return await profile; }
        const isB = localStorage.getItem('auth_token') === 'token-b';
        const user = isB ? { id: 'user-b', email: 'b@example.test', fullName: 'User B' } : { id: 'user-a', email: 'a@example.test', fullName: 'User A' };
        return { data: { user, organizations: [{ id: 'org-a' }] }, error: null, status: 200 } as any;
      }
      if (endpoint === '/organizations') return { data: orgs, error: null, status: 200 } as any;
      if (endpoint === '/finance/accounts') {
        if (pendingAccountRead) { const read = pendingAccountRead; pendingAccountRead = null; return await read; }
        return { data: [{ ...account, status: accountStatus }], error: null, status: 200 } as any;
      }
      return { data: [], error: null, status: 200 } as any;
    });
    const post = vi.spyOn(apiClient, 'post').mockImplementation(async (endpoint: string, body: any) => {
      if (endpoint === '/auth/login') {
        const isB = body.email.startsWith('b');
        return { data: { user: { id: isB ? 'user-b' : 'user-a', email: body.email, fullName: isB ? 'User B' : 'User A' }, token: isB ? 'token-b' : 'token-a' }, error: null, status: 200 } as any;
      }
      return { data: {}, error: null, status: 200 } as any;
    });
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: null, error: 'Service unavailable', status: 503, requestId: 'req-account-a' } as any);
    const { result } = renderHook(() => ({ auth: useAuth(), books: useBooks() }), { wrapper });
    await waitFor(() => expect(result.current.auth.user?.id).toBe('user-a'));
    await waitFor(() => expect(result.current.books.currentOrg.id).toBe('org-a'));

    await act(async () => {
      await expect(result.current.books.updateAccount(account.id, { status: 'Archived' })).rejects.toThrow();
    });
    expect(patch).toHaveBeenCalledTimes(1);
    expect(result.current.books.accountActionGuards).toMatchObject([{ userId: 'user-a' }]);

    const accountReadsBeforeTokenSwap = get.mock.calls.filter(([path]) => path === '/finance/accounts').length;
    const authReadsBeforeStaleLogin = get.mock.calls.filter(([path]) => path === '/auth/me').length;
    const revisionBeforeStaleLogin = result.current.auth.sessionRevision;
    let resolveStaleProfile!: (value: any) => void;
    pendingProfile = new Promise((resolve) => { resolveStaleProfile = resolve; });
    let staleLogin!: Promise<boolean>;
    act(() => { staleLogin = result.current.auth.login('b@example.test', 'password'); });
    await waitFor(() => expect(localStorage.getItem('auth_token')).toBe('token-b'));
    await waitFor(() => expect(get.mock.calls.filter(([path]) => path === '/auth/me').length).toBe(authReadsBeforeStaleLogin + 1));
    let tokenSwapStatus: string | undefined;
    await act(async () => { tokenSwapStatus = await result.current.books.verifyAccountActionStatus(account.id, 'org-a'); });
    expect(tokenSwapStatus).toBe('unknown');
    expect(get.mock.calls.filter(([path]) => path === '/finance/accounts')).toHaveLength(accountReadsBeforeTokenSwap);
    localStorage.setItem('auth_token', 'token-a');
    resolveStaleProfile({ data: { user: { id: 'user-b', email: 'b@example.test', fullName: 'User B' }, organizations: [{ id: 'org-a' }] }, error: null, status: 200 });
    let staleLoginResult: boolean | undefined;
    await act(async () => { staleLoginResult = await staleLogin; });
    expect(staleLoginResult).toBe(false);
    expect(result.current.auth.user?.id).toBe('user-a');
    expect(result.current.auth.sessionRevision).toBe(revisionBeforeStaleLogin);

    // Start A's status read, then change the live session before it completes.
    let resolvePendingRead!: (value: any) => void;
    pendingAccountRead = new Promise((resolve) => { resolvePendingRead = resolve; });
    let pendingVerification!: Promise<string>;
    const beforePendingReadCount = get.mock.calls.filter(([path]) => path === '/finance/accounts').length;
    act(() => { pendingVerification = result.current.books.verifyAccountActionStatus(account.id, 'org-a'); });
    await waitFor(() => expect(get.mock.calls.filter(([path]) => path === '/finance/accounts').length).toBe(beforePendingReadCount + 1));

    await act(async () => { expect(await result.current.auth.login('b@example.test', 'password')).toBe(true); });
    await waitFor(() => expect(result.current.auth.user?.id).toBe('user-b'));
    resolvePendingRead({ data: [{ ...account, status: 'Archived' }], error: null, status: 200 });
    let pendingStatus: string | undefined;
    await act(async () => { pendingStatus = await pendingVerification; });
    expect(pendingStatus).toBe('unknown');
    expect(result.current.books.accountActionGuards).toMatchObject([{ userId: 'user-a' }]);

    const accountReadsBeforeBVerify = get.mock.calls.filter(([path]) => path === '/finance/accounts').length;
    let bStatus: string | undefined;
    await act(async () => { bStatus = await result.current.books.verifyAccountActionStatus(account.id, 'org-a'); });
    expect(bStatus).toBe('unknown');
    expect(get.mock.calls.filter(([path]) => path === '/finance/accounts')).toHaveLength(accountReadsBeforeBVerify);
    expect(result.current.books.accountActionGuards).toMatchObject([{ userId: 'user-a' }]);

    await act(async () => { expect(await result.current.auth.login('a@example.test', 'password')).toBe(true); });
    await waitFor(() => expect(result.current.auth.user?.id).toBe('user-a'));
    await waitFor(() => expect(result.current.books.currentUser.userId).toBe('user-a'));
    accountStatus = 'Archived';
    let aStatus: string | undefined;
    await act(async () => { aStatus = await result.current.books.verifyAccountActionStatus(account.id, 'org-a'); });
    expect(aStatus).toBe('verified');
    expect(result.current.books.accountActionGuards).toHaveLength(0);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('keeps a legacy ownerless guard blocked without verification or replay requests', async () => {
    sessionStorage.setItem('firmbooks_account_action_guards_v1', JSON.stringify([{
      organizationId: 'org-a', accountId: account.id, action: 'archive', idempotencyKey: 'legacy-key', payload: { status: 'Archived' },
    }]));
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/auth/me') return { data: { user: { id: 'user-a', email: 'a@example.test', fullName: 'User A' }, organizations: [{ id: 'org-a' }] }, error: null, status: 200 } as any;
      if (endpoint === '/organizations') return { data: orgs, error: null, status: 200 } as any;
      if (endpoint === '/finance/accounts') return { data: [{ ...account, status: 'Archived' }], error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    const patch = vi.spyOn(apiClient, 'patch');
    const { result } = renderHook(() => ({ auth: useAuth(), books: useBooks() }), { wrapper });
    await waitFor(() => expect(result.current.auth.user?.id).toBe('user-a'));
    await waitFor(() => expect(result.current.books.currentUser.userId).toBe('user-a'));

    const accountReadsBeforeVerify = get.mock.calls.filter(([path]) => path === '/finance/accounts').length;
    let status: string | undefined;
    await act(async () => { status = await result.current.books.verifyAccountActionStatus(account.id, 'org-a'); });
    expect(status).toBe('unknown');
    await expect(result.current.books.updateAccount(account.id, { status: 'Archived' })).rejects.toMatchObject({ response: { errorCode: 'COMMAND_IN_PROGRESS' } });
    expect(patch).not.toHaveBeenCalled();
    expect(get.mock.calls.filter(([path]) => path === '/finance/accounts')).toHaveLength(accountReadsBeforeVerify);
    expect(result.current.books.accountActionGuards).toMatchObject([{ userId: '' }]);
  });
});