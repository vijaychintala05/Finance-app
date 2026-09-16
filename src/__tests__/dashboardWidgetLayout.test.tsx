// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { DashboardView } from '../components/dashboard/DashboardView';
import { apiClient } from '../api/client';

vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    settings: {
      currency: 'USD',
      currencySymbol: '$',
      fiscalYearStartMonth: 1,
    },
    invoices: [],
    expenses: [],
    bills: [],
    accounts: [
      { id: 'acc-1', name: 'Chase Operating', balance: 50000, type: 'Bank' },
      { id: 'acc-2', name: 'Petty Cash', balance: 2500, type: 'Cash' },
    ],
    clients: [],
    vendors: [],
    journalEntries: [],
  }),
  BooksProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('Dashboard Grid Layout Reorganization Test Suite', () => {
  const mockOnNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const mockData = {
    overview: {
      receivables: 75000,
      overdueReceivables: 15000,
      outstandingInvoicesCount: 5,
      overdueInvoicesCount: 1,
      payables: 32000,
      dueBillsCount: 3,
      overduePayables: 5000,
      overdueBillsCount: 1,
      bankBalance: 52500,
      salesThisMonth: 80000,
      expensesThisMonth: 30000,
      activityTrend: [
        { date: '2026-09-01', income: 45000, expenses: 15000 },
        { date: '2026-09-02', income: 35000, expenses: 15000 },
      ],
      bankReconciliationAttentionCount: 0,
      quotationsAwaitingResponseCount: 0,
      pendingJournalsCount: null,
      collections: [{ partyName: 'Acme Corp', amount: 15000, overdue: true, dueDate: '2026-09-10' }],
      billsDue: [{ partyName: 'AWS Hosting', amount: 5000, overdue: true, dueDate: '2026-09-12' }],
      recentTransactions: [
        { type: 'Invoice', documentNumber: 'INV-101', partyName: 'Acme Corp', amount: 15000, status: 'Sent', date: '2026-09-10' },
      ],
    },
    commandCenter: {
      period: { start: '2026-09-01', end: '2026-09-30', label: 'September 2026' },
      financialPosition: { cashAtBank: 52500, toCollect: 75000, toPay: 32000 },
      performance: { revenue: 80000, expenses: 30000, net: 50000, marginPercent: 62.5, cashMovement: [] },
      scheduledCashOutlook: { windowDays: 30, collections: 75000, bills: 32000, net: 43000 },
      attention: [
        { id: 'att-1', severity: 'critical', label: 'Overdue customer invoices', count: 1, amount: 15000, destination: 'invoices' },
      ],
      insights: {
        topExpenses: [{ name: 'Technology', amount: 12000 }, { name: 'Rent', amount: 8000 }],
        bankAccounts: [{ name: 'Chase Operating', balance: 50000 }],
      },
    },
    asOfDate: '2026-09-16',
    generatedAt: '2026-09-16T10:00:00Z',
    availableViews: ['overview', 'cash-operations', 'close-controls'],
    view: 'overview',
  };

  it('1. Line 1 renders Total Payables, Total Receivables, and Quick Actions', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockData as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('Total Payables')).toBeTruthy();
      expect(screen.getByText('Total Receivables')).toBeTruthy();
      expect(screen.getByText('Quick Action Dock')).toBeTruthy();
    });

    // Check KPI values in Line 1
    expect(screen.getAllByText('$32,000.00').length).toBeGreaterThanOrEqual(1); // Payables
    expect(screen.getAllByText('$75,000.00').length).toBeGreaterThanOrEqual(1); // Receivables
  });

  it('2. Line 2 renders Cash Flow widget and Top Expenses widget', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockData as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    await waitFor(() => {
      expect(screen.getAllByText(/Cash Flow/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Top Expense Categories')).toBeTruthy();
    });

    // Check Top Expenses items
    expect(screen.getByText('Technology')).toBeTruthy();
    expect(screen.getByText('Rent')).toBeTruthy();
  });

  it('3. Line 3 renders Banking Balances and Cash & Financial Position', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockData as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('Banking Balances')).toBeTruthy();
      expect(screen.getByText('Cash & Financial Position')).toBeTruthy();
    });

    // Check Bank balance
    expect(screen.getAllByText('$52,500.00').length).toBeGreaterThanOrEqual(1);
  });

  it('4. Line 4 renders Needs Attention and Recent Activity', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockData as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('Needs Attention')).toBeTruthy();
      expect(screen.getByText('Recent Activity')).toBeTruthy();
    });

    expect(screen.getByText('Overdue customer invoices')).toBeTruthy();
    expect(screen.getByText('INV-101')).toBeTruthy();
  });
});
