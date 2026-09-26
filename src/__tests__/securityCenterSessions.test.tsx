// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SecurityCenterView } from '../components/security/SecurityCenterView';
import { apiClient } from '../api/client';

vi.mock('../api/client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../context/BooksContext', () => ({ useBooks: () => ({ currentOrg: { id: 'org-1', name: 'Example Org' } }) }));

const api = vi.mocked(apiClient);
const sessions = [
  { id: 'sess-current', deviceName: 'Windows Desktop', ipAddress: '192.0.2.1', status: 'ACTIVE', expiresAt: '2026-10-01T00:00:00.000Z', lastActivityAt: '2026-09-24T00:00:00.000Z', createdAt: '2026-09-20T00:00:00.000Z' },
  { id: 'sess-other', deviceName: 'Mobile Device', status: 'ACTIVE', expiresAt: '2026-10-01T00:00:00.000Z', lastActivityAt: '2026-09-23T00:00:00.000Z', createdAt: '2026-09-19T00:00:00.000Z' },
];

function mockSecurityReads(currentSessionId = 'sess-current') {
  api.get.mockImplementation(async (endpoint: any) => {
    if (endpoint === '/identity/sessions') return { data: { currentSessionId, sessions }, status: 200 } as any;
    if (endpoint === '/identity/outbox') return { data: [], status: 200 } as any;
    if (endpoint === '/identity/security-events') return { data: [], status: 200 } as any;
    if (endpoint === '/identity/mfa/status') return { data: { isEnrolled: false, isVerified: false, remainingRecoveryCodes: 0 }, status: 200 } as any;
    return { data: null, error: 'not found', status: 404 } as any;
  });
}

describe('Security Center session controls', () => {
  beforeEach(() => { vi.clearAllMocks(); mockSecurityReads(); });
  afterEach(() => cleanup());

  it('shows unknown IP instead of fabricating a location and confirms only the server receipt', async () => {
    api.post.mockResolvedValue({ data: { success: true }, status: 200 } as any);
    render(<SecurityCenterView />);
    expect(await screen.findByText(/Active Devices & Login Sessions \(2\)/)).toBeDefined();
    expect(screen.getByText('IP: Unknown')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Terminate' }));
    expect(await screen.findByText('Device session revoked. Its access token can no longer be used.')).toBeDefined();
    expect(api.post).toHaveBeenCalledWith('/identity/sessions/sess-other/revoke', {});
  });

  it('clears stale device identity and reports a failed session-list refresh', async () => {
    const { unmount } = render(<SecurityCenterView />);
    await screen.findByText(/Active Devices & Login Sessions \(2\)/);
    unmount();
    api.get.mockImplementation(async (endpoint: any) => {
      if (endpoint === '/identity/sessions') return { data: null, error: 'Session list unavailable', status: 503 } as any;
      if (endpoint === '/identity/outbox') return { data: [], status: 200 } as any;
      if (endpoint === '/identity/security-events') return { data: [], status: 200 } as any;
      return { data: { isEnrolled: false, isVerified: false, remainingRecoveryCodes: 0 }, status: 200 } as any;
    });
    render(<SecurityCenterView />);
    expect((await screen.findByRole('alert')).textContent).toContain('Session list unavailable');
    expect(screen.queryByRole('button', { name: 'Revoke All Other Devices' })).toBeNull();
    expect(screen.queryByText('No device sessions are available for this account.')).toBeNull();
  });
  it('keeps failed revocation visible and disables session controls when current device is unknown', async () => {
    api.post.mockResolvedValue({ data: null, error: 'Revocation unavailable', status: 503 } as any);
    const { unmount } = render(<SecurityCenterView />);
    await screen.findByRole('button', { name: 'Terminate' });
    fireEvent.click(screen.getByRole('button', { name: 'Terminate' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Revocation unavailable');

    unmount();
    mockSecurityReads('');
    render(<SecurityCenterView />);
    await waitFor(() => expect(screen.getByText('Current device could not be verified. Sign in again before using session controls.')).toBeDefined());
    expect(screen.queryByRole('button', { name: 'Revoke All Other Devices' })).toBeNull();
  });
});
