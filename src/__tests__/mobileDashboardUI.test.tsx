// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
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
    expenses: [],
    bills: [],
    accounts: [],
    clients: [],
    vendors: [],
    journalEntries: [],
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
      bankReconciliationAttentionCount: 0,
      quotationsAwaitingResponseCount: 0,
      pendingJournalsCount: 0,
      collections: [],
      billsDue: [],
      recentTransactions: [],
    },
    commandCenter: {
      period: { start: '2026-04-01', end: '2026-09-16', label: 'FY 2026-27' },
      financialPosition: { cashAtBank: 550000, toCollect: 1347270, toPay: 20700 },
      performance: { revenue: 1347270, expenses: 20700, net: 1326570, marginPercent: 98.4, cashMovement: [] },
      scheduledCashOutlook: { windowDays: 30, collections: 1347270, bills: 20700, net: 1326570 },
      attention: [],
      insights: { topExpenses: [{ name: 'Studio Rent', amount: 15000 }], bankAccounts: [] },
    },
    asOfDate: '2026-09-16',
    generatedAt: '2026-09-16T10:00:00Z',
    availableViews: ['overview', 'cash-operations', 'close-controls'],
    view: 'overview',
  };

  it('1. Mobile Primary Overview Cards render Receivables, Payables, Overdue Invoices (11), Overdue Bills (2)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockDashboardData as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    await waitFor(() => {
      expect(screen.getAllByText('Total Receivables').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Total Payables').length).toBeGreaterThanOrEqual(1);
    });

    // Check exact values from user screenshot
    expect(screen.getByText('Overdue Invoices')).toBeTruthy();
    expect(screen.getByText('11')).toBeTruthy();
    expect(screen.getByText('Overdue Bills')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('2. Mobile Quick Create renders Customer, Expense, Quote, and Customise buttons', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockDashboardData as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('Quick Create')).toBeTruthy();
    });

    expect(screen.getByText('Customer')).toBeTruthy();
    expect(screen.getAllByText('Expense').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Quote')).toBeTruthy();
    expect(screen.getByText('Customise')).toBeTruthy();
  });

  it('3. Mobile Cash Flow widget renders This Fiscal Year dropdown and chart container', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { dashboard: mockDashboardData as any },
      error: null,
      status: 200,
    });

    render(<DashboardView onNavigate={mockOnNavigate} />);

    await waitFor(() => {
      expect(screen.getAllByText('This Fiscal Year').length).toBeGreaterThanOrEqual(1);
    });

    // Verify month labels on mobile chart
    expect(screen.getAllByText('Apr').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Mar').length).toBeGreaterThanOrEqual(1);

    // Verify Mobile Top Expenses widget
    expect(screen.getByText('Top Expenses')).toBeTruthy();
    expect(screen.getAllByText('Studio Rent').length).toBeGreaterThanOrEqual(1);

    // Verify Mobile Banking Summary widget
    expect(screen.getByText('Banking Summary')).toBeTruthy();
    expect(screen.getByText('Uncategorised Transactions')).toBeTruthy();
    expect(screen.getByText('Bank Balance')).toBeTruthy();
    expect(screen.getByText('Cash In Hand')).toBeTruthy();
  });

  it('4. Floating MobileBottomNav renders Home, Customers, Invoices, Expenses, More', () => {
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

  it('5. Mobile Header renders Org Switcher, Bell, and Subheader tabs (Dashboard, Announcements, Help)', () => {
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
