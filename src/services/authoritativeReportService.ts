import { apiClient } from '../api/client';

export type CertifiedReportId =
  | 'pnl_standard'
  | 'balance_sheet_standard'
  | 'aged_receivables'
  | 'aged_payables'
  | 'trial_balance'
  | 'general_ledger';

export type ReportPeriodMode = 'range' | 'as_of';

export interface AuthoritativeReportDefinition {
  id: CertifiedReportId;
  endpoint: string;
  periodMode: ReportPeriodMode;
}

export const AUTHORITATIVE_REPORTS: Record<CertifiedReportId, AuthoritativeReportDefinition> = {
  pnl_standard: { id: 'pnl_standard', endpoint: '/finance/reports/profit-loss', periodMode: 'range' },
  balance_sheet_standard: { id: 'balance_sheet_standard', endpoint: '/finance/reports/balance-sheet', periodMode: 'as_of' },
  aged_receivables: { id: 'aged_receivables', endpoint: '/finance/reports/ar-aging', periodMode: 'as_of' },
  aged_payables: { id: 'aged_payables', endpoint: '/finance/reports/ap-aging', periodMode: 'as_of' },
  trial_balance: { id: 'trial_balance', endpoint: '/finance/reports/trial-balance', periodMode: 'as_of' },
  general_ledger: { id: 'general_ledger', endpoint: '/finance/reports/general-ledger', periodMode: 'range' },
};

export async function fetchAuthoritativeReport(
  reportId: CertifiedReportId,
  fromDate: string,
  toDate: string
): Promise<any> {
  const definition = AUTHORITATIVE_REPORTS[reportId];
  if (!definition) throw new Error('This report is not in the certified reporting scope');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate) || fromDate > toDate) {
    throw new Error('Select a valid report period');
  }
  const asOfReport = definition.periodMode === 'as_of';
  const trialBalanceReport = reportId === 'trial_balance';
  const query = asOfReport
    ? `asOfDate=${encodeURIComponent(toDate)}`
    : trialBalanceReport
    ? `toDate=${encodeURIComponent(toDate)}`
    : `fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`;
  const response = await apiClient.get<any>(`${definition.endpoint}?${query}`);
  if (response.error || !response.data) throw new Error(response.error || 'The report returned no data');
  return response.data;
}

function csvCell(value: unknown): string {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function reportRows(reportId: CertifiedReportId, data: any): Record<string, unknown>[] {
  if (reportId === 'pnl_standard') {
    return [
      ...(data.incomeAccounts || []).map((row: any) => ({ section: 'Income', accountCode: row.accountCode, accountName: row.accountName, amount: row.amount })),
      ...(data.expenseAccounts || []).map((row: any) => ({ section: 'Expense', accountCode: row.accountCode, accountName: row.accountName, amount: row.amount })),
      { section: 'Total income', amount: data.totalIncome },
      { section: 'Total expense', amount: data.totalExpense },
      { section: 'Net profit', amount: data.netProfit },
    ];
  }
  if (reportId === 'balance_sheet_standard') {
    return [
      ...(data.assets?.accounts || []).map((row: any) => ({ section: 'Asset', accountCode: row.accountCode, accountName: row.accountName, amount: row.balance })),
      ...(data.liabilities?.accounts || []).map((row: any) => ({ section: 'Liability', accountCode: row.accountCode, accountName: row.accountName, amount: row.balance })),
      ...(data.equity?.accounts || []).map((row: any) => ({ section: 'Equity', accountCode: row.accountCode, accountName: row.accountName, amount: row.balance })),
      { section: 'Current earnings', amount: data.currentYearEarnings },
      { section: 'Total assets', amount: data.totalAssets },
      { section: 'Total liabilities and equity', amount: data.totalLiabilitiesAndEquity },
      { section: 'Integrity difference', amount: data.difference },
    ];
  }
  if (reportId === 'trial_balance') return data.rows || [];
  if (reportId === 'general_ledger') {
    return (data.accounts || []).flatMap((account: any) =>
      (account.transactions || []).map((row: any) => ({
        accountCode: account.accountCode,
        accountName: account.accountName,
        entryNumber: row.entryNumber,
        entryDate: row.entryDate,
        reference: row.reference,
        narration: row.narration,
        debit: row.debit,
        credit: row.credit,
      }))
    );
  }
  return [
    ...(data.rows || []).map((row: any) => ({
      name: row.name,
      documentNumber: row.invoice_number || row.bill_number,
      dueDate: row.due_date,
      balanceDue: row.balance_due,
    })),
    { name: 'Subledger total', balanceDue: data.totalSubledgerAmount },
    { name: 'Control account total', balanceDue: data.totalGLControlAmount },
    { name: 'Reconciliation difference', balanceDue: data.difference },
  ];
}

export function downloadAuthoritativeReportCsv(reportId: CertifiedReportId, data: any, filename: string): void {
  const rows = reportRows(reportId, data);
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const csv = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
