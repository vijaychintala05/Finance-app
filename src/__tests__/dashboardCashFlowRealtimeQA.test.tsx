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
    expect(screen.getAllByText(/Cash Flow/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Income & Expense Activity/i)).toBeTruthy();
    expect(screen.getAllByText(/Posted Journals/i).length).toBeGreaterThanOrEqual(1);

    // Verify dynamic totals in legend: Income = 120,000, Expenses = 45,000, Net = 75,000
    expect(screen.getAllByText(/120,000/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/45,000/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/75,000/).length).toBeGreaterThanOrEqual(1);

    // Verify Top Expenses Donut breakdown list
    expect(screen.getAllByText('Payroll').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Office Supplies').length).toBeGreaterThanOrEqual(1);

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

    // Verify quiet completion state for attention queue
    expect(screen.getByText(/Nothing needs action from the available records/i)).toBeTruthy();
    expect(screen.queryByText(/ACTION REQUIRED/i)).toBeNull();
  });

  it('renders ranked actionable attention items at the top and single-date summary when one date exists', async () => {
    const mockDashboardWithAttention = {
      overview: {
        receivables: 80000,
        overdueReceivables: 25000,
        outstandingInvoicesCount: 2,
        overdueInvoicesCount: 1,
        payables: 30000,
        dueBillsCount: 1,
        overduePayables: 0,
        overdueBillsCount: 0,
        bankBalance: 120000,
        salesThisMonth: 80000,
        expensesThisMonth: 20000,
        activityTrend: [
          { date: '2026-09-15', income: 80000, expenses: 20000 },
        ],
        bankReconciliationAttentionCount: 1,
        quotationsAwaitingResponseCount: 0,
        pendingJournalsCount: 0,
        collections: [{ partyName: 'Acme Corp', amount: 25000, overdue: true, dueDate: '2026-09-01' }],
        billsDue: [{ partyName: 'Cloud Services', amount: 30000, overdue: false, dueDate: '2026-09-20' }],
        recentTransactions: [],
      },
      commandCenter: {
        period: { start: '2026-09-01', end: '2026-09-16', label: 'Month to date (2026-09)' },
        financialPosition: {
          cashAtBank: 120000,
          toCollect: 80000,
          toPay: 30000,
        },
        performance: {
          revenue: 80000,
          expenses: 20000,
          net: 60000,
          marginPercent: 75,
          cashMovement: [
            { date: '2026-09-15', income: 80000, expenses: 20000 },
          ],
        },
        attention: [
          { id: 'overdue-receivables', severity: 'critical', label: 'Overdue customer invoices', count: 1, amount: 25000, destination: 'invoices' },
          { id: 'bank-reconciliation', severity: 'due-soon', label: 'Unreconciled bank transactions', count: 1, amount: null, destination: 'bank_reconciliation' },
        ],
        insights: {
          bankAccounts: [{ name: 'SVB Operating', balance: 120000 }],
          topExpenses: [{ name: 'Cloud Hosting', amount: 20000 }],
        },
        scheduledCashOutlook: {
          windowDays: 30,
          collections: 80000,
          bills: 30000,
          net: 50000,
        },
      },
      availableViews: ['overview', 'cash-operations', 'close-controls'],
      asOfDate: '2026-09-16',
      view: 'overview',
    };

    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockDashboardWithAttention as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    await waitFor(() => {
      expect(screen.getByText(/Needs Attention/i)).toBeTruthy();
    });

    // Verify attention items are rendered
    expect(screen.getAllByText(/Overdue customer invoices/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Unreconciled bank transactions/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Take Action/i).length).toBe(2);

    // Verify Receivables and Payables due next sections
    expect(screen.getByText(/Receivables Due Next/i)).toBeTruthy();
    expect(screen.getByText('Acme Corp')).toBeTruthy();
    expect(screen.getByText(/Payables Due Next/i)).toBeTruthy();
    expect(screen.getByText('Cloud Services')).toBeTruthy();

    // Verify Single-date summary state for 1 timeline point
    expect(screen.getByText(/Single-date summary/i)).toBeTruthy();
  });
});
