// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerPortalView } from '../components/portal/CustomerPortalView';

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}));

vi.mock('../api/client', () => ({
  ApiClient: class MockApiClient {
    get = getMock;
    post = vi.fn();
    delete = vi.fn();
  },
}));

describe('CustomerPortalView admin customer loading', () => {
  beforeEach(() => {
    getMock.mockReset();
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

  afterEach(() => cleanup());

  it('renders the customer switcher when the finance API returns its canonical array payload', async () => {
    render(<CustomerPortalView />);

    const customerSelect = await screen.findByRole('combobox', { name: 'Customer' });
    expect((customerSelect as HTMLSelectElement).value).toBe('cli-1');
    expect(screen.getByRole('option', { name: 'Acme Global Technologies Inc.' })).toBeDefined();
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    expect(getMock).toHaveBeenCalledWith('/finance/clients');
  });
});
