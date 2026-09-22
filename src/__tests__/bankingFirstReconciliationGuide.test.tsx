/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BankingOverviewTable } from '../components/banking/BankingOverviewTable';
import { Account } from '../types';

afterEach(() => cleanup());

const bankAccount: Account = {
  id: 'bank-1',
  code: '1001',
  name: 'Operating Bank',
  type: 'Asset',
  subType: 'Bank',
  status: 'Active',
  balance: 25000,
};

const pettyCashAccount: Account = {
  id: 'cash-1',
  code: '1010',
  name: 'Petty Cash',
  type: 'Asset',
  subType: 'Cash',
  status: 'Active',
  balance: 500,
};

const renderOverview = (onImportStatement = vi.fn()) => {
  render(
    <BankingOverviewTable
      accounts={[bankAccount, pettyCashAccount]}
      overviewData={[]}
      currencySymbol="₹"
      onSelectAccount={vi.fn()}
      onImportStatement={onImportStatement}
      onReconcile={vi.fn()}
      onTransferFunds={vi.fn()}
      onRecordTransaction={vi.fn()}
    />
  );
};

describe('Banking first reconciliation guide', () => {
  it('explains the safe reconciliation path and excludes petty cash from statement coverage', () => {
    renderOverview();

    expect(screen.getByRole('heading', { name: 'Finish your first bank reconciliation' })).toBeDefined();
    expect(screen.getByText(/0 of 1 statement accounts have imported bank evidence/i)).toBeDefined();
    expect(screen.getByText(/does not post to your ledger/i)).toBeDefined();
    expect(screen.getByText('Import the latest statement')).toBeDefined();
    expect(screen.getByText('Review unmatched rows')).toBeDefined();
    expect(screen.getByText('Confirm the closing balance')).toBeDefined();
  });

  it('opens the only uncovered account directly', () => {
    const onImportStatement = vi.fn();
    renderOverview(onImportStatement);

    fireEvent.click(screen.getByRole('button', { name: 'Import first statement' }));

    expect(onImportStatement).toHaveBeenCalledTimes(1);
    expect(onImportStatement).toHaveBeenCalledWith(bankAccount);
  });
});
