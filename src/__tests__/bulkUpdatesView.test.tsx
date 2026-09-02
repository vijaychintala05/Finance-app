// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BulkUpdatesView } from '../components/accounting/BulkUpdatesView';
import { BooksProvider } from '../context/BooksContext';

describe('BulkUpdatesView Component', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BooksProvider>{children}</BooksProvider>
  );

  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders correctly when crypto.randomUUID is undefined (mobile/HTTP origin)', () => {
    const originalRandomUUID = globalThis.crypto?.randomUUID;
    // Simulate non-secure context where crypto.randomUUID is undefined
    if (globalThis.crypto) {
      // @ts-ignore
      delete globalThis.crypto.randomUUID;
    }

    render(<BulkUpdatesView />, { wrapper });

    expect(screen.getByText('Bulk Journal Entry')).toBeTruthy();
    expect(screen.getByText('3 entries')).toBeTruthy();
    expect(screen.getByText('CSV Template')).toBeTruthy();

    // Restore if existed
    if (originalRandomUUID && globalThis.crypto) {
      globalThis.crypto.randomUUID = originalRandomUUID;
    }
  });

  it('allows adding and removing rows', () => {
    render(<BulkUpdatesView />, { wrapper });

    expect(screen.getByText('3 entries')).toBeTruthy();

    const addBtn = screen.getByRole('button', { name: /add row/i });
    fireEvent.click(addBtn);

    expect(screen.getByText('4 entries')).toBeTruthy();

    const removeBtns = screen.getAllByTitle('Remove entry');
    expect(removeBtns.length).toBe(4);
    fireEvent.click(removeBtns[0]);

    expect(screen.getByText('3 entries')).toBeTruthy();
  });

  it('validates incomplete entries before submission', async () => {
    render(<BulkUpdatesView />, { wrapper });

    const postBtn = screen.getByRole('button', { name: /post 3 entries/i });
    fireEvent.click(postBtn);

    expect(
      await screen.findByText(/Complete every row with a date, two different accounts, and a positive amount/i)
    ).toBeTruthy();
  });
});
