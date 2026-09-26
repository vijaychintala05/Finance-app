// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuickAddAccountModal } from '../components/common/QuickAddAccountModal';
import { useBooks } from '../context/BooksContext';
import { ApiRequestError } from '../api/client';
import { BankingService } from '../services/bankingService';

vi.mock('../context/BooksContext', () => ({ useBooks: vi.fn() }));
vi.mock('../services/bankingService', () => ({ BankingService: { createAccount: vi.fn() } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('QuickAddAccountModal committed account receipt', () => {
  it('shows a deterministic bank setup rejection while keeping the committed ledger account blocked from duplication', async () => {
    const onClose = vi.fn();
    const addAccount = vi.fn().mockResolvedValue({
      data: { id: 'ledger-1', code: '1010', name: 'Operating Bank', type: 'Asset', subType: 'Bank', balance: 0 },
      requestId: 'req-ledger-create',
      refreshFailed: false,
    });
    vi.mocked(BankingService.createAccount).mockRejectedValueOnce(new ApiRequestError({
      data: null, error: 'Invalid bank account number', status: 400, errorCode: 'BANK_ACCOUNT_INVALID', requestId: 'req-bank-create',
    }, 'Bank account setup failed'));
    vi.mocked(useBooks).mockReturnValue({ accounts: [], addAccount, settings: { currencyCode: 'USD' } } as any);

    render(<QuickAddAccountModal isOpen onClose={onClose} defaultCategory="Bank" />);
    fireEvent.change(screen.getByPlaceholderText('e.g. HDFC Operating Checking Account'), { target: { value: 'Operating Bank' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 1010'), { target: { value: '1010' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. HDFC Bank'), { target: { value: 'HDFC Bank' } });
    fireEvent.change(screen.getByPlaceholderText('4–34 letters or digits'), { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Account' }));

    const notice = await screen.findByRole('alert');
    expect(notice.textContent).toContain('Ledger account saved; bank setup was rejected');
    expect(notice.textContent).toContain('Invalid bank account number');
    expect(notice.textContent).toContain('req-bank-create');
    expect(notice.textContent).not.toContain('outcome needs review');
    expect(addAccount).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Inspect before continuing' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not start bank setup when ledger account refresh verification fails', async () => {
    const onClose = vi.fn();
    const addAccount = vi.fn().mockResolvedValue({
      data: { id: 'ledger-1', code: '1010', name: 'Operating Bank', type: 'Asset', subType: 'Bank', balance: 0 },
      requestId: 'req-ledger-create',
      refreshFailed: true,
    });
    vi.mocked(useBooks).mockReturnValue({ accounts: [], addAccount, settings: { currencyCode: 'USD' } } as any);

    render(<QuickAddAccountModal isOpen onClose={onClose} defaultCategory="Bank" />);
    fireEvent.change(screen.getByPlaceholderText('e.g. HDFC Operating Checking Account'), { target: { value: 'Operating Bank' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 1010'), { target: { value: '1010' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. HDFC Bank'), { target: { value: 'HDFC Bank' } });
    fireEvent.change(screen.getByPlaceholderText('4–34 letters or digits'), { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Account' }));

    const receipt = await screen.findByRole('status');
    expect(receipt.textContent).toContain('Ledger account saved; refresh could not verify it');
    expect(receipt.textContent).toContain('Bank setup was not started');
    expect(receipt.textContent).toContain('req-ledger-create');
    expect(BankingService.createAccount).not.toHaveBeenCalled();
    expect(addAccount).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Inspect before continuing' }) as HTMLButtonElement).disabled).toBe(true);
  });
});