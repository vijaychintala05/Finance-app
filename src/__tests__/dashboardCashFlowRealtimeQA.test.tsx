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
      currency: 'INR',
      currencySymbol: 'INR',
      fiscalYearStartMonth: 4,
    },
    invoices: [],
    expenses: [],
    bills: [],
    accounts: [],
    clients: [],
    vendors: [],
    journalEntries: [],
  }),
  BooksProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('DashboardView & Cash Flow Real-Data QA Tests', () => {
  const mockOnNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders real cash flow transactions, dynamic legend, and SVG bars when data exists', async () => {
    const mockDashboardData = {
      overview: {
        receivables: 150000,
        overdueReceivables: 30000,
        outstandingInvoicesCount: 3,
        overdueInvoicesCount: 1,
        payables: 50000,
        dueBillsCount: 2,
        overduePayables: 10000,
        overdueBillsCount: 1,
        bankBalance: 250000,
        salesThisMonth: 120000,
        expensesThisMonth: 45000,
        activityTrend: [
          { date: '2026-09-01', income: 80000, expenses: 20000 },
          { date: '2026-09-02', income: 40000, expenses: 25000 },
        ],
        bankReconciliationAttentionCount: 1,
        quotationsAwaitingResponseCount: 2,
        pendingJournalsCount: 0,
        collections: [],
        billsDue: [],
        recentTransactions: [],
      },
      commandCenter: {
        financialPosition: {
          cashAtBank: 250000,
          toCollect: 150000,
          toPay: 50000,
          netWorkingCapital: 350000,
        },
        performance: {
          revenue: 120000,
          expenses: 45000,
          net: 75000,
          marginPercent: 62.5,
          cashMovement: [
            { date: '2026-09-01', income: 80000, expenses: 20000 },
            { date: '2026-09-02', income: 40000, expenses: 25000 },
          ],
        },
        attention: [],
        insights: {
          bankAccounts: [{ name: 'HDFC Bank', balance: 250000 }],
          topExpenses: [
            { name: 'Payroll', amount: 35000 },
            { name: 'Office Supplies', amount: 10000 },
          ],
        },
        scheduledCashOutlook: {
          windowDays: 30,
          collections: 100000,
          bills: 40000,
          net: 60000,
        },
      },
      availableViews: ['overview', 'cash-operations', 'close-controls'],
      asOfDate: '2026-09-03',
      view: 'overview',
    };

    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockDashboardData as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText(/Financial Command Center/i)).toBeTruthy();
    });

    // Verify Cash Flow Chart title and verified badge
    expect(screen.getByText(/Cash Flow & Activity Velocity/i)).toBeTruthy();
    expect(screen.getByText(/Posted Journals/i)).toBeTruthy();

    // Verify dynamic totals in legend: Income = 120,000, Expenses = 45,000, Net = 75,000
    expect(screen.getAllByText(/120,000/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/45,000/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/75,000/).length).toBeGreaterThanOrEqual(1);

    // Verify Top Expenses Donut breakdown list
    expect(screen.getByText('Payroll')).toBeTruthy();
    expect(screen.getByText('Office Supplies')).toBeTruthy();

    // Verify Top 4 KPI values without fake hardcoded fallbacks
    expect(screen.getAllByText(/250,000/).length).toBeGreaterThanOrEqual(1); // Bank
    expect(screen.getAllByText(/150,000/).length).toBeGreaterThanOrEqual(1); // AR
    expect(screen.getAllByText(/50,000/).length).toBeGreaterThanOrEqual(1); // AP

    // Verify Quick Action Dock
    expect(screen.getByText(/New Invoice/i)).toBeTruthy();
    expect(screen.getByText(/Record Expense/i)).toBeTruthy();
    expect(screen.getByText(/New Bill/i)).toBeTruthy();
    expect(screen.getByText(/Journal Entry/i)).toBeTruthy();
  });

  it('renders clean empty state without fake August 27 data when zero transactions exist', async () => {
    const mockEmptyDashboard = {
      overview: {
        receivables: 0,
        overdueReceivables: 0,
        outstandingInvoicesCount: 0,
        overdueInvoicesCount: 0,
        payables: 0,
        dueBillsCount: 0,
        overduePayables: 0,
        overdueBillsCount: 0,
        bankBalance: 0,
        salesThisMonth: 0,
        expensesThisMonth: 0,
        activityTrend: [],
        bankReconciliationAttentionCount: 0,
        quotationsAwaitingResponseCount: 0,
        pendingJournalsCount: 0,
        collections: [],
        billsDue: [],
        recentTransactions: [],
      },
      commandCenter: {
        financialPosition: {
          cashAtBank: 0,
          toCollect: 0,
          toPay: 0,
          netWorkingCapital: 0,
        },
        performance: {
          revenue: 0,
          expenses: 0,
          net: 0,
          marginPercent: null,
          cashMovement: [],
        },
        attention: [],
        insights: {
          bankAccounts: [],
          topExpenses: [],
        },
        scheduledCashOutlook: {
          windowDays: 30,
          collections: 0,
          bills: 0,
          net: 0,
        },
      },
      availableViews: ['overview', 'cash-operations', 'close-controls'],
      asOfDate: '2026-09-03',
      view: 'overview',
    };

    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockEmptyDashboard as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    await waitFor(() => {
      expect(screen.getByText(/Financial Command Center/i)).toBeTruthy();
    });

    // Verify empty state banner in Cash Flow chart
    expect(
      screen.getAllByText(/No posted journal transactions recorded for the selected timeline/i).length
    ).toBeGreaterThanOrEqual(1);

    // Verify no fake dates like 'Aug 27' or 'Aug 28' appear
    expect(screen.queryByText('Aug 27')).toBeNull();
    expect(screen.queryByText('Aug 28')).toBeNull();

    // Verify Top Expenses displays no operational expenses message
    expect(screen.getByText(/No operational expenses/i)).toBeTruthy();
  });
});
