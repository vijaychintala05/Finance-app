// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup, within } from '@testing-library/react';
import { DashboardView } from '../components/dashboard/DashboardView';
import { apiClient } from '../api/client';

const dashboardMocks = vi.hoisted(() => ({ addTimeEntry: vi.fn(), getTimeEntryCreateOperationStatus: vi.fn() }));

vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    createIdempotencyKey: vi.fn(() => 'dashboard-operation-key-123456'),
    getTimeEntryCreateOperationStatus: vi.fn().mockResolvedValue({ data: { state: 'UNKNOWN' }, error: null, status: 200 }),
  },
}));

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    currentOrg: { id: 'org-dashboard' },
    settings: {
      currency: 'USD',
      currencySymbol: '$',
      fiscalYearStartMonth: 1,
    },
    invoices: [],
    expenses: [],
    bills: [],
    accounts: [],
    clients: [],
    vendors: [],
    projects: [],
    journalEntries: [],
    timeEntries: [],
    addTimeEntry: dashboardMocks.addTimeEntry,
    getTimeEntryCreateOperationStatus: dashboardMocks.getTimeEntryCreateOperationStatus,
  }),
  BooksProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('DashboardView & Cash Flow Real-Data QA Tests', () => {
  const mockOnNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    dashboardMocks.addTimeEntry.mockResolvedValue({ data: { id: 'time-dashboard' }, requestId: 'req-time-dashboard', refreshFailed: false });
    dashboardMocks.getTimeEntryCreateOperationStatus.mockResolvedValue({ data: { state: 'UNKNOWN' }, error: null, status: 200 });
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('restores a visible committed-stale receipt after remount', async () => {
    sessionStorage.setItem('firmbooks_committed_time_entry_receipt', JSON.stringify({ id: 'time-stale-receipt', requestId: 'req-stale-receipt', organizationId: 'org-dashboard' }));
    vi.mocked(apiClient.get).mockResolvedValue({ data: { dashboard: { availableViews: ['overview'], overview: { bankBalance: 0, bankReconciliationAttentionCount: 0, activityTrend: [], recentTransactions: [], collections: [], billsDue: [] }, commandCenter: { attention: [], insights: { bankAccounts: [], topExpenses: [] }, performance: { cashMovement: [] } }, view: 'overview', cashOperations: { available: false, bankReconciliationAttentionCount: null, oldestUnmatchedDate: null, collectionsDue7Days: 0, collectionsDue30Days: 0, billsDue7Days: 0, billsDue30Days: 0, forecast: { available: false, reason: '' } }, closeControls: { available: false, periodClose: null, integrity: null } } as any }, error: null, status: 200 });
    render(<DashboardView onNavigate={mockOnNavigate} />);
    const mobile = await screen.findByTestId('mobile-dashboard-overview');
    const receipt = await within(mobile).findByRole('status');
    expect(receipt.textContent).toContain('time-stale-receipt');
    expect(receipt.textContent).toContain('req-stale-receipt');
  });

  it('shows an accessible retry-safe timer error and preserves the elapsed session', async () => {
    dashboardMocks.getTimeEntryCreateOperationStatus.mockResolvedValue({ data: { state: 'UNKNOWN' }, error: null, status: 200 });
    dashboardMocks.addTimeEntry
      .mockRejectedValueOnce({ message: 'Network request failed', response: { status: 0, requestId: 'req-time-uncertain', retryable: true } })
      .mockResolvedValueOnce({ data: { id: 'time-dashboard-committed' }, requestId: 'req-time-committed', refreshFailed: true });
    localStorage.setItem('firmbooks_dashboard_timer', JSON.stringify({ projectId: '', taskName: 'Close books', startTime: Date.now() + 60000, elapsedSeconds: 3661, isRunning: true, workDate: '2026-09-23', organizationId: 'org-dashboard' }));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.mocked(apiClient.get).mockResolvedValue({ data: { dashboard: { availableViews: ['overview'], overview: { bankBalance: 0, bankReconciliationAttentionCount: 0, activityTrend: [], recentTransactions: [], collections: [], billsDue: [] }, commandCenter: { attention: [], insights: { bankAccounts: [], topExpenses: [] }, performance: { cashMovement: [] } }, view: 'overview', cashOperations: { available: false, bankReconciliationAttentionCount: null, oldestUnmatchedDate: null, collectionsDue7Days: 0, collectionsDue30Days: 0, billsDue7Days: 0, billsDue30Days: 0, forecast: { available: false, reason: '' } }, closeControls: { available: false, periodClose: null, integrity: null } } as any }, error: null, status: 200 });

    render(<DashboardView onNavigate={mockOnNavigate} />);
    const mobile = await screen.findByTestId('mobile-dashboard-overview');
    fireEvent.click(within(mobile).getByRole('button', { name: 'Stop Timer' }));
    fireEvent.click(within(mobile).getByRole('button', { name: 'Save Entry' }));

    const receipt = await within(mobile).findByRole('alert');
    expect(receipt.textContent).toContain('could not confirm whether this time entry was saved');
    expect(receipt.textContent).toContain('Check Time Logs before retrying');
    expect(receipt.textContent).toContain('req-time-uncertain');
    expect(within(mobile).getByText('01:01:01')).toBeTruthy();
    expect(within(mobile).getByRole('button', { name: 'Retry Same Save' })).toBeTruthy();
    expect((within(mobile).getByRole('button', { name: 'Resume' }) as HTMLButtonElement).disabled).toBe(true);
    expect(alertSpy).not.toHaveBeenCalled();
    const firstPayload = dashboardMocks.addTimeEntry.mock.calls[0];
    fireEvent.click(within(mobile).getByRole('button', { name: 'Retry Same Save' }));
    await waitFor(() => expect(within(mobile).getByRole('status').textContent).toContain('Time entry time-dashboard-committed was saved'));
    expect(dashboardMocks.addTimeEntry).toHaveBeenCalledTimes(2);
    expect(dashboardMocks.addTimeEntry.mock.calls[1]).toEqual(firstPayload);
    expect(within(mobile).getByText('00:00:00')).toBeTruthy();
    expect(within(mobile).getByRole('status').textContent).toContain('req-time-committed');
  });
  it('blocks replay of a malformed successful receipt until the user verifies Time Logs', async () => {
    dashboardMocks.addTimeEntry.mockRejectedValueOnce({ message: 'Missing entry ID', response: { status: 201, requestId: 'req-malformed-time', retryable: true } });
    localStorage.setItem('firmbooks_dashboard_timer', JSON.stringify({ projectId: '', taskName: 'Close books', startTime: null, elapsedSeconds: 1200, isRunning: false, workDate: '2026-09-23', organizationId: 'org-dashboard' }));
    vi.mocked(apiClient.get).mockResolvedValue({ data: { dashboard: { availableViews: ['overview'], overview: { bankBalance: 0, bankReconciliationAttentionCount: 0, activityTrend: [], recentTransactions: [], collections: [], billsDue: [] }, commandCenter: { attention: [], insights: { bankAccounts: [], topExpenses: [] }, performance: { cashMovement: [] } }, view: 'overview', cashOperations: { available: false, bankReconciliationAttentionCount: null, oldestUnmatchedDate: null, collectionsDue7Days: 0, collectionsDue30Days: 0, billsDue7Days: 0, billsDue30Days: 0, forecast: { available: false, reason: '' } }, closeControls: { available: false, periodClose: null, integrity: null } } as any }, error: null, status: 200 });
    render(<DashboardView onNavigate={mockOnNavigate} />);
    const mobile = await screen.findByTestId('mobile-dashboard-overview');
    fireEvent.click(within(mobile).getByRole('button', { name: 'Save Entry' }));
    expect(await within(mobile).findByRole('alert')).toBeTruthy();
    expect((within(mobile).getByRole('button', { name: 'Verify in Time Logs' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(mobile).getByRole('button', { name: 'Reset Timer' }) as HTMLButtonElement).disabled).toBe(false);
    const guard = JSON.parse(localStorage.getItem('firmbooks_dashboard_timer') || '{}');
    expect(guard).toMatchObject({ saveUncertain: true, retryBlocked: true, requestId: 'req-malformed-time', organizationId: 'org-dashboard', pendingPayload: expect.objectContaining({ taskName: 'Close books' }) });
    fireEvent.click(within(mobile).getByRole('button', { name: 'Reset Timer' }));
    expect(JSON.parse(localStorage.getItem('firmbooks_dashboard_timer') || '{}')).toMatchObject({ saveUncertain: true, retryBlocked: true, requestId: 'req-malformed-time', pendingPayload: expect.objectContaining({ taskName: 'Close books' }) });
    expect((within(mobile).getByRole('button', { name: 'Start Timer' }) as HTMLButtonElement).disabled).toBe(true);
    expect(dashboardMocks.addTimeEntry).toHaveBeenCalledTimes(1);
  });

  it('does not submit the timer when its operation receipt cannot be persisted', async () => {
    localStorage.setItem('firmbooks_dashboard_timer', JSON.stringify({ projectId: '', taskName: 'Close books', startTime: null, elapsedSeconds: 1200, isRunning: false, workDate: '2026-09-23', organizationId: 'org-dashboard' }));
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (this === window.sessionStorage && key === 'firmbooks_pending_time_entry_create') throw new Error('session storage unavailable');
      return originalSetItem.call(this, key, value);
    });
    vi.mocked(apiClient.get).mockResolvedValue({ data: { dashboard: { availableViews: ['overview'], overview: { bankBalance: 0, bankReconciliationAttentionCount: 0, activityTrend: [], recentTransactions: [], collections: [], billsDue: [] }, commandCenter: { attention: [], insights: { bankAccounts: [], topExpenses: [] }, performance: { cashMovement: [] } }, view: 'overview', cashOperations: { available: false, bankReconciliationAttentionCount: null, oldestUnmatchedDate: null, collectionsDue7Days: 0, collectionsDue30Days: 0, billsDue7Days: 0, billsDue30Days: 0, forecast: { available: false, reason: '' } }, closeControls: { available: false, periodClose: null, integrity: null } } as any }, error: null, status: 200 });
    render(<DashboardView onNavigate={mockOnNavigate} />);
    const mobile = await screen.findByTestId('mobile-dashboard-overview');
    fireEvent.click(within(mobile).getByRole('button', { name: 'Save Entry' }));
    expect(await within(mobile).findByText(/safe save receipt could not be stored/)).toBeTruthy();
    expect(dashboardMocks.addTimeEntry).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('firmbooks_pending_time_entry_create')).toBeNull();
    expect(within(mobile).getByText('00:20:00')).toBeTruthy();
  });

  it('blocks dashboard time creation when a manual-entry attempt is unresolved', async () => {
    sessionStorage.setItem('firmbooks_pending_time_entry_create', JSON.stringify({
      payload: { projectId: 'project-1', taskName: 'Reconcile bank', date: '2026-09-23', hours: 1 },
      organizationId: 'org-dashboard', status: 'retryable',
    }));
    localStorage.setItem('firmbooks_dashboard_timer', JSON.stringify({ projectId: '', taskName: 'Close books', startTime: null, elapsedSeconds: 1200, isRunning: false, workDate: '2026-09-23', organizationId: 'org-dashboard' }));
    vi.mocked(apiClient.get).mockResolvedValue({ data: { dashboard: { availableViews: ['overview'], overview: { bankBalance: 0, bankReconciliationAttentionCount: 0, activityTrend: [], recentTransactions: [], collections: [], billsDue: [] }, commandCenter: { attention: [], insights: { bankAccounts: [], topExpenses: [] }, performance: { cashMovement: [] } }, view: 'overview', cashOperations: { available: false, bankReconciliationAttentionCount: null, oldestUnmatchedDate: null, collectionsDue7Days: 0, collectionsDue30Days: 0, billsDue7Days: 0, billsDue30Days: 0, forecast: { available: false, reason: '' } }, closeControls: { available: false, periodClose: null, integrity: null } } as any }, error: null, status: 200 });
    render(<DashboardView onNavigate={mockOnNavigate} />);
    const mobile = await screen.findByTestId('mobile-dashboard-overview');
    expect(await within(mobile).findByRole('alert')).toBeTruthy();
    expect((within(mobile).getByRole('button', { name: 'Verify in Time Logs' }) as HTMLButtonElement).disabled).toBe(true);
    expect(dashboardMocks.addTimeEntry).not.toHaveBeenCalled();
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
      cashFlow: {
        movements: [
          { date: '2026-09-01', cashIn: 80000, cashOut: 20000, net: 60000 },
          { date: '2026-09-02', cashIn: 40000, cashOut: 25000, net: 15000 },
        ],
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
      cashFlow: {
        movements: [],
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
      cashFlow: {
        movements: [
          { date: '2026-09-15', cashIn: 80000, cashOut: 20000, net: 60000 },
        ],
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
      expect(within(screen.getByTestId('mobile-dashboard-overview')).getByText(/Needs Attention/i)).toBeTruthy();
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
