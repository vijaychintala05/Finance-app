// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import { DashboardView } from '../components/dashboard/DashboardView';
import { CashFlowWidget } from '../components/dashboard/widgets/CashFlowWidget';
import { apiClient } from '../api/client';

vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    createIdempotencyKey: vi.fn(() => 'dashboard-operation-key-123456'),
    getTimeEntryCreateOperationStatus: vi.fn().mockResolvedValue({ data: { state: 'UNKNOWN' }, error: null, status: 200 }),
  },
}));

const mockAccounts: any[] = [];
const mockAddTimeEntry = vi.fn().mockResolvedValue({ data: { id: 'time-created' }, requestId: 'req-time-created', refreshFailed: false });
const mockGetTimeEntryCreateOperationStatus = vi.fn().mockResolvedValue({ data: { state: 'UNKNOWN' }, error: null, status: 200 });

const mockProjects = [
  {
    id: 'proj-alpha',
    name: 'Website Redesign',
    clientName: 'Acme Corp',
    hourlyRate: 85,
    status: 'ACTIVE',
  },
  {
    id: 'proj-beta',
    name: 'Mobile App Audit',
    clientName: 'Beta LLC',
    hourlyRate: 120,
    status: 'ACTIVE',
  },
];

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
    accounts: mockAccounts,
    clients: [],
    vendors: [],
    projects: mockProjects,
    journalEntries: [],
    timeEntries: [],
    addTimeEntry: mockAddTimeEntry,
    getTimeEntryCreateOperationStatus: mockGetTimeEntryCreateOperationStatus,
  }),
  BooksProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('Dashboard Real Data Integration & Regression Suite', () => {
  const mockOnNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAccounts.splice(0, mockAccounts.length);
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const baseDashboardFixture = {
    overview: {
      receivables: 10000,
      overdueReceivables: 0,
      outstandingInvoicesCount: 1,
      overdueInvoicesCount: 0,
      payables: 5000,
      dueBillsCount: 1,
      overduePayables: 0,
      overdueBillsCount: 0,
      bankBalance: 25000,
      salesThisMonth: 8000,
      expensesThisMonth: 3000,
      activityTrend: [],
      bankReconciliationAttentionCount: 0,
      quotationsAwaitingResponseCount: 0,
      pendingJournalsCount: 0,
      collections: [],
      billsDue: [],
      recentTransactions: [],
      unbilledHours: 14.5,
      unbilledExpenses: 2850,
    },
    cashFlow: {
      movements: [
        // Two separate March movements across different years:
        { date: '2025-03-10', cashIn: 5000, cashOut: 2000, net: 3000 },
        { date: '2026-03-15', cashIn: 9000, cashOut: 4000, net: 5000 },
        // September 2026 movements:
        { date: '2026-09-01', cashIn: 12000, cashOut: 3000, net: 9000 },
        { date: '2026-09-10', cashIn: 8000, cashOut: 2000, net: 6000 },
      ],
    },
    commandCenter: {
      period: { start: '2026-09-01', end: '2026-09-30', label: 'September 2026' },
      financialPosition: {
        cashAtBank: 25000,
        toCollect: 10000,
        toPay: 5000,
        netWorkingCapital: 30000,
      },
      performance: {
        revenue: 20000,
        expenses: 5000,
        net: 15000,
        marginPercent: 75,
        cashMovement: [],
      },
      attention: [],
      insights: {
        bankAccounts: [{ name: 'Operating Account', balance: 25000 }],
        topExpenses: [{ name: 'Software', amount: 1500 }],
      },
      scheduledCashOutlook: {
        windowDays: 30,
        collections: 10000,
        bills: 5000,
        net: 5000,
      },
    },
    availableViews: ['overview', 'cash-operations', 'close-controls'],
    asOfDate: '2026-09-20',
    view: 'overview',
  };

  it('renders authoritative unbilled hours and expenses directly from backend overview', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: baseDashboardFixture as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    await waitFor(() => {
      expect(screen.getByText(/Financial Command Center/i)).toBeTruthy();
    });

    // Authoritative unbilled hours: 14.5 hrs => "14:30 Hrs"
    expect(screen.getAllByText(/14:30 Hrs/i).length).toBeGreaterThanOrEqual(1);

    // Authoritative unbilled expenses: 2850 => "$2,850.00"
    expect(screen.getAllByText(/\$2,850\.00/i).length).toBeGreaterThanOrEqual(1);
  });

  it('uses the server liquid cash and bank balance instead of client balances or account-name guesses', async () => {
    mockAccounts.push(
      { id: 'cash-client', type: 'Cash', name: 'Petty Cash', currentBalance: 99999 },
      { id: 'asset-bank', type: 'Asset', subType: 'Bank', name: 'Cash Clearing Bank', currentBalance: 77777 },
    );
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: baseDashboardFixture as any }, error: null, status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);
    const mobile = within(await screen.findByTestId('mobile-dashboard-overview'));
    expect(mobile.getByText('Liquid Cash & Bank')).toBeTruthy();
    expect(mobile.getByText('Posted ledger balance · As of 2026-09-20')).toBeTruthy();
    expect(mobile.getAllByText('$25,000.00').length).toBeGreaterThanOrEqual(1);
    expect(mobile.queryByText('Cash In Hand')).toBeNull();
    expect(mobile.queryByText('$99,999.00')).toBeNull();
    expect(mobile.queryByText('$77,777.00')).toBeNull();
    const openBanking = mobile.getByRole('button', { name: 'Open banking accounts' });
    fireEvent.click(openBanking);
    expect(mockOnNavigate).toHaveBeenCalledWith('banking');
  });

  it('mobile cash flow calculates period mini metrics strictly for the selected month and prevents cross-year month collision', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: baseDashboardFixture as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    const mobileOverview = await screen.findByTestId('mobile-dashboard-overview');
    expect(mobileOverview).toBeTruthy();

    // Default mobileCashFlowPeriod is 'month' (September 2026)
    // September movements: In = 12000 + 8000 = 20000; Out = 3000 + 2000 = 5000; Net = 15000
    // If it was incorrectly summing the full window, In would be 34,000!
    const mobileSection = within(mobileOverview);
    
    // Check that Cash In displays $20,000.00 for This Month
    expect(mobileSection.getAllByText(/\$20,000\.00/).length).toBeGreaterThanOrEqual(1);
    // Cash Out displays $5,000.00
    expect(mobileSection.getAllByText(/\$5,000\.00/).length).toBeGreaterThanOrEqual(1);
    // Net Cash displays $15,000.00
    expect(mobileSection.getAllByText(/\$15,000\.00/).length).toBeGreaterThanOrEqual(1);
  });

  it('project timer restores state from localStorage, allows selecting project, and logs time to backend', async () => {
    // Pre-populate localStorage with an active session
    localStorage.setItem(
      'firmbooks_dashboard_timer',
      JSON.stringify({
        projectId: 'proj-alpha',
        taskName: 'Client review session',
        startTime: Date.now() - 3600 * 1000, // 1 hour ago
        elapsedSeconds: 3600,
        isRunning: false,
      })
    );

    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: baseDashboardFixture as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    const mobileOverview = await screen.findByTestId('mobile-dashboard-overview');
    const mobileSection = within(mobileOverview);

    // Formatted timer: 3600 seconds = 01:00:00
    expect(mobileSection.getByText('01:00:00')).toBeTruthy();

    // Project selection dropdown should have proj-alpha selected
    const projectSelect = mobileSection.getByDisplayValue(/Website Redesign/i) as HTMLSelectElement;
    expect(projectSelect).toBeTruthy();

    // Task name input should be prefilled
    const taskInput = mobileSection.getByDisplayValue('Client review session') as HTMLInputElement;
    expect(taskInput).toBeTruthy();

    // "Save Entry" button is visible because timerSeconds > 0
    const saveButton = mobileSection.getByRole('button', { name: /Save Entry/i });
    expect(saveButton).toBeTruthy();

    // Click Save Entry
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockAddTimeEntry).toHaveBeenCalledTimes(1);
    });

    // Check payload passed to addTimeEntry
    expect(mockAddTimeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-alpha',
        projectName: 'Website Redesign',
        clientName: 'Acme Corp',
        taskName: 'Client review session',
        hours: 1,
        hourlyRate: 85,
        isBillable: true,
        isBilled: false,
      }),
      'org-dashboard',
      'dashboard-operation-key-123456'
    );

    // Timer should be reset to 00:00:00 after save
    await waitFor(() => {
      expect(mobileSection.getByText('00:00:00')).toBeTruthy();
    });

    // Saved localStorage session should be cleared
    expect(localStorage.getItem('firmbooks_dashboard_timer')).toBeNull();
  });

  it('CashFlowWidget anchors timeline calculations on asOfDate and synchronizes with external preset', () => {
    const movements = [
      { date: '2025-06-10', rawDate: '2025-06-10', income: 15000, expenses: 5000, net: 10000 },
      { date: '2025-05-15', rawDate: '2025-05-15', income: 8000, expenses: 2000, net: 6000 },
      { date: '2025-04-12', rawDate: '2025-04-12', income: 7000, expenses: 3000, net: 4000 },
      // Different year:
      { date: '2026-06-10', rawDate: '2026-06-10', income: 99999, expenses: 99999, net: 0 },
    ];

    const { rerender } = render(
      <CashFlowWidget
        timelinePoints={[]}
        cashMovements={movements}
        asOfDate="2025-06-15"
        selectedPreset="mtd"
        currencySymbol="$"
      />
    );

    // MTD for asOfDate 2025-06-15 is June 2025 only: Net = 10,000
    expect(screen.getByText('Net Cash Flow (MTD)')).toBeTruthy();
    expect(screen.getAllByText(/\$10,000\.00/).length).toBeGreaterThanOrEqual(1);

    // Now rerender with QTD: Q2 2025 is Apr, May, Jun 2025: Net = 10000 + 6000 + 4000 = 20,000
    rerender(
      <CashFlowWidget
        timelinePoints={[]}
        cashMovements={movements}
        asOfDate="2025-06-15"
        selectedPreset="qtd"
        currencySymbol="$"
      />
    );

    expect(screen.getByText('Net Cash Flow (Q2)')).toBeTruthy();
    expect(screen.getAllByText(/\$20,000\.00/).length).toBeGreaterThanOrEqual(1);
    // Cash in for Q2 = 15000 + 8000 + 7000 = 30000
    expect(screen.getAllByText(/\$30,000\.00/).length).toBeGreaterThanOrEqual(1);
  });
});
