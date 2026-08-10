import { db } from '../database/db';

export interface ReportExportMetadata {
  orgName: string;
  reportName: string;
  reportingPeriod: string;
  appliedFilters: Record<string, any>;
  generatedAt: string;
  generatedBy: string;
  currencySymbol: string;
}

export class ReportExportService {
  public static async getExportMetadata(
    orgId: string,
    userId: string,
    reportName: string,
    periodLabel: string,
    filters: Record<string, any> = {}
  ): Promise<ReportExportMetadata> {
    const orgRes = await db.query(
      `SELECT name, currency_symbol FROM organizations WHERE id = $1`,
      [orgId]
    );
    const orgName = orgRes.rows[0]?.name || 'FirmBooks Organization';
    const currencySymbol = orgRes.rows[0]?.currency_symbol || '₹';

    const userRes = await db.query(
      `SELECT full_name, email FROM users WHERE id = $1`,
      [userId]
    );
    const generatedBy = userRes.rows[0]?.full_name || userRes.rows[0]?.email || 'Accountant';

    return {
      orgName,
      reportName,
      reportingPeriod: periodLabel,
      appliedFilters: filters,
      generatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      generatedBy,
      currencySymbol,
    };
  }

  public static convertToCSV(dataRows: any[], headers?: string[]): string {
    if (!dataRows || dataRows.length === 0) return '';
    const cols = headers || Object.keys(dataRows[0]);
    const headerLine = cols.join(',');

    const rowLines = dataRows.map((row) =>
      cols
        .map((col) => {
          const val = row[col] !== undefined && row[col] !== null ? String(row[col]) : '';
          const escaped = val.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(',')
    );

    return [headerLine, ...rowLines].join('\n');
  }
}
