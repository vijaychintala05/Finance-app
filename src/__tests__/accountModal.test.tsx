// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { ApiRequestError, apiClient } from '../api/client';
import { AccountModal, getNextAvailableAccountCode } from '../components/coa/AccountModal';
import { Account } from '../types';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mockAccountActionGuards.length = 0;
  accountsForModal = mockAccounts;
  mockVerifyAccountActionStatus.mockResolvedValue('verified');
  vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => endpoint.includes('/usage-impact')
    ? { data: { balance: 0, totalReferences: 0, references: [], accountingDefaults: [], archiveBlockers: [], deleteBlockers: [], inventoryComplete: true, unclassifiedAccountReferenceColumns: [] }, error: null, status: 200 } as any
    : { data: null, error: null, status: 200 } as any);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mockAccounts: Account[] = [
  {
    id: 'acc-1',
    code: '1010',
    name: 'Petty Cash',
    type: 'Asset',
    subType: 'Cash',
    balance: 100,
    status: 'Active',
    normalBalance: 'Debit',
  },
  {
    id: 'acc-2',
    code: '6010',
    name: 'Office Rent',
    type: 'Expense',
    subType: 'Office & Administrative',
    balance: 500,
    status: 'Active',
    normalBalance: 'Debit',
  },
  {
    id: 'acc-3',
    code: '6020',
    name: 'Archived Subscriptions',
    type: 'Expense',
    subType: 'Software & Subscriptions',
    balance: 0,
    status: 'Archived',
    normalBalance: 'Debit',
  },
];

let accountsForModal: Account[] = mockAccounts;
const mockAddAccount = vi.fn();
const mockUpdateAccount = vi.fn();
const mockDeleteAccount = vi.fn();
const mockVerifyAccountActionStatus = vi.fn();
const mockAccountActionGuards: any[] = [];

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    accounts: accountsForModal,
    addAccount: mockAddAccount,
    updateAccount: mockUpdateAccount,
    deleteAccount: mockDeleteAccount,
    currentOrg: { id: 'org-1' },
    currentUser: { userId: 'user-1' },
    accountActionUserId: 'user-1',
    accountActionGuards: mockAccountActionGuards,
    verifyAccountActionStatus: mockVerifyAccountActionStatus,
  }),
}));

describe('AccountModal', () => {
  it('keeps account creation focused and moves advanced controls out of the primary flow', () => {
    render(<AccountModal isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Create account' })).toBeTruthy();
    expect(screen.getByLabelText(/account type/i)).toBeTruthy();
    expect(screen.getByLabelText(/account name/i)).toBeTruthy();
    expect(screen.getByLabelText(/account code/i)).toBeTruthy();
    expect(screen.getByLabelText(/description/i)).toBeTruthy();
    expect(screen.getByText('Additional account settings')).toBeTruthy();
    expect(screen.getByText('Opening balance')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save account' })).toBeTruthy();
  });

  it('suggests the next available code avoiding collisions and reserved codes', () => {
    const nextAssetCode = getNextAvailableAccountCode('Asset', mockAccounts);
    expect(nextAssetCode).toBeTruthy();
    expect(nextAssetCode).not.toBe('1010'); // 1010 is taken
    expect(nextAssetCode).not.toBe('1000'); // 1000 is reserved

    const nextExpenseCode = getNextAvailableAccountCode('Expense', mockAccounts);
    expect(nextExpenseCode).toBeTruthy();
    expect(nextExpenseCode).not.toBe('6010'); // taken
    expect(nextExpenseCode).not.toBe('6020'); // archived but taken
    expect(nextExpenseCode).not.toBe('6000'); // reserved
  });

  it('uses the in-app searchable picker to select an expense subtype', () => {
    render(<AccountModal isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/account type: asset - bank/i));
    const search = screen.getByPlaceholderText('Search account types');
    fireEvent.click(screen.getByRole('button', { name: /^Expense$/ }));

    expect(screen.getByRole('option', { name: 'Expense: Payroll' })).toBeTruthy();
    fireEvent.change(search, { target: { value: 'software' } });
    expect(screen.getByRole('option', { name: 'Expense: Software & Subscriptions' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Expense: Payroll' })).toBeNull();

    fireEvent.click(screen.getByRole('option', { name: 'Expense: Software & Subscriptions' }));
    expect(screen.getByLabelText(/account type: expense - software & subscriptions/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search account types')).toBeNull();
  });

  it('detects collision with active account code and displays warning', () => {
    render(<AccountModal isOpen onClose={vi.fn()} />);

    const codeInput = screen.getByLabelText(/account code/i);
    fireEvent.change(codeInput, { target: { value: '1010' } });

    expect(screen.getByText(/already in use by "Petty Cash"/i)).toBeTruthy();
    const saveButton = screen.getByRole('button', { name: 'Save account' });
    expect(saveButton.hasAttribute('disabled')).toBe(true);
  });

  it('detects collision with archived account code and explains how to restore it', () => {
    render(<AccountModal isOpen onClose={vi.fn()} />);

    const codeInput = screen.getByLabelText(/account code/i);
    fireEvent.change(codeInput, { target: { value: '6020' } });

    expect(screen.getByText(/belongs to archived account "Archived Subscriptions"/i)).toBeTruthy();
  });

  it('reveals a compatible parent picker when creating a sub-account', () => {
    render(<AccountModal isOpen onClose={vi.fn()} />);

    const toggle = screen.getByRole('checkbox', { name: /make this a sub-account/i });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText(/^parent account/i)).toBeNull();

    fireEvent.click(toggle);

    const parentPicker = screen.getByLabelText(/^parent account/i) as HTMLSelectElement;
    expect(parentPicker.required).toBe(true);
    expect(screen.getByRole('option', { name: '1010 - Petty Cash' })).toBeTruthy();
    fireEvent.change(parentPicker, { target: { value: 'acc-1' } });
    expect(parentPicker.value).toBe('acc-1');
  });

  it('cancels an archive confirmation without sending a request', async () => {
    const account = mockAccounts.find((candidate) => candidate.id === 'acc-1')!;
    render(<AccountModal isOpen onClose={vi.fn()} accountToEdit={account} />);

    await waitFor(() => expect((screen.getByRole('button', { name: /^archive$/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }));
    expect(screen.getByRole('alertdialog', { name: 'Archive account?' })).toBeTruthy();
    expect(screen.getByText('1010 · Petty Cash')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));

    expect(mockUpdateAccount).not.toHaveBeenCalled();
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('restores only after an accessible confirmation and sends one request', async () => {
    const archivedAccount = mockAccounts.find((candidate) => candidate.id === 'acc-3')!;
    const onClose = vi.fn();
    mockUpdateAccount.mockResolvedValue({ data: archivedAccount, requestId: 'req-restore', refreshFailed: false });
    render(<AccountModal isOpen onClose={onClose} accountToEdit={archivedAccount} />);

    fireEvent.click(screen.getByRole('button', { name: /restore to active/i }));
    expect(screen.getByRole('alertdialog', { name: 'Restore account?' })).toBeTruthy();
    expect(mockUpdateAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restore account' }));

    await waitFor(() => expect(mockUpdateAccount).toHaveBeenCalledTimes(1));
    expect(mockUpdateAccount).toHaveBeenCalledWith('acc-3', { status: 'Active' }, undefined);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('deletes only after confirming the permanent consequence', async () => {
    const account = mockAccounts.find((candidate) => candidate.id === 'acc-3')!;
    mockDeleteAccount.mockResolvedValue({
      data: { deleted: true, id: account.id },
      requestId: 'req-delete',
      refreshFailed: false,
    });
    render(<AccountModal isOpen onClose={vi.fn()} accountToEdit={account} />);

    await waitFor(() => expect((screen.getByRole('button', { name: /^delete$/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(screen.getByText(/permanently removes the account/i)).toBeTruthy();
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledWith('acc-3', undefined));
  });

  it('keeps a deterministic rejection in the dialog and allows correction or cancellation', async () => {
    const account = mockAccounts.find((candidate) => candidate.id === 'acc-1')!;
    mockUpdateAccount.mockRejectedValue(new ApiRequestError({
      data: null,
      error: 'Account has dependent records.',
      status: 409,
      requestId: 'req-conflict',
    }, 'Account could not be archived'));
    render(<AccountModal isOpen onClose={vi.fn()} accountToEdit={account} />);

    await waitFor(() => expect((screen.getByRole('button', { name: /^archive$/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive account' }));

    expect(await screen.findByText('Account archive was not completed')).toBeTruthy();
    expect(screen.getByRole('alertdialog', { name: 'Archive account?' })).toBeTruthy();
    expect(screen.getByText('req-conflict')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Archive account' }).hasAttribute('disabled')).toBe(false);
  });

  it('blocks another request after an uncertain server outcome', async () => {
    const account = mockAccounts.find((candidate) => candidate.id === 'acc-1')!;
    mockAccountActionGuards.push({ organizationId: 'org-1', accountId: account.id, userId: 'user-1', action: 'archive', idempotencyKey: 'uncertain-key', payload: { status: 'Archived' } });
    mockUpdateAccount.mockRejectedValue(new ApiRequestError({
      data: null,
      error: 'Service unavailable.',
      status: 503,
      requestId: 'req-uncertain',
    }, 'Account could not be archived'));
    render(<AccountModal isOpen onClose={vi.fn()} accountToEdit={account} />);

    await waitFor(() => expect((screen.getByRole('button', { name: /^archive$/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive account' }));

    expect(await screen.findByText('Account archive outcome could not be confirmed')).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: /^archive$/i }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('req-uncertain')).toBeTruthy();
  });

  it('shows committed-but-stale feedback and blocks another account mutation', async () => {
    const account = mockAccounts.find((candidate) => candidate.id === 'acc-1')!;
    mockAccountActionGuards.push({ organizationId: 'org-1', accountId: account.id, userId: 'user-1', action: 'archive', idempotencyKey: 'stale-key', payload: { status: 'Archived' } });
    mockUpdateAccount.mockResolvedValue({ data: account, requestId: 'req-stale', refreshFailed: true });
    render(<AccountModal isOpen onClose={vi.fn()} accountToEdit={account} />);

    await waitFor(() => expect((screen.getByRole('button', { name: /^archive$/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive account' }));

    expect(await screen.findByText('Account archive committed; refresh failed')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^archive$/i }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('req-stale')).toBeTruthy();
  });


  it('reopens a pending lifecycle action and retries with its original idempotency key', async () => {
    const account = mockAccounts.find((candidate) => candidate.id === 'acc-1')!;
    mockAccountActionGuards.push({
      organizationId: 'org-1', accountId: account.id, userId: 'user-1', action: 'archive',
      idempotencyKey: 'account-archive-key', payload: { status: 'Archived' },
      requestId: 'req-archive-pending',
    });
    mockVerifyAccountActionStatus.mockResolvedValue('pending');
    mockUpdateAccount.mockResolvedValue({ data: { ...account, status: 'Archived' }, requestId: 'req-archive-replay', refreshFailed: false });
    const onClose = vi.fn();
    render(<AccountModal isOpen onClose={onClose} accountToEdit={account} />);

    await waitFor(() => expect(mockVerifyAccountActionStatus).toHaveBeenCalledWith(account.id, 'org-1'));
    expect(screen.getByRole('button', { name: 'Verify status' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive account' }));

    await waitFor(() => expect(mockUpdateAccount).toHaveBeenCalledWith(account.id, { status: 'Archived' }, 'account-archive-key'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('verifies a pending account guard only once across parent rerenders', async () => {
    const account = mockAccounts.find((candidate) => candidate.id === 'acc-1')!;
    mockAccountActionGuards.push({ organizationId: 'org-1', accountId: account.id, userId: 'user-1', action: 'archive', idempotencyKey: 'pending-once-key', payload: { status: 'Archived' } });
    mockVerifyAccountActionStatus.mockResolvedValue('pending');
    const firstOnClose = vi.fn();
    const view = render(<AccountModal isOpen onClose={firstOnClose} accountToEdit={account} />);
    await waitFor(() => expect(mockVerifyAccountActionStatus).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Account action is still unresolved')).toBeTruthy();

    view.rerender(<AccountModal isOpen onClose={() => undefined} accountToEdit={account} />);
    await waitFor(() => expect(screen.getByText('Account action is still unresolved')).toBeTruthy());
    expect(mockVerifyAccountActionStatus).toHaveBeenCalledTimes(1);
  });

  it('keeps a legacy guard without an owner blocked from verify and replay', async () => {
    const account = mockAccounts.find((candidate) => candidate.id === 'acc-1')!;
    mockAccountActionGuards.push({ organizationId: 'org-1', accountId: account.id, action: 'archive', idempotencyKey: 'legacy-key', payload: { status: 'Archived' } });
    render(<AccountModal isOpen onClose={vi.fn()} accountToEdit={account} />);

    expect(await screen.findByText('This older saved action has no recorded owner and is blocked pending manual server-audit reconciliation.')).toBeTruthy();
    expect(mockVerifyAccountActionStatus).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Verify status' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Review and retry saved action' }).hasAttribute('disabled')).toBe(true);
  });

  it('does not offer deletion for a system account', () => {
    const systemAccount = { ...mockAccounts[0], isSystemAccount: true };
    render(<AccountModal isOpen onClose={vi.fn()} accountToEdit={systemAccount} />);

    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull();
  });
  it('keeps account creation open and blocks resubmission when the committed refresh fails', async () => {
    const onClose = vi.fn();
    mockAddAccount.mockResolvedValue({
      data: { id: 'acc-created', code: '7000', name: 'New Account', type: 'Expense', subType: 'Office & Administrative', balance: 0 },
      requestId: 'req-account-create',
      refreshFailed: true,
    });
    render(<AccountModal isOpen onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/account name/i), { target: { value: 'New Account' } });
    fireEvent.change(screen.getByLabelText(/account code/i), { target: { value: '7000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save account' }));

    const receipt = await screen.findByRole('status');
    expect(receipt.textContent).toContain('Account created; refresh could not verify it');
    expect(receipt.textContent).toContain('req-account-create');
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Save account' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mockAddAccount).toHaveBeenCalledTimes(1);
  });
  it('preserves a stale account receipt and blocks duplicate create through parent and account-list rerenders', async () => {
    const onClose = vi.fn();
    mockAddAccount.mockResolvedValue({
      data: { id: 'acc-created', code: '7000', name: 'New Account', type: 'Expense', subType: 'Office & Administrative', balance: 0 },
      requestId: 'req-account-create-rerender',
      refreshFailed: true,
    });
    const { rerender } = render(<AccountModal isOpen onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/account name/i), { target: { value: 'New Account' } });
    fireEvent.change(screen.getByLabelText(/account code/i), { target: { value: '7000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save account' }));
    await screen.findByRole('status');

    accountsForModal = [...mockAccounts, { id: 'acc-other', code: '8000', name: 'Other Account', type: 'Expense', subType: 'Office & Administrative', balance: 0 }];
    rerender(<AccountModal isOpen onClose={() => undefined} />);

    expect(screen.getByRole('status').textContent).toContain('req-account-create-rerender');
    expect((screen.getByLabelText(/account name/i) as HTMLInputElement).value).toBe('New Account');
    expect((screen.getByRole('button', { name: 'Save account' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mockAddAccount).toHaveBeenCalledTimes(1);
  });
  it('closes once after the created account is verified in the refreshed list', async () => {
    const onClose = vi.fn();
    mockAddAccount.mockResolvedValue({
      data: { id: 'acc-created', code: '7000', name: 'New Account', type: 'Expense', subType: 'Office & Administrative', balance: 0 },
      requestId: 'req-account-create-ok',
      refreshFailed: false,
    });
    render(<AccountModal isOpen onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/account name/i), { target: { value: 'New Account' } });
    fireEvent.change(screen.getByLabelText(/account code/i), { target: { value: '7000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save account' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('keeps a deterministic account rejection inline and permits correction', async () => {
    mockAddAccount.mockRejectedValue(new ApiRequestError({ data: null, error: 'Code already exists', status: 409, errorCode: 'ACCOUNT_CODE_CONFLICT' }, 'Account could not be created'));
    render(<AccountModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/account name/i), { target: { value: 'New Account' } });
    fireEvent.change(screen.getByLabelText(/account code/i), { target: { value: '7000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save account' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Code already exists');
    expect((screen.getByRole('button', { name: 'Save account' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('interactively updates the aside preview card when hovering over account types or filtering by category', () => {
    render(<AccountModal isOpen onClose={vi.fn()} />);

    // Initially defaults to Asset / Bank or Cash
    expect(screen.getAllByText('Normal balance').length).toBeGreaterThanOrEqual(1);

    // Open account type dropdown
    const typeDropdownButton = screen.getByRole('button', { name: /Account type:/i });
    fireEvent.click(typeDropdownButton);

    // Click Equity category pill
    const equityPill = screen.getByRole('button', { name: 'Equity' });
    fireEvent.click(equityPill);

    // Preview badge or Equity preview should be triggered
    expect(screen.getAllByText('Equity').length).toBeGreaterThanOrEqual(1);

    // Find Retained Earnings option and hover over it
    const retainedEarningsOption = screen.getByRole('option', { name: /Retained Earnings/i });
    fireEvent.mouseEnter(retainedEarningsOption);

    // The aside preview card should now interactively preview Retained Earnings
    expect(screen.getByText('Live Preview')).toBeTruthy();
    expect(screen.getByText(/Accumulated earnings/i)).toBeTruthy();

    // Now select it by clicking
    fireEvent.click(retainedEarningsOption);

    // Dropdown closes, live preview returns to Active state
    expect(screen.queryByText('Live Preview')).toBeNull();
    expect(screen.getByText('Active')).toBeTruthy();
  });
});
