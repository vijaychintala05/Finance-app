import { apiClient } from '../api/client';

export type WorkspaceReportValueType = 'text' | 'date' | 'number' | 'money' | 'percent' | 'status';

export interface WorkspaceReportColumn {
  key: string;
  label: string;
  type: WorkspaceReportValueType;
  align?: 'left' | 'right';
}

export interface WorkspaceReportResult {
  id: string;
  title: string;
  description: string;
  basis: 'POSTED_DOCUMENTS' | 'POSTED_LEDGER' | 'RECONCILED_SUBLEDGER' | 'OPERATIONAL';
  generatedAt: string;
  period: { fromDate?: string; toDate?: string; asOfDate?: string };
  columns: WorkspaceReportColumn[];
  rows: Array<Record<string, unknown>>;
  summary: Array<{ key: string; label: string; value: number; type: 'money' | 'number' | 'percent' }>;
  chart?: { categoryKey: string; valueKeys: Array<{ key: string; label: string }> };
  warnings?: string[];
}

export const WORKSPACE_REPORT_IDS = [
  'sales_by_customer', 'sales_by_item', 'sales_by_salesperson', 'invoice_details',
  'payments_received', 'time_to_get_paid', 'customer_balance_summary',
  'expense_details', 'expenses_by_category', 'expenses_by_vendor', 'expenses_by_project',
  'billable_expense_details', 'bill_details', 'purchases_by_vendor', 'payments_made',
  'vendor_balance_summary', 'timesheet_details', 'bank_reconciliation_summary',
  'bank_transaction_details', 'gst_summary', 'tds_summary', 'journal_report',
  'fixed_asset_register', 'activity_logs', 'movement_of_equity',
] as const;

export type WorkspaceReportId = typeof WORKSPACE_REPORT_IDS[number];

export function isWorkspaceReportId(value: string): value is WorkspaceReportId {
  return (WORKSPACE_REPORT_IDS as readonly string[]).includes(value);
}

export interface WorkspaceReportFilters {
  fromDate: string;
  toDate: string;
  projectId?: string;
  customerId?: string;
  vendorId?: string;
  accountId?: string;
  status?: string;
  search?: string;
}

function queryString(filters: WorkspaceReportFilters): string {
  const query = new URLSearchParams({
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    asOfDate: filters.toDate,
  });
  for (const [key, value] of Object.entries(filters)) {
    if (value && !['fromDate', 'toDate'].includes(key)) query.set(key, value);
  }
  return query.toString();
}

export async function fetchWorkspaceReport(reportId: WorkspaceReportId, filters: WorkspaceReportFilters): Promise<WorkspaceReportResult> {
  const response = await apiClient.get<WorkspaceReportResult>(`/finance/reports/workspace/${reportId}?${queryString(filters)}`);
  if (response.error || !response.data) throw new Error(response.error || 'The report returned no data');
  return response.data;
}

export async function downloadWorkspaceReport(
  reportId: WorkspaceReportId,
  filters: WorkspaceReportFilters,
  format: 'csv' | 'xlsx' | 'pdf',
  columns: string[],
): Promise<void> {
  const query = new URLSearchParams(queryString(filters));
  query.set('format', format);
  if (columns.length) query.set('columns', columns.join(','));
  const response = await apiClient.getBlob(`/finance/reports/workspace/${reportId}/export?${query.toString()}`);
  if (response.error || !response.data) throw new Error(response.error || 'Report export failed');
  const blob = response.data;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${reportId}_${filters.fromDate}_${filters.toDate}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
