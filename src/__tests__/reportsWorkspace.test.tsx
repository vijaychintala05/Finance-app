// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { INITIAL_REPORTS_CATALOG } from '../components/reports/reportCatalog';
import { WorkspaceReportRenderer } from '../components/reports/WorkspaceReportRenderer';
import { AUTHORITATIVE_REPORTS } from '../services/authoritativeReportService';
import { isWorkspaceReportId, type WorkspaceReportResult } from '../services/reportWorkspaceService';

afterEach(cleanup);

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

  it('renders summaries, searchable rows, status treatment, and column controls', () => {
    render(<Harness />);
    expect(screen.getByText('INR 1,75,000.00')).toBeTruthy();
    expect(screen.getByText('Alpha Studio')).toBeTruthy();
    expect(screen.getByText('Beta Design')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Search this report'), { target: { value: 'Alpha' } });
    expect(screen.getByText('Alpha Studio')).toBeTruthy();
    expect(screen.queryByText('Beta Design')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Status' }));
    expect(screen.queryByRole('columnheader', { name: 'Status' })).toBeNull();
  });

  it('ensures every report in the catalog is in authoritative reports or workspace reports', () => {
    expect(INITIAL_REPORTS_CATALOG.length).toBe(38);
    for (const item of INITIAL_REPORTS_CATALOG) {
      const isHandled = item.id in AUTHORITATIVE_REPORTS || isWorkspaceReportId(item.id);
      expect(isHandled, `Report "${item.id}" (${item.name}) is missing from both AUTHORITATIVE_REPORTS and WORKSPACE_REPORT_IDS`).toBe(true);
    }
  });
});
