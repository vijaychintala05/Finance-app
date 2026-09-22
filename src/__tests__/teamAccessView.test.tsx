// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamAccessView } from '../components/settings/TeamAccessView';

const { deleteMock, getMock, patchMock, postMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  getMock: vi.fn(),
  patchMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('../api/client', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
    patch: patchMock,
    delete: deleteMock,
  },
}));

const owner = {
  membershipId: 'mem-owner',
  fullName: 'Asha Owner',
  email: 'asha@example.com',
  role: 'Owner',
  status: 'Active',
  joinedAt: '2026-09-01T10:00:00.000Z',
};

const accountant = {
  membershipId: 'mem-accountant',
  fullName: 'Ravi Accountant',
  email: 'ravi@example.com',
  role: 'Accountant',
  status: 'Active',
  joinedAt: '2026-09-10T10:00:00.000Z',
};

const pendingInvitation = {
  id: 'invite-1',
  email: 'new@example.com',
  role: 'Viewer',
  status: 'Pending',
  createdAt: '2026-09-20T10:00:00.000Z',
  expiresAt: '2026-09-23T10:00:00.000Z',
};

describe('TeamAccessView authoritative access lifecycle', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
    getMock.mockImplementation(async (endpoint: string) => ({
      data: endpoint === '/access/members' ? [owner, accountant] : [pendingInvitation],
      error: null,
      status: 200,
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows authoritative member and invitation lifecycle state', async () => {
    render(<TeamAccessView />);

    expect(await screen.findByText('Asha Owner')).toBeTruthy();
    expect(screen.getByText('Ravi Accountant')).toBeTruthy();
    expect(screen.getByText('new@example.com')).toBeTruthy();
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    expect(screen.getByText('Every access change recorded')).toBeTruthy();
    expect(getMock).toHaveBeenCalledWith('/access/members');
    expect(getMock).toHaveBeenCalledWith('/access/invitations');
  });

  it('confirms role changes and explains session invalidation', async () => {
    patchMock.mockResolvedValue({ data: { membershipId: 'mem-accountant' }, error: null, status: 200 });
    render(<TeamAccessView />);

    const roleSelect = await screen.findByRole('combobox', { name: 'Role for Ravi Accountant' });
    fireEvent.change(roleSelect, { target: { value: 'Viewer' } });

    expect(screen.getByRole('dialog', { name: /change ravi accountant's role/i })).toBeTruthy();
    expect(screen.getByText(/existing sessions will be invalidated/i)).toBeTruthy();
    expect(patchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Change role' }));
    await waitFor(() => expect(patchMock).toHaveBeenCalledWith('/access/members/mem-accountant/role', { role: 'Viewer' }));
    expect(await screen.findByText('Member role changed')).toBeTruthy();
    expect(screen.getByText(/must sign in again|existing sessions were invalidated/i)).toBeTruthy();
  });

  it('requires confirmation before revoking membership access', async () => {
    deleteMock.mockResolvedValue({ data: { membershipId: 'mem-accountant' }, error: null, status: 200 });
    render(<TeamAccessView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke access for Ravi Accountant' }));
    expect(screen.getByRole('dialog', { name: /revoke ravi accountant's access/i })).toBeTruthy();
    expect(deleteMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('/access/members/mem-accountant'));
    expect(await screen.findByText('Member access revoked')).toBeTruthy();
  });

  it('reports an uncertain revocation outcome without browser dialogs', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    deleteMock.mockResolvedValue({
      data: null,
      error: 'Connection closed before the response arrived',
      status: 500,
      errorCode: 'NETWORK_FAILURE',
    });
    render(<TeamAccessView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke invitation for new@example.com' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke invitation' }));

    expect(await screen.findByText('Revocation could not be confirmed')).toBeTruthy();
    expect(screen.getByText(/refresh the roster before retrying/i)).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does not encourage duplicate submission when invitation creation commits but refresh fails', async () => {
    let failRefresh = false;
    getMock.mockImplementation(async (endpoint: string) => failRefresh
      ? { data: null, error: 'Roster service timed out', status: 503 }
      : {
          data: endpoint === '/access/members' ? [owner, accountant] : [pendingInvitation],
          error: null,
          status: 200,
        });
    postMock.mockImplementation(async () => {
      failRefresh = true;
      return {
        data: {
          ...pendingInvitation,
          id: 'invite-2',
          email: 'committed@example.com',
          token: 'single-use-secret-token',
        },
        error: null,
        status: 201,
      };
    });
    render(<TeamAccessView />);

    await screen.findByText('Asha Owner');
    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'Committed@Example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }));

    expect(await screen.findByText(/invitation created, but the roster is stale/i)).toBeTruthy();
    expect(screen.getByText(/do not repeat the action/i)).toBeTruthy();
    expect(screen.getByText('single-use-secret-token')).toBeTruthy();
    expect(postMock).toHaveBeenCalledWith('/access/invitations', {
      email: 'committed@example.com',
      role: 'Accountant',
      expiresInHours: 72,
    });
  });
});
