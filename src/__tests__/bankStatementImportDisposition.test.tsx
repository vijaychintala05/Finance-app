/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportStatementModal } from '../components/banking/ImportStatementModal';

const serviceMocks = vi.hoisted(() => ({
  previewImport: vi.fn(),
  confirmImport: vi.fn(),
}));

vi.mock('../services/bankingService', () => ({
  BankingService: serviceMocks,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Bank statement import disposition preview', () => {
  it('shows what will be imported, reviewed, and skipped before confirmation', async () => {
    serviceMocks.previewImport.mockResolvedValue({
      fileHash: 'hash-1',
      filename: 'statement.csv',
      sourceFormat: 'CSV',
      currency: 'INR',
      openingBalance: 1000,
      closingBalance: 1100,
      totalRows: 3,
      exactDuplicatesCount: 1,
      newRowsCount: 1,
      possibleDuplicatesCount: 1,
      discrepancy: 0,
      previewRows: [
        { date: '2026-09-01', narration: 'New receipt', moneyIn: 100, status: 'NEW' },
        { date: '2026-09-02', narration: 'Near duplicate', moneyOut: 50, status: 'POSSIBLE_DUPLICATE' },
        { date: '2026-09-03', narration: 'Already imported', moneyOut: 25, status: 'EXACT_DUPLICATE' },
      ],
    });

    const { container } = render(
      <ImportStatementModal
        isOpen
        onClose={vi.fn()}
        account={null}
        bankAccount={null}
      />
    );

    const file = new File(['Date,Narration,Amount'], 'statement.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue('Date,Narration,Amount'),
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const previewButton = await screen.findByRole('button', { name: /Preview Statement/i }) as HTMLButtonElement;
    await waitFor(() => expect(previewButton.disabled).toBe(false));
    fireEvent.click(previewButton);

    expect(await screen.findByText('Ready to import')).toBeDefined();
    expect(screen.getByText('Review after import')).toBeDefined();
    expect(screen.getByText('Skip exact duplicate')).toBeDefined();
    expect(screen.getByText(/retained in the import audit trail/i)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Import 2 Rows' })).toBeDefined();
  });
});
