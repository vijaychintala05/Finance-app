/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BankingOverviewTable } from '../components/banking/BankingOverviewTable';
import { BankAccountWorkspace } from '../components/banking/BankAccountWorkspace';
import { BankTransactionsFeed } from '../components/banking/BankTransactionsFeed';
import { Account } from '../types';

afterEach(() => {
  cleanup();
});

const mockAccount: Account = {
  id: 'bank-acc-1',
  code: '1020',
  name: 'HDFC Bank - Current Account',
  type: 'Bank',
  subType: 'Bank',
  status: 'Active',
  balance: 150000,
};

describe('Zoho Books Banking Columns and UI', () => {
  it('renders BankingOverviewTable with exact Zoho Books columns and summary cards', () => {
    render(
      <BankingOverviewTable
        accounts={[mockAccount]}
        overviewData={[
          {
            id: 'bank-acc-1',
            organizationId: 'org-1',
            accountName: 'HDFC Bank - Current Account',
            accountNumber: '1234567890',
            maskedAccountNumber: '•••• 7890',
            bankName: 'HDFC Bank',
            accountType: 'Bank',
            currency: 'INR',
            currentBalance: 150000,
            bookBalance: 150000,
            statementBalance: 150000,
            difference: 0,
            toReviewCount: 2,
            lastStatementDate: '2026-09-10',
            status: 'RECONCILED',
            hasStatement: true,
            isActive: true,
            isArchived: false,
          },
        ]}
        currencySymbol="₹"
        onSelectAccount={vi.fn()}
        onImportStatement={vi.fn()}
        onReconcile={vi.fn()}
        onTransferFunds={vi.fn()}
        onRecordTransaction={vi.fn()}
      />
    );

    // Verify 3 Zoho Books Header Summary Cards
    expect(screen.getByText(/Amount in FirmBooks \(Book Balance\)/i)).toBeDefined();
    expect(screen.getByText(/Amount in Bank \(Statement Balance\)/i)).toBeDefined();
    expect(screen.getByText(/Feeds to Review/i)).toBeDefined();

    // Verify Exact Zoho Books Banking Overview Table Column Headers
    expect(screen.getByText('Bank Account')).toBeDefined();
    expect(screen.getAllByText('Amount in FirmBooks').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Amount in Bank').length).toBeGreaterThan(0);
    expect(screen.getByText('Difference')).toBeDefined();
    expect(screen.getByText('To Review')).toBeDefined();
    expect(screen.getByText('Last Imported')).toBeDefined();
    expect(screen.getByText('Actions')).toBeDefined();

    // Verify Balanced status badge
    expect(screen.getByText('Balanced')).toBeDefined();
    // Verify To Review count
    expect(screen.getByText('2 to review')).toBeDefined();
  });

  it('renders BankAccountWorkspace with exact Zoho Books columns (Date, Particulars, Withdrawals DR, Deposits CR, Status, Actions)', () => {
    render(
      <BankAccountWorkspace
        account={mockAccount}
        bankAccount={{
          id: 'ba-1',
          organizationId: 'org-1',
          ledgerAccountId: 'bank-acc-1',
          bankName: 'HDFC Bank',
          accountName: 'HDFC Bank - Current Account',
          accountNumber: '1234567890',
          accountType: 'SAVINGS',
          currency: 'INR',
          currentBalance: 150000,
          isActive: true,
          isLocked: false,
          createdAt: '2026-09-01',
          updatedAt: '2026-09-01',
        }}
        journalEntries={[
          {
            id: 'jrn-1',
            entryNumber: 'JRN-001',
            date: '2026-09-12',
            description: 'Client payment received via NEFT',
            status: 'POSTED',
            reference: 'REF-9988',
            lines: [
              {
                id: 'line-1',
                accountId: 'bank-acc-1',
                debit: 25000,
                credit: 0,
                description: 'Client payment',
              },
            ],
          } as any,
          {
            id: 'jrn-2',
            entryNumber: 'JRN-002',
            date: '2026-09-11',
            description: 'Office internet subscription',
            status: 'POSTED',
            reference: 'EXP-101',
            lines: [
              {
                id: 'line-2',
                accountId: 'bank-acc-1',
                debit: 0,
                credit: 1500,
                description: 'Internet bill',
              },
            ],
          } as any,
        ]}
        currencySymbol="₹"
        onBackToOverview={vi.fn()}
        onImportStatement={vi.fn()}
        onReconcile={vi.fn()}
        onTransferFunds={vi.fn()}
        onRecordTransaction={vi.fn()}
        onOpenMatch={vi.fn()}
        onOpenCategorize={vi.fn()}
        onSelectTxDetails={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    // Verify 3 Zoho Summary Cards in Header
    expect(screen.getAllByText(/Amount in FirmBooks/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Amount in Bank/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Difference/i).length).toBeGreaterThan(0);

    // Verify Exact Zoho Statement Table Column Headers
    expect(screen.getByText('Date')).toBeDefined();
    expect(screen.getByText('Particulars / Description')).toBeDefined();
    expect(screen.getByText('Withdrawals (DR)')).toBeDefined();
    expect(screen.getByText('Deposits (CR)')).toBeDefined();
    expect(screen.getByText('Status')).toBeDefined();
    expect(screen.getByText('Actions')).toBeDefined();

    // A bank workspace is statement-first: posted GL lines must not masquerade as bank evidence.
    expect(screen.getByText(/Import a CSV or spreadsheet statement/i)).toBeDefined();
    expect(screen.queryByText('Client payment received via NEFT')).toBeNull();
    expect(screen.queryByText('Office internet subscription')).toBeNull();
  });

  it('renders BankTransactionsFeed with Zoho Books columns', () => {
    render(
      <BankTransactionsFeed
        activeAccount={mockAccount}
        accountTransactions={[
          {
            id: 'tx-1',
            date: '2026-09-12',
            ref: 'TX-001',
            description: 'Software subscription',
            type: 'CREDIT', // credit to bank = withdrawal
            amount: 5000,
            source: 'JOURNAL',
            status: 'Posted',
            accountId: 'bank-acc-1',
            accountName: 'HDFC Bank',
          },
          {
            id: 'tx-2',
            date: '2026-09-12',
            ref: 'TX-002',
            description: 'Customer payment',
            type: 'DEBIT', // debit to bank = deposit
            amount: 15000,
            source: 'JOURNAL',
            status: 'Posted',
            accountId: 'bank-acc-1',
            accountName: 'HDFC Bank',
          },
        ]}
        txSearch=""
        setTxSearch={vi.fn()}
        txFilter="ALL"
        setTxFilter={vi.fn()}
        currencySymbol="₹"
        onOpenReconcile={vi.fn()}
        onOpenImportStatement={vi.fn()}
        onOpenRecordTx={vi.fn()}
        onOpenTransfer={vi.fn()}
        onOpenTreasury={vi.fn()}
        onSelectTx={vi.fn()}
      />
    );

    // Verify Zoho Books Table Columns
    expect(screen.getByText('Date')).toBeDefined();
    expect(screen.getByText('Particulars / Description')).toBeDefined();
    expect(screen.getByText('Withdrawals (DR)')).toBeDefined();
    expect(screen.getByText('Deposits (CR)')).toBeDefined();
    expect(screen.getByText('Status')).toBeDefined();
    expect(screen.getByText('Details')).toBeDefined();
  });
});
