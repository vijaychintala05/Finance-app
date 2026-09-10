// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChartOfAccountsView } from '../components/coa/ChartOfAccountsView';
import { AccountModal, getNextSubAccountCode } from '../components/coa/AccountModal';
import { AccountLedgerModal } from '../components/coa/AccountLedgerModal';
import { Account } from '../types';

afterEach(() => {
  cleanup();
});

const mockAccounts: Account[] = [
  {
    id: 'acc-parent-cash',
    name: 'Petty Cash',
    code: '1010',
    type: 'Asset',
    subType: 'Cash',
    normalBalance: 'Debit',
    balance: 5000,
    status: 'Active',
    subCategory: 'Cash on Hand',
  },
  {
    id: 'acc-sub-office',
    name: 'Petty Cash - Main Office',
    code: '1010.01',
    type: 'Asset',
    subType: 'Cash',
    normalBalance: 'Debit',
    balance: 3000,
    status: 'Active',
    parentAccountId: 'acc-parent-cash',
    subCategory: 'Cash on Hand',
  },
  {
    id: 'acc-sub-warehouse',
    name: 'Petty Cash - Warehouse',
    code: '1010.02',
    type: 'Asset',
    subType: 'Cash',
    normalBalance: 'Debit',
    balance: 2000,
    status: 'Active',
    parentAccountId: 'acc-parent-cash',
    subCategory: 'Cash on Hand',
  },
  {
    id: 'acc-ap',
    name: 'Accounts Payable',
    code: '2010',
    type: 'Liability',
    subType: 'Accounts Payable',
    normalBalance: 'Credit',
    balance: 15000,
    status: 'Active',
    isSystemAccount: true,
  },
  {
    id: 'acc-equity',
    name: "Owner's Equity",
    code: '3010',
    type: 'Equity',
    subType: 'Capital',
    normalBalance: 'Credit',
    balance: 25000,
    status: 'Active',
  },
  {
    id: 'acc-sales',
    name: 'Sales Revenue',
    code: '4010',
    type: 'Income',
    subType: 'Sales',
    normalBalance: 'Credit',
    balance: 50000,
    status: 'Active',
  },
  {
    id: 'acc-office-exp',
    name: 'Office Supplies Expense',
    code: '6010',
    type: 'Expense',
    subType: 'Operating Expense',
    normalBalance: 'Debit',
    balance: 4500,
    status: 'Active',
  },
  {
    id: 'acc-cogs',
    name: 'Direct Project Materials',
    code: '5010',
    type: 'Cost of Goods Sold',
    subType: 'Materials',
    normalBalance: 'Debit',
    balance: 8200,
    status: 'Active',
  },
];

const mockBooksContext = {
  accounts: mockAccounts,
  addAccount: vi.fn(),
  updateAccount: vi.fn(),
  settings: { currencySymbol: '$' },
  expenses: [],
  invoices: [],
  journalEntries: [],
  contacts: [],
  purchaseOrders: [],
  bills: [],
};

vi.mock('../context/BooksContext', () => ({
  useBooks: () => mockBooksContext,
}));

describe('Zoho Books Sub-Account Hierarchy & Chart of Accounts Enhancement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Sub-Account Code Generation', () => {
    it('generates next sub-account code following Zoho .01, .02 sequence', () => {
      const parent = mockAccounts[0]; // code: '1010', existing: '1010.01', '1010.02'
      const nextCode = getNextSubAccountCode(parent, mockAccounts);
      expect(nextCode).toBe('1010.03');
    });

    it('generates .01 for a parent with no existing sub-accounts', () => {
      const parent = mockAccounts[4]; // Equity 3010 with no sub-accounts
      const nextCode = getNextSubAccountCode(parent, mockAccounts);
      expect(nextCode).toBe('3010.01');
    });
  });

  describe('AccountModal Sub-Account Auto-population', () => {
    it('pre-configures sub-account modal when parentAccount prop is supplied', () => {
      const parent = mockAccounts[0]; // Petty Cash (1010, Asset, Cash)
      render(
        <AccountModal
          isOpen={true}
          onClose={vi.fn()}
          parentAccount={parent}
          initialParentId={parent.id}
        />
      );

      // Verify modal title reflects Sub-Account of Petty Cash
      expect(screen.getByText(/Create Sub-Account of Petty Cash/i)).toBeTruthy();

      // Verify Sub-account checkbox is checked
      const subAccountCheckbox = screen.getByLabelText(/make this a sub-account/i) as HTMLInputElement;
      expect(subAccountCheckbox.checked).toBe(true);

      // Verify code was suggested with .03
      const codeInput = screen.getByLabelText(/account code/i) as HTMLInputElement;
      expect(codeInput.value).toBe('1010.03');

      // Verify category reflects parent type (Asset / Cash)
      expect(screen.getByRole('button', { name: /Account type: Asset - Cash/i })).toBeTruthy();
    });

    it('auto-fills parent details when selecting parent from dropdown', () => {
      render(
        <AccountModal
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      // Check sub-account box
      const subAccountCheckbox = screen.getByLabelText(/make this a sub-account/i);
      fireEvent.click(subAccountCheckbox);

      // Parent select should now be visible
      const parentSelect = screen.getByLabelText(/parent account/i) as HTMLSelectElement;
      expect(parentSelect).toBeTruthy();

      // Select Petty Cash as parent
      fireEvent.change(parentSelect, { target: { value: 'acc-parent-cash' } });

      // Code should auto-suggest next sub-code
      const codeInput = screen.getByLabelText(/account code/i) as HTMLInputElement;
      expect(codeInput.value).toBe('1010.03');
    });
  });

  describe('ChartOfAccountsView Zoho-style Elements', () => {
    it('renders the 5 Zoho financial KPI summary cards with totals and Dr/Cr notation', () => {
      render(<ChartOfAccountsView />);

      expect(screen.getAllByText('Assets').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Liabilities').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Equity').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Income').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Expenses').length).toBeGreaterThanOrEqual(1);

      // Verify Dr/Cr badges in cards
      expect(screen.getAllByText('Dr').length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('Cr').length).toBeGreaterThanOrEqual(2);
    });

    it('renders category navigation tabs (All, Assets, Liabilities, Equity, Income, Expenses)', () => {
      render(<ChartOfAccountsView />);

      expect(screen.getByRole('button', { name: 'All Accounts' })).toBeTruthy();
      expect(screen.getAllByRole('button', { name: 'Assets' }).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByRole('button', { name: 'Liabilities' }).length).toBeGreaterThanOrEqual(1);
    });

    it('renders parent accounts and nested sub-accounts with tree indentation and badges', () => {
      render(<ChartOfAccountsView />);

      // Parent account should show sub-account count badge
      expect(screen.getAllByText(/2\s*sub-accounts/i).length).toBeGreaterThanOrEqual(1);

      // Sub-accounts should show Sub-account badges
      expect(screen.getAllByText('Sub-account').length).toBeGreaterThanOrEqual(2);

      // Verify row action buttons: Sub-Account, Ledger, Edit
      const subAccountButtons = screen.getAllByRole('button', { name: /create sub-account under petty cash/i });
      expect(subAccountButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('allows collapsing and expanding sub-accounts via chevron toggle', () => {
      render(<ChartOfAccountsView />);

      // Sub-accounts are initially visible
      expect(screen.getAllByText('Petty Cash - Main Office').length).toBeGreaterThanOrEqual(1);

      // Find collapse button for Petty Cash
      const toggleBtn = screen.getAllByTitle('Collapse sub-accounts')[0];
      fireEvent.click(toggleBtn);

      // After collapse, table row for sub-account under this parent should be collapsed
      expect(screen.queryByTitle('Collapse sub-accounts')).toBeNull();
      expect(screen.getAllByTitle('Expand sub-accounts').length).toBeGreaterThanOrEqual(1);

      // Expand again
      const expandBtn = screen.getAllByTitle('Expand sub-accounts')[0];
      fireEvent.click(expandBtn);
      expect(screen.getAllByTitle('Collapse sub-accounts').length).toBeGreaterThanOrEqual(1);
    });

    it('renders Cost of Goods Sold folder section and accounts in folders / hierarchy view', () => {
      render(<ChartOfAccountsView />);

      // Switch to hierarchy / folder tree view
      const hierarchyBtn = screen.getByRole('button', { name: /hierarchy view/i });
      fireEvent.click(hierarchyBtn);

      // Cost of Goods Sold folder card should be visible
      expect(screen.getByRole('heading', { name: 'Cost of Goods Sold' })).toBeTruthy();

      // Materials sub-type branch and Direct Project Materials account should be visible under COGS
      expect(screen.getByText('Materials')).toBeTruthy();
      expect(screen.getByText('Direct Project Materials')).toBeTruthy();
    });
  });

  describe('AccountLedgerModal Sub-Account Action', () => {
    it('renders + Sub-Account button in header for active non-system accounts', () => {
      const onAddSubAccount = vi.fn();
      const parent = mockAccounts[0]; // Petty Cash

      render(
        <AccountLedgerModal
          account={parent}
          isOpen={true}
          onClose={vi.fn()}
          onAddSubAccount={onAddSubAccount}
        />
      );

      const addSubBtn = screen.getByRole('button', { name: /create sub-account under petty cash/i });
      expect(addSubBtn).toBeTruthy();

      fireEvent.click(addSubBtn);
      expect(onAddSubAccount).toHaveBeenCalledWith(parent);
    });

    it('does not render + Sub-Account button for system accounts', () => {
      const onAddSubAccount = vi.fn();
      const systemAccount = mockAccounts[3]; // Accounts Payable (isSystemAccount: true)

      render(
        <AccountLedgerModal
          account={systemAccount}
          isOpen={true}
          onClose={vi.fn()}
          onAddSubAccount={onAddSubAccount}
        />
      );

      expect(screen.queryByRole('button', { name: /create sub-account/i })).toBeNull();
    });
  });
});
