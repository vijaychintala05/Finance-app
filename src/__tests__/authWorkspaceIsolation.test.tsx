// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { AuthGate } from '../components/auth/AuthGate';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { BooksProvider, useBooks } from '../context/BooksContext';

const userA = { id: 'user-a', email: 'a@example.com', fullName: 'User A' };
const userB = { id: 'user-b', email: 'b@example.com', fullName: 'User B' };
const organization = (id: string) => ({ id, name: id, country: 'US', base_currency: 'USD' });

function WorkspaceProbe() {
  const auth = useAuth();
  const books = useBooks();
  const [count, setCount] = useState(0);
  return (
    <div>
      <output data-testid="workspace">{auth.user?.id}:{books.currentOrg.id}:{count}</output>
      <button onClick={() => setCount((value) => value + 1)}>Change workspace state</button>
      <button onClick={() => void auth.login('b@example.com', 'replacement-password')}>Replace session</button>
      <button onClick={() => void auth.login('a@example.com', 'renewed-password')}>Renew session</button>
    </div>
  );
}

function MountedApp() {
  return (
    <AuthProvider>
      <AuthGate>
        <BooksProvider><WorkspaceProbe /></BooksProvider>
      </AuthGate>
    </AuthProvider>
  );
}

describe('mounted auth/workspace isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('unmounts user A workspace while a replacement token is being verified, then mounts clean user B state', async () => {
    localStorage.setItem('auth_token', 'token-a');
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-a');
    sessionStorage.setItem('firmbooks_invoice_void_guards_v1', JSON.stringify([{
      invoiceId: 'invoice-a', organizationId: 'org-a', userId: 'user-a', status: 'needs-verification',
      committed: true, idempotencyKey: 'invoice-void-key-123456', reason: 'Original reversal request',
      notice: { tone: 'warning', title: 'Verify reversal', message: 'Check the original invoice reversal.' },
    }]));
    sessionStorage.setItem('firmbooks_time_operation_guards_v1', JSON.stringify([{
      key: 'delete:time-a', projectId: 'project-a', organizationId: 'org-a', userId: 'user-a',
      status: 'pending', notice: { tone: 'warning', title: 'Verify time entry', message: 'Check the original request.' },
    }]));
    sessionStorage.setItem('firmbooks_payment_reversal_guards_v1', JSON.stringify([{
      paymentId: 'payment-a', organizationId: 'org-a', userId: 'user-a', status: 'needs-verification',
      committed: true, notice: { tone: 'warning', title: 'Verify payment', message: 'Check the reversal journal.' },
    }]));

    let resolveReplacementProfile!: (value: any) => void;
    const replacementProfile = new Promise<any>((resolve) => { resolveReplacementProfile = resolve; });
    let profileCalls = 0;
    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
      if (path === '/auth/me') {
        profileCalls += 1;
        if (profileCalls === 1) return { data: { user: userA, organizations: [{ id: 'org-a' }] }, error: null, status: 200 } as any;
        return replacementProfile;
      }
      if (path === '/organizations') {
        return { data: [organization(localStorage.getItem('auth_token') === 'token-b' ? 'org-b' : 'org-a')], error: null, status: 200 } as any;
      }
      return { data: [], error: null, status: 200 } as any;
    });
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { user: userB, token: 'token-b' }, error: null, status: 200,
    } as any);

    render(<MountedApp />);
    await waitFor(() => expect(screen.getByTestId('workspace').textContent).toBe('user-a:org-a:0'));
    fireEvent.click(screen.getByText('Change workspace state'));
    await waitFor(() => expect(screen.getByTestId('workspace').textContent).toBe('user-a:org-a:1'));

    fireEvent.click(screen.getByText('Replace session'));
    await waitFor(() => expect(screen.getByText('Loading secure workspace…')).toBeTruthy());
    expect(screen.getByTestId('workspace').closest('[hidden]')).toBeTruthy();
    expect(localStorage.getItem('auth_token')).toBe('token-b');

    resolveReplacementProfile({ data: { user: userB, organizations: [{ id: 'org-b' }] }, error: null, status: 200 });
    await waitFor(() => expect(screen.getByTestId('workspace').textContent).toBe('user-b:org-b:0'));
    expect(JSON.parse(sessionStorage.getItem('firmbooks_invoice_void_guards_v1') || '[]')).toHaveLength(1);
    expect(JSON.parse(sessionStorage.getItem('firmbooks_time_operation_guards_v1') || '[]')).toMatchObject([{ userId: 'user-a', organizationId: 'org-a' }]);
    expect(JSON.parse(sessionStorage.getItem('firmbooks_payment_reversal_guards_v1') || '[]')).toMatchObject([{ userId: 'user-a', organizationId: 'org-a' }]);
  });

  it('keeps the same user workspace mounted through token verification', async () => {
    localStorage.setItem('auth_token', 'token-a');
    localStorage.setItem('firmbooks_authenticated', 'true');
    localStorage.setItem('active_organization_id', 'org-a');

    let resolveRenewedProfile!: (value: any) => void;
    const renewedProfile = new Promise<any>((resolve) => { resolveRenewedProfile = resolve; });
    let profileCalls = 0;
    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
      if (path === '/auth/me') {
        profileCalls += 1;
        if (profileCalls === 1) return { data: { user: userA, organizations: [{ id: 'org-a' }] }, error: null, status: 200 } as any;
        return renewedProfile;
      }
      if (path === '/organizations') return { data: [organization('org-a')], error: null, status: 200 } as any;
      return { data: [], error: null, status: 200 } as any;
    });
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { user: userA, token: 'token-a-renewed' }, error: null, status: 200,
    } as any);

    render(<MountedApp />);
    await waitFor(() => expect(screen.getByTestId('workspace').textContent).toBe('user-a:org-a:0'));
    fireEvent.click(screen.getByText('Change workspace state'));
    await waitFor(() => expect(screen.getByTestId('workspace').textContent).toBe('user-a:org-a:1'));
    fireEvent.click(screen.getByText('Renew session'));

    await waitFor(() => expect(localStorage.getItem('auth_token')).toBe('token-a-renewed'));
    await waitFor(() => expect(screen.getByText('Loading secure workspace…')).toBeTruthy());
    expect(screen.getByTestId('workspace').closest('[hidden]')).toBeTruthy();
    expect(screen.getByTestId('workspace').textContent).toBe('user-a:org-a:1');

    resolveRenewedProfile({ data: { user: userA, organizations: [{ id: 'org-a' }] }, error: null, status: 200 });
    await waitFor(() => expect(screen.getByTestId('workspace').closest('[hidden]')).toBeNull());
    expect(screen.getByTestId('workspace').textContent).toBe('user-a:org-a:1');
  });
});
