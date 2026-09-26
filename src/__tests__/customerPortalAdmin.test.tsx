// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerPortalView } from '../components/portal/CustomerPortalView';

const { deleteMock, getMock, postMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  getMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('../api/client', () => ({
  ApiClient: class MockApiClient {
    get = getMock;
    post = postMock;
    delete = deleteMock;
  },
}));

describe('CustomerPortalView admin customer loading', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    getMock.mockResolvedValue({
      data: [
        {
          id: 'cli-1',
          name: 'Acme Global Technologies Inc.',
          email: 'billing@acme.test',
        },
      ],
      error: null,
      status: 200,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the customer switcher when the finance API returns its canonical array payload', async () => {
    render(<CustomerPortalView />);

    const customerSelect = await screen.findByRole('combobox', { name: 'Customer' });
    expect((customerSelect as HTMLSelectElement).value).toBe('cli-1');
    expect(screen.getByRole('option', { name: 'Acme Global Technologies Inc.' })).toBeDefined();
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    expect(getMock).toHaveBeenCalledWith('/finance/clients');
  });

  it('keeps manual token entry behind an accessible disclosure when customers are available', async () => {
    render(<CustomerPortalView />);
    await screen.findByRole('combobox', { name: 'Customer' });

    const tokenPanel = () => document.getElementById('manual-portal-token-entry');
    expect(tokenPanel()?.hidden).toBe(true);
    const disclosure = screen.getByRole('button', { name: 'Enter an existing portal token' });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(disclosure);
    const tokenInput = screen.getByLabelText('Portal token');
    expect(tokenPanel()?.hidden).toBe(false);
    expect((tokenInput as HTMLInputElement).type).toBe('password');
    expect(screen.getByRole('button', { name: 'Access' }).hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Hide manual token entry' }));
    expect(tokenPanel()?.hidden).toBe(true);
  });

  it('keeps manual token entry available when there are no customers to select', async () => {
    getMock.mockResolvedValueOnce({ data: [], error: null, status: 200 });
    render(<CustomerPortalView />);
    const tokenInput = await screen.findByLabelText('Portal token');

    expect((tokenInput as HTMLInputElement).type).toBe('password');
    expect(document.getElementById('manual-portal-token-entry')?.hidden).toBe(false);
    expect(screen.queryByRole('button', { name: 'Enter an existing portal token' })).toBeNull();
  });

  it('keeps portal-link generation failures visible with recovery guidance', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    postMock.mockResolvedValue({ data: null, error: 'Token service unavailable', status: 503 });
    render(<CustomerPortalView />);

    fireEvent.click(await screen.findByRole('button', { name: /generate \/ switch/i }));

    const notice = await screen.findByRole('alert');
    expect(notice.textContent).toContain('Portal link was not generated');
    expect(notice.textContent).toContain('Token service unavailable');
    expect(notice.textContent).toContain('retry');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('uses an in-app confirmation before revoking customer access', async () => {
    postMock.mockResolvedValue({
      data: { token: 'prt-admin-test', portalUrl: '/portal/prt-admin-test' },
      error: null,
      status: 201,
    });
    deleteMock.mockResolvedValue({ data: {}, error: null, status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Preview unavailable in test' }),
    }));
    render(<CustomerPortalView />);

    fireEvent.click(await screen.findByRole('button', { name: /generate \/ switch/i }));
    const revokeButton = await screen.findByRole('button', { name: /revoke portal access/i });
    fireEvent.click(revokeButton);

    expect(screen.getByRole('dialog', { name: /revoke customer portal access/i })).toBeTruthy();
    expect(deleteMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /confirm revoke/i }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('/stage6/portal/tokens/cli-1'));
    expect(await screen.findByText('Portal access revoked')).toBeTruthy();
  });

  it('closes the confirmation and preserves uncertainty guidance when revocation fails', async () => {
    postMock.mockResolvedValue({
      data: { token: 'prt-revoke-failure', portalUrl: '/portal/prt-revoke-failure' },
      error: null,
      status: 201,
    });
    deleteMock.mockResolvedValue({ data: null, error: 'Gateway timed out', status: 504 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Preview unavailable in test' }),
    }));
    render(<CustomerPortalView />);

    fireEvent.click(await screen.findByRole('button', { name: /generate \/ switch/i }));
    fireEvent.click(await screen.findByRole('button', { name: /revoke portal access/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm revoke/i }));

    const notice = await screen.findByRole('alert');
    expect(notice.textContent).toContain('Portal access was not revoked');
    expect(notice.textContent).toContain('Existing links may still work');
    expect(screen.queryByRole('dialog', { name: /revoke customer portal access/i })).toBeNull();
  });

  it('keeps invalid payment guidance inside the payment dialog', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        context: {
          organization: { id: 'org-1', name: 'Acme Books', currency: 'INR' },
          customer: { id: 'cli-1', name: 'Acme Global Technologies Inc.' },
          summary: { totalOutstanding: 100, openInvoicesCount: 1, overdueCount: 0 },
          invoices: [{
            id: 'inv-1',
            invoiceNumber: 'INV-001',
            issueDate: '2026-09-01',
            dueDate: '2026-10-01',
            totalAmount: 100,
            balanceDue: 100,
            status: 'SENT',
          }],
          recentPayments: [],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerPortalView initialToken="prt-payment-test" />);

    fireEvent.click(await screen.findByRole('button', { name: /pay now/i }));
    fireEvent.change(screen.getByRole('spinbutton', { name: /amount to pay/i }), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: /proceed to secure checkout/i }));

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('no more than the ₹100.00 balance due');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
