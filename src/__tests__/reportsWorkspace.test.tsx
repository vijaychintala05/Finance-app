// @vitest-environment jsdom
import React, { useState } from 'react';
import { ReportsView } from '../components/reports/ReportsView';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_REPORTS_CATALOG } from '../components/reports/reportCatalog';
import { ReportCardGrid } from '../components/reports/ReportCardGrid';
import { WorkspaceReportRenderer } from '../components/reports/WorkspaceReportRenderer';
import { AUTHORITATIVE_REPORTS } from '../services/authoritativeReportService';
import * as WorkspaceReportService from '../services/reportWorkspaceService';
import * as SavedReportViewsService from '../services/savedReportViewsService';
import type { WorkspaceReportResult } from '../services/reportWorkspaceService';
import { buildFinanceHash, parseFinanceHash } from '../navigation/financeRoute';

const { booksContext } = vi.hoisted(() => ({
  booksContext: {
    settings: { currencyCode: 'INR', currencySymbol: '₹', firmName: 'Test Firm' },
    projects: [], clients: [], vendors: [], accounts: [], currentOrg: { id: 'org-1' } as { id: string },
  },
}));
vi.mock('../context/BooksContext', () => ({ useBooks: () => booksContext }));
vi.mock('../context/AuthContext', () => ({ useOptionalAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('../services/savedReportViewsService', () => ({ fetchSavedReportViews: vi.fn().mockResolvedValue([]), saveReportView: vi.fn() }));

afterEach(cleanup);
beforeEach(() => {
  vi.restoreAllMocks();
  booksContext.currentOrg = { id: 'org-1' };
});

const report: WorkspaceReportResult = {
  id: 'sales_by_customer',
  title: 'Sales by Customer',
  description: 'Test report',
  basis: 'POSTED_DOCUMENTS',
  generatedAt: '2026-09-13T10:00:00.000Z',
  period: { fromDate: '2026-09-01', toDate: '2026-09-30' },
  columns: [
    { key: 'customer', label: 'Customer', type: 'text' },
    { key: 'sales', label: 'Sales', type: 'money', align: 'right' },
    { key: 'status', label: 'Status', type: 'status' },
  ],
  rows: [
    { customer: 'Alpha Studio', sales: 125000, status: 'Paid' },
    { customer: 'Beta Design', sales: 50000, status: 'Overdue' },
  ],
  summary: [{ key: 'sales', label: 'Total sales', value: 175000, type: 'money' }],
  chart: { categoryKey: 'customer', valueKeys: [{ key: 'sales', label: 'Sales' }] },
};

const Harness = () => {
  const [columns, setColumns] = useState(report.columns.map((column) => column.key));
  return <WorkspaceReportRenderer report={report} currencySymbol="INR" visibleColumns={columns} onVisibleColumnsChange={setColumns} />;
};

describe('Reports workspace', () => {
  it('publishes the full cross-functional report catalog', () => {
    expect(INITIAL_REPORTS_CATALOG.length).toBeGreaterThanOrEqual(35);
    const categories = new Set(INITIAL_REPORTS_CATALOG.map((item) => item.category));
    expect(categories.has('Business Overview')).toBe(true);
    expect(categories.has('Purchases and Expenses')).toBe(true);
    expect(categories.has('Accountant')).toBe(true);
    expect(INITIAL_REPORTS_CATALOG.some((item) => item.id === 'cash_flow_statement')).toBe(true);
    expect(INITIAL_REPORTS_CATALOG.some((item) => item.id === 'gst_summary')).toBe(true);
    expect(INITIAL_REPORTS_CATALOG.some((item) => item.id === 'bank_reconciliation_summary')).toBe(true);
  });

  it('persists catalog favorites per authenticated user and organization in this browser', async () => {
    window.localStorage.clear();
    const { unmount } = render(<ReportsView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Profit and Loss from favorites' }));
    expect(JSON.parse(window.localStorage.getItem('firmbooks.report-favorites.org-1.user-1') || '[]')).not.toContain('pnl_standard');

    unmount();
    render(<ReportsView />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Report section' }), { target: { value: 'favorites' } });
    expect(screen.queryByRole('button', { name: 'Open Profit and Loss report' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open Comparative Profit and Loss report' })).toBeTruthy();
    window.localStorage.clear();
  });

  it('keeps the report action separate from its favorite control', () => {
    const item = {
      id: 'sales_by_customer',
      name: 'Sales by Customer',
      category: 'Sales' as const,
      description: 'Revenue grouped by customer',
      createdBy: 'System',
    };
    const onSelectReport = vi.fn();
    const onToggleFavorite = vi.fn();
    const onSelectGroup = vi.fn();

    render(
      <ReportCardGrid
        activeGroup="home"
        categoriesList={['Sales']}
        onSelectGroup={onSelectGroup}
        searchQuery=""
        setSearchQuery={() => undefined}
        filteredReports={[item]}
        dateRange="2026-01-01 to 2026-09-23"
        onSelectReport={onSelectReport}
        onToggleFavorite={onToggleFavorite}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Report section' }), { target: { value: 'Sales' } });
    expect(onSelectGroup).toHaveBeenCalledWith('Sales');

    fireEvent.click(screen.getByRole('button', { name: 'Add Sales by Customer to favorites' }));
    expect(onToggleFavorite).toHaveBeenCalledOnce();
    expect(onSelectReport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open Sales by Customer report' }));
    expect(onSelectReport).toHaveBeenCalledWith('sales_by_customer');
  });

  it('opens only supported report sources and keeps unknown source kinds as plain text', () => {
    const onOpenSource = vi.fn();
    const sourceReport = {
      ...report,
      rows: [
        { customer: 'Northwind invoice', source_type: 'invoice', source_id: 'inv/2026/1', sales: 100, status: 'Paid' },
        { customer: 'Unsupported project row', source_type: 'project', source_id: 'prj-1', sales: 50, status: 'Paid' },
        { customer: 'Prototype row', source_type: '__proto__', source_id: 'proto-1', sales: 25, status: 'Paid' },
        { customer: 'Constructor row', source_type: 'constructor', source_id: 'ctor-1', sales: 10, status: 'Paid' },
      ],
    };
    render(<WorkspaceReportRenderer report={sourceReport} currencySymbol="INR" visibleColumns={report.columns.map((column) => column.key)} onVisibleColumnsChange={() => undefined} reportRoute={{ reportId: 'invoice_details', fromDate: '2026-01-01', toDate: '2026-09-24' }} onOpenSource={onOpenSource} />);

    fireEvent.click(screen.getByRole('button', { name: 'Northwind invoice' }));
    expect(onOpenSource).toHaveBeenCalledWith('invoice', 'inv/2026/1');
    expect(screen.queryByRole('button', { name: 'Unsupported project row' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Prototype row' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Constructor row' })).toBeNull();
  });

  it('updates report search in the canonical hash so a source return restores the same results', () => {
    window.history.replaceState(null, '', '#/reports?report=invoice_details&from=2026-01-01&to=2026-09-24');
    render(<WorkspaceReportRenderer report={report} currencySymbol="INR" visibleColumns={report.columns.map((column) => column.key)} onVisibleColumnsChange={() => undefined} reportRoute={{ reportId: 'invoice_details', fromDate: '2026-01-01', toDate: '2026-09-24' }} onOpenSource={() => undefined} />);
    const searchInput = screen.getByPlaceholderText('Search this report');
    expect((searchInput as HTMLInputElement).maxLength).toBe(120);
    fireEvent.change(searchInput, { target: { value: 'Alpha' } });
    expect(parseFinanceHash(window.location.hash).report).toMatchObject({ reportId: 'invoice_details', search: 'Alpha', page: 1 });
    window.history.replaceState(null, '', '/');
  });
  it('round-trips a maximum-length report search through source navigation and return', () => {
    const maxSearch = 'N'.repeat(120);
    window.history.replaceState(null, '', '#/reports?report=invoice_details&from=2026-01-01&to=2026-09-24');
    const sourceReport = {
      ...report,
      rows: [{ customer: maxSearch, source_type: 'invoice', source_id: 'inv-max-search', sales: 100, status: 'Paid' }],
    };
    render(<WorkspaceReportRenderer
      report={sourceReport}
      currencySymbol="INR"
      visibleColumns={report.columns.map((column) => column.key)}
      onVisibleColumnsChange={() => undefined}
      reportRoute={{ reportId: 'invoice_details', fromDate: '2026-01-01', toDate: '2026-09-24' }}
      onOpenSource={(sourceType, sourceId) => {
        const current = parseFinanceHash(window.location.hash).report!;
        window.history.pushState(null, '', buildFinanceHash({ tab: 'invoices', entityId: sourceId, back: { tab: 'reports', report: { ...current, focusType: sourceType, focusId: sourceId } } }));
      }}
    />);
    const searchInput = screen.getByPlaceholderText('Search this report');
    expect((searchInput as HTMLInputElement).maxLength).toBe(120);
    fireEvent.change(searchInput, { target: { value: maxSearch } });
    fireEvent.click(screen.getByRole('button', { name: maxSearch }));
    const sourceRoute = parseFinanceHash(window.location.hash);
    expect(sourceRoute.back?.tab).toBe('reports');
    expect(sourceRoute.back?.report?.search).toBe(maxSearch);
    window.history.replaceState(null, '', buildFinanceHash({ tab: 'reports', report: sourceRoute.back!.report! }));
    expect(parseFinanceHash(window.location.hash).report?.search).toBe(maxSearch);
    window.history.replaceState(null, '', '/');
  });
  it('keeps history unchanged and explains when a report source return route exceeds the URL limit', async () => {
    const oversizedFilter = '%'.repeat(200);
    const initialRoute = { tab: 'reports' as const, report: {
      reportId: 'invoice_details', fromDate: '2026-01-01', toDate: '2026-09-24',
      projectId: oversizedFilter, customerId: oversizedFilter, vendorId: oversizedFilter, accountId: oversizedFilter,
    } };
    vi.spyOn(WorkspaceReportService, 'fetchWorkspaceReport').mockResolvedValue({
      ...report,
      rows: [{ customer: 'Oversized filters invoice', source_type: 'invoice', source_id: 'inv-source', sales: 100, status: 'Paid' }],
    });
    window.history.replaceState(null, '', '#/reports');
    render(<ReportsView initialRoute={initialRoute} />);

    const hashBeforeSourceClick = window.location.hash;
    fireEvent.click(await screen.findByRole('button', { name: 'Oversized filters invoice' }));

    expect(window.location.hash).toBe(hashBeforeSourceClick);
    expect((await screen.findByRole('alert')).textContent).toMatch(/return link is too large/i);
    window.history.replaceState(null, '', '/');
  });
  it('scopes saved views to the active organization and discards a late prior-organization response', async () => {
    let resolveOrgOne: (views: any[]) => void = () => {};
    let resolveOrgTwo: (views: any[]) => void = () => {};
    const fetchViews = vi.mocked(SavedReportViewsService.fetchSavedReportViews);
    fetchViews.mockClear();
    fetchViews.mockImplementation((organizationId) => new Promise((resolve) => {
      if (organizationId === 'org-1') resolveOrgOne = resolve;
      else resolveOrgTwo = resolve;
    }));
    const view = render(<ReportsView />);

    await vi.waitFor(() => expect(fetchViews).toHaveBeenCalledTimes(1));
    expect(fetchViews).toHaveBeenLastCalledWith('org-1');
    booksContext.currentOrg = { id: 'org-2' };
    view.rerender(<ReportsView />);
    await vi.waitFor(() => expect(fetchViews).toHaveBeenCalledTimes(2));
    expect(fetchViews).toHaveBeenLastCalledWith('org-2');
    expect(screen.queryByText('Private Org One View')).toBeNull();

    resolveOrgTwo([{ id: 'org-view-2', name: 'Current Org Two View', report_type: 'sales_by_customer', visibility: 'PRIVATE', is_favorite: false, config: {} }]);
    expect(await screen.findByRole('button', { name: 'Current Org Two View' })).toBeTruthy();
    resolveOrgOne([{ id: 'org-view-1', name: 'Private Org One View', report_type: 'sales_by_customer', visibility: 'PRIVATE', is_favorite: false, config: {} }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Private Org One View')).toBeNull();
    expect(screen.getByRole('button', { name: 'Current Org Two View' })).toBeTruthy();
  });
  it('pins report reads to the active organization and discards late results after an organization switch', async () => {
    let resolveOrgOne: (value: WorkspaceReportResult) => void = () => {};
    let resolveOrgTwo: (value: WorkspaceReportResult) => void = () => {};
    const fetchReport = vi.spyOn(WorkspaceReportService, 'fetchWorkspaceReport')
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOrgOne = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOrgTwo = resolve; }));
    const initialRoute = { tab: 'reports' as const, report: { reportId: 'sales_by_customer', fromDate: '2026-01-01', toDate: '2026-09-24' } };
    const view = render(<ReportsView initialRoute={initialRoute} />);

    await vi.waitFor(() => expect(fetchReport).toHaveBeenCalledTimes(1));
    expect(fetchReport.mock.calls[0][2]).toBe('org-1');
    booksContext.currentOrg = { id: 'org-2' };
    view.rerender(<ReportsView initialRoute={initialRoute} />);
    await vi.waitFor(() => expect(fetchReport).toHaveBeenCalledTimes(2));
    expect(fetchReport.mock.calls[1][2]).toBe('org-2');
    expect(screen.queryByText('Alpha Studio')).toBeNull();

    resolveOrgOne({ ...report, rows: [{ customer: 'Old organization row', sales: 100, status: 'Paid' }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Old organization row')).toBeNull();
    resolveOrgTwo({ ...report, rows: [{ customer: 'Current organization row', sales: 200, status: 'Paid' }] });
    expect(await screen.findByText('Current organization row')).toBeTruthy();
    expect(screen.queryByText('Old organization row')).toBeNull();
  });
  it('keeps the committed saved view when its refresh beats the initial load', async () => {
    let resolveInitial: (views: any[]) => void = () => {};
    let resolveRefresh: (views: any[]) => void = () => {};
    const fetchViews = vi.mocked(SavedReportViewsService.fetchSavedReportViews);
    fetchViews.mockClear()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveInitial = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    vi.mocked(SavedReportViewsService.saveReportView).mockResolvedValue();
    vi.spyOn(WorkspaceReportService, 'fetchWorkspaceReport').mockResolvedValue(report);
    const initialRoute = { tab: 'reports' as const, report: { reportId: 'sales_by_customer', fromDate: '2026-01-01', toDate: '2026-09-24' } };
    render(<ReportsView initialRoute={initialRoute} />);
    expect(await screen.findByText('Alpha Studio')).toBeTruthy();
    await vi.waitFor(() => expect(fetchViews).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Save view' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Committed view' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save view' })[1]);
    await vi.waitFor(() => expect(fetchViews).toHaveBeenCalledTimes(2));
    resolveRefresh([{ id: 'saved-view', name: 'Committed view', report_type: 'sales_by_customer', visibility: 'PRIVATE', is_favorite: false, config: {} }]);
    fireEvent.click(screen.getByRole('button', { name: /^All Reports/ }));
    expect(await screen.findByRole('button', { name: 'Committed view' })).toBeTruthy();
    resolveInitial([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByRole('button', { name: 'Committed view' })).toBeTruthy();
  });
  it('distinguishes a committed save from a failed list refresh and offers a retry', async () => {
    const savedView = { id: 'saved-view', name: 'Committed view', report_type: 'sales_by_customer', visibility: 'PRIVATE' as const, is_favorite: false, config: {} };
    const fetchViews = vi.mocked(SavedReportViewsService.fetchSavedReportViews);
    fetchViews.mockClear()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('temporary refresh failure'))
      .mockResolvedValueOnce([savedView]);
    vi.mocked(SavedReportViewsService.saveReportView).mockResolvedValue();
    vi.spyOn(WorkspaceReportService, 'fetchWorkspaceReport').mockResolvedValue(report);
    const initialRoute = { tab: 'reports' as const, report: { reportId: 'sales_by_customer', fromDate: '2026-01-01', toDate: '2026-09-24' } };
    render(<ReportsView initialRoute={initialRoute} />);
    expect(await screen.findByText('Alpha Studio')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save view' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Committed view' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save view' })[1]);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/was saved, but its list could not be refreshed/i);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh saved views' }));
    await vi.waitFor(() => expect(fetchViews).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole('button', { name: /^All Reports/ }));
    expect(await screen.findByRole('button', { name: 'Committed view' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('does not surface a late export failure after switching organizations', async () => {
    let rejectExport: (reason: Error) => void = () => {};
    const fetchReport = vi.spyOn(WorkspaceReportService, 'fetchWorkspaceReport').mockResolvedValue(report);
    const download = vi.spyOn(WorkspaceReportService, 'downloadWorkspaceReport')
      .mockImplementation(() => new Promise((_, reject) => { rejectExport = reject; }));
    const initialRoute = { tab: 'reports' as const, report: { reportId: 'sales_by_customer', fromDate: '2026-01-01', toDate: '2026-09-24' } };
    const view = render(<ReportsView initialRoute={initialRoute} />);

    expect(await screen.findByText('Alpha Studio')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Export Excel'));
    await vi.waitFor(() => expect(download).toHaveBeenCalledOnce());
    booksContext.currentOrg = { id: 'org-2' };
    view.rerender(<ReportsView initialRoute={initialRoute} />);
    await vi.waitFor(() => expect(fetchReport).toHaveBeenCalledTimes(2));
    rejectExport(new Error('Old organization export failed'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText('Old organization export failed')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('renders summaries, searchable rows, status treatment, and column controls', () => {
    render(<Harness />);
    expect(screen.getByText('INR 1,75,000.00')).toBeTruthy();
    expect(screen.getByText('Alpha Studio')).toBeTruthy();
    expect(screen.getByText('Beta Design')).toBeTruthy();
    const searchInput = screen.getByPlaceholderText('Search this report');
    expect((searchInput as HTMLInputElement).maxLength).toBe(120);
    fireEvent.change(searchInput, { target: { value: 'Alpha' } });
    expect(screen.getByText('Alpha Studio')).toBeTruthy();
    expect(screen.queryByText('Beta Design')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Status' }));
    expect(screen.queryByRole('columnheader', { name: 'Status' })).toBeNull();
  });

  it('ensures every report in the catalog is in authoritative reports or workspace reports', () => {
    expect(INITIAL_REPORTS_CATALOG.length).toBe(38);
    for (const item of INITIAL_REPORTS_CATALOG) {
      const isHandled = item.id in AUTHORITATIVE_REPORTS || WorkspaceReportService.isWorkspaceReportId(item.id);
      expect(isHandled, `Report "${item.id}" (${item.name}) is missing from both AUTHORITATIVE_REPORTS and WORKSPACE_REPORT_IDS`).toBe(true);
    }
  });
});
