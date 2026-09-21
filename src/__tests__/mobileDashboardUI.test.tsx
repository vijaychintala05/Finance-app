// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { DashboardView } from '../components/dashboard/DashboardView';
import { MobileBottomNav } from '../components/layout/MobileBottomNav';
import { Header } from '../components/layout/Header';
import { apiClient } from '../api/client';

vi.mock('../api/client', () => {
  class MockApiClient {
    get = vi.fn();
    post = vi.fn();
  }
  return {
    ApiClient: MockApiClient,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    settings: {
      currency: 'INR',
      currencySymbol: '₹',
      fiscalYearStartMonth: 4,
    },
    currentOrg: {
      id: 'org-1',
      name: 'Sense studios design',
      orgCode: 'SENSE',
      publicOrgId: 'SENSE-001',
    },
    currentUser: {
      id: 'usr-1',
      fullName: 'Vijay Chintala',
      email: 'vijay@sensestudios.com',
    },
    invoices: [],
    expenses: [
      { id: 'exp-1', description: 'Office Supplies', amount: 450, isBillable: true, isBilled: false },
    ],
    bills: [],
    accounts: [
      { id: 'acc-1', name: 'Main Checking', type: 'Bank', currentBalance: 550000 },
      { id: 'acc-2', name: 'Petty Cash', type: 'Cash', currentBalance: 25000 },
    ],
    clients: [],
    vendors: [],
    journalEntries: [],
    timeEntries: [
      { id: 't-1', hours: 4.5, isBillable: true, isBilled: false },
    ],
  }),
  BooksProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../context/AuthContext', () => ({
  useOptionalAuth: () => ({
    user: { fullName: 'Vijay Chintala', email: 'vijay@sensestudios.com' },
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

describe('Mobile Dashboard UI (Light Mode) Test Suite', () => {
  const mockOnNavigate = vi.fn();
  const mockOnOpenMore = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const mockDashboardData = {
    overview: {
      receivables: 1347270,
      overdueReceivables: 200000,
      outstandingInvoicesCount: 15,
      overdueInvoicesCount: 11,
      payables: 20700,
      dueBillsCount: 5,
      overduePayables: 5000,
      overdueBillsCount: 2,
      bankBalance: 550000,
      salesThisMonth: 1347270,
      expensesThisMonth: 20700,
      activityTrend: [
        { date: '2026-09-01', income: 800000, expenses: 10000 },
        { date: '2026-09-02', income: 547270, expenses: 10700 },
      ],
      bankReconciliationAttentionCount: 177,
      quotationsAwaitingResponseCount: 0,
      pendingJournalsCount: 0,
      collections: [],
      billsDue: [],
      recentTransactions: [],
    },
    cashFlow: {
      // These deliberately differ from accrual income/expense activity. The
      // mobile Cash view must use these posted cash-account movements exactly.
      movements: [
        { date: '2026-09-01', cashIn: 1250, cashOut: 350, net: 900 },
        { date: '2026-09-02', cashIn: 500, cashOut: 200, net: 300 },
      ],
    },
    commandCenter: {
      period: { start: '2026-04-01', end: '2026-09-16', label: 'FY 2026-27' },
      financialPosition: { cashAtBank: 550000, toCollect: 1347270, toPay: 20700 },
      performance: { revenue: 1347270, expenses: 20700, net: 1326570, marginPercent: 98.4, cashMovement: [] },
      scheduledCashOutlook: { windowDays: 30, collections: 1347270, bills: 20700, net: 1326570 },
      attention: [
        { id: 'overdue-receivables', severity: 'critical', label: 'Overdue customer invoices', count: 11, amount: 200000, destination: 'invoices' },
        { id: 'overdue-payables', severity: 'critical', label: 'Overdue vendor bills', count: 2, amount: 5000, destination: 'bills' },
      ],
      insights: { topExpenses: [{ name: 'Studio Rent', amount: 15000 }], bankAccounts: [] },
    },
    asOfDate: '2026-09-16',
    generatedAt: '2026-09-16T10:00:00Z',
    availableViews: ['overview', 'cash-operations', 'close-controls'],
    view: 'overview',
  };

  it('1. Renders Primary Overview Cards (Total Receivables, Total Payables, Overdue Invoices & Bills)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockDashboardData as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    const mobile = await screen.findByTestId('mobile-dashboard-overview');
    expect(within(mobile).getByText('Total Receivables')).toBeTruthy();
    expect(within(mobile).getByText('Total Payables')).toBeTruthy();
    expect(within(mobile).getByText('Overdue Invoices')).toBeTruthy();
    expect(within(mobile).getByText('Overdue Bills')).toBeTruthy();
    expect(within(mobile).getByText('11')).toBeTruthy();
    expect(within(mobile).getByText('2')).toBeTruthy();
    const receivablesAmount = within(mobile).getByText('₹13,47,270.00');
    expect(receivablesAmount.className).not.toContain('truncate');
    expect(within(mobile).queryByText('₹1,347,270.00')).toBeNull();

    // Click Overdue Invoices card
    fireEvent.click(within(mobile).getByText('Overdue Invoices'));
    expect(mockOnNavigate).toHaveBeenCalledWith('invoices');

    // Click Overdue Bills card
    fireEvent.click(within(mobile).getByText('Overdue Bills'));
    expect(mockOnNavigate).toHaveBeenCalledWith('bills');
  });

  it('2. Quick Create section provides Customer, Expense, Quote, and Invoices actions', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockDashboardData as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    const mobile = await screen.findByTestId('mobile-dashboard-overview');
    expect(within(mobile).getByText('Quick Create')).toBeTruthy();
    expect(within(mobile).getByText('Customer')).toBeTruthy();
    expect(within(mobile).getByText('Expense')).toBeTruthy();
    expect(within(mobile).getByText('Quote')).toBeTruthy();
    expect(within(mobile).getByText('Invoices')).toBeTruthy();

    // Invoices navigates to invoices
    fireEvent.click(within(mobile).getByText('Invoices'));
    expect(mockOnNavigate).toHaveBeenCalledWith('invoices');
  });

  it('3. Cash Flow uses posted cash-account movements by default, without fabricated cash-basis adjustments', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockDashboardData as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    const mobile = await screen.findByTestId('mobile-dashboard-overview');
    expect(within(mobile).getByText('Cash Flow')).toBeTruthy();
    expect(within(mobile).getByText('Accrual')).toBeTruthy();
    expect(within(mobile).getByText('Cash')).toBeTruthy();
    expect(within(mobile).getByText('Cash In')).toBeTruthy();
    expect(within(mobile).getByText('Cash Out')).toBeTruthy();
    expect(within(mobile).getByText('Net Cash')).toBeTruthy();
    expect(within(mobile).getByText('₹1,750.00')).toBeTruthy();
    expect(within(mobile).getByText('₹550.00')).toBeTruthy();
    expect(within(mobile).getByText('₹1,200.00')).toBeTruthy();
    // The chart scale follows the returned cash ledger values; it must not
    // display the old fixed ₹75K/₹50K/₹25K visual-only scale.
    expect(within(mobile).queryByText('75K')).toBeNull();
    expect(within(mobile).queryByText('50K')).toBeNull();

    // Accrual remains an explicit P&L activity view; returning to cash must
    // restore the exact GL-derived cash totals, not a percentage estimate.
    fireEvent.click(within(mobile).getByText('Accrual'));
    expect(within(mobile).getByText('Net Profit')).toBeTruthy();
    fireEvent.click(within(mobile).getByText('Cash'));
    expect(within(mobile).getByText('₹1,200.00')).toBeTruthy();
  });

  it('3a. Cash Flow period control requests the selected fiscal-year ledger range', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockDashboardData as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);
    const mobile = await screen.findByTestId('mobile-dashboard-overview');

    const [cashFlowPeriod] = within(mobile).getAllByRole('combobox');
    fireEvent.change(cashFlowPeriod, { target: { value: 'quarter' } });
    await waitFor(() => expect(vi.mocked(apiClient.get).mock.calls.at(-1)?.[0]).toContain('periodPreset=qtd'));

    fireEvent.change(cashFlowPeriod, { target: { value: 'fiscal' } });
    await waitFor(() => {
      expect(vi.mocked(apiClient.get).mock.calls.at(-1)?.[0]).toContain('periodPreset=custom');
      expect(vi.mocked(apiClient.get).mock.calls.at(-1)?.[0]).toContain('startDate=2026-04-01');
    });
  });

  it('4. Project Timer & Unbilled items widget renders time tracker and unbilled summaries', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockDashboardData as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    const mobile = await screen.findByTestId('mobile-dashboard-overview');
    expect(within(mobile).getByText('00:00:00')).toBeTruthy();
    expect(within(mobile).getByText('Start Project Timer')).toBeTruthy();
    expect(within(mobile).getByText('Log Time')).toBeTruthy();
    expect(within(mobile).getByText('Start Timer')).toBeTruthy();

    // Toggle timer
    fireEvent.click(within(mobile).getByText('Start Timer'));
    expect(within(mobile).getByText('Stop Timer')).toBeTruthy();
    expect(within(mobile).getByText('Timer Active • Tracking Session')).toBeTruthy();

    // Unbilled items
    expect(within(mobile).getByText('Unbilled Hours')).toBeTruthy();
    expect(within(mobile).getByText('4:30 Hrs')).toBeTruthy();
    expect(within(mobile).getByText('Unbilled Expenses')).toBeTruthy();
  });

  it('5. Top Expenses & Banking Summary widgets display balances and navigation', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockDashboardData as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    const mobile = await screen.findByTestId('mobile-dashboard-overview');
    expect(within(mobile).getByText('Top Expenses')).toBeTruthy();
    expect(within(mobile).getByText('Studio Rent')).toBeTruthy();
    expect(within(mobile).getByText('Banking Summary')).toBeTruthy();
    expect(within(mobile).getByText('Uncategorised Transactions')).toBeTruthy();
    expect(within(mobile).getByText('177')).toBeTruthy();
    expect(within(mobile).getByText('Bank Balance')).toBeTruthy();
    expect(within(mobile).getByText('Cash In Hand')).toBeTruthy();
  });

  it('6. Floating MobileBottomNav renders Home, Customers, Invoices, Expenses, More', () => {
    render(
      <MobileBottomNav
        activeTab="dashboard"
        onNavigate={mockOnNavigate}
        onOpenMore={mockOnOpenMore}
      />
    );

    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Customers')).toBeTruthy();
    expect(screen.getByText('Invoices')).toBeTruthy();
    expect(screen.getByText('Expenses')).toBeTruthy();
    expect(screen.getByText('More')).toBeTruthy();
  });

  it('7. Mobile Header renders Org Switcher, Bell, and Subheader tabs (Dashboard, Announcements, Help)', () => {
    render(
      <Header
        currentTab="dashboard"
        onNavigate={mockOnNavigate}
        onOpenOrgSwitcher={vi.fn()}
      />
    );

    expect(screen.getByText('Sense studios design')).toBeTruthy();
    expect(screen.getByTitle('Notifications')).toBeTruthy();
    expect(screen.getByText('Announcements')).toBeTruthy();
    expect(screen.getByText('Help')).toBeTruthy();
  });
});
