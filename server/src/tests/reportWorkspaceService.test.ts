import { beforeAll, describe, expect, it } from 'vitest';
process.env.USE_PG_MEM = 'true';

import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { ReportExportService } from '../services/ReportExportService';
import { ReportWorkspaceService, WORKSPACE_REPORT_IDS } from '../services/ReportWorkspaceService';

const ORG_ID = 'org-report-workspace';
const USER_ID = 'usr-report-workspace';

describe('Report workspace catalog', () => {
  beforeAll(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-report-workspace', 'PUB-REPORT-WORKSPACE', 'REPORTS', 'Report Workspace Ltd', 'India', 'INR', 'INR', $2)`,
      [ORG_ID, USER_ID],
    );
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'reports@example.com', 'not-used', 'Report Owner', 'Active')`,
      [USER_ID],
    );
  });

  it('runs every catalog report against the migrated schema', async () => {
    for (const reportId of WORKSPACE_REPORT_IDS) {
      const report = await ReportWorkspaceService.run(ORG_ID, reportId, {
        fromDate: '2026-04-01',
        toDate: '2026-09-30',
      });
      expect(report.id).toBe(reportId);
      expect(Array.isArray(report.columns)).toBe(true);
      expect(Array.isArray(report.rows)).toBe(true);
      expect(Array.isArray(report.summary)).toBe(true);
    }
  });

  it('rejects invalid periods and unsupported report identifiers', async () => {
    await expect(ReportWorkspaceService.run(ORG_ID, 'expense_details', { fromDate: 'bad-date', toDate: '2026-09-30' })).rejects.toThrow('REPORT_DATE_INVALID');
    await expect(ReportWorkspaceService.run(ORG_ID, 'not_a_report')).rejects.toThrow('REPORT_NOT_SUPPORTED');
  });

  it('reports tax-inclusive and tax-exclusive expenses without double counting tax', async () => {
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, normal_balance)
       VALUES ('acc-report-expense', $1, '6199', 'Report Test Expense', 'Expense', 'Expense', 'Debit'),
              ('acc-report-bank', $1, '1299', 'Report Test Bank', 'Asset', 'Bank', 'Debit')`,
      [ORG_ID],
    );
    await db.query(
      `INSERT INTO expenses
        (id, organization_id, expense_number, expense_account_id, paid_from_account_id, date, amount, tax_amount, is_tax_inclusive, description)
       VALUES
        ('exp-report-exclusive', $1, 'EXP-REPORT-1', 'acc-report-expense', 'acc-report-bank', '2026-08-01', 1000, 180, FALSE, 'Exclusive report test'),
        ('exp-report-inclusive', $1, 'EXP-REPORT-2', 'acc-report-expense', 'acc-report-bank', '2026-08-02', 1180, 180, TRUE, 'Inclusive report test')`,
      [ORG_ID],
    );

    const details = await ReportWorkspaceService.run(ORG_ID, 'expense_details', { fromDate: '2026-08-01', toDate: '2026-08-31' });
    expect(details.rows).toHaveLength(2);
    expect(details.summary.find((item) => item.key === 'amount')?.value).toBe(2000);
    expect(details.summary.find((item) => item.key === 'tax_amount')?.value).toBe(360);
    expect(details.summary.find((item) => item.key === 'gross_amount')?.value).toBe(2360);

    const grouped = await ReportWorkspaceService.run(ORG_ID, 'expenses_by_category', { fromDate: '2026-08-01', toDate: '2026-08-31' });
    expect(grouped.rows[0].total).toBe(2360);

    const gst = await ReportWorkspaceService.run(ORG_ID, 'gst_summary', { fromDate: '2026-08-01', toDate: '2026-08-31' });
    const paidExpenses = gst.rows.find((row) => row.section === 'Input tax on paid expenses');
    expect(paidExpenses.taxable_amount).toBe(2000);
    expect(paidExpenses.tax_amount).toBe(360);
  });

  it('exports complete report data to CSV, Excel and professional PDF buffers', async () => {
    const report = await ReportWorkspaceService.run(ORG_ID, 'expense_details', { fromDate: '2026-04-01', toDate: '2026-09-30' });
    const metadata = await ReportExportService.getExportMetadata(ORG_ID, USER_ID, report.title, '2026-04-01 through 2026-09-30');
    const csv = await ReportExportService.exportWorkspaceReport(report, metadata, 'csv');
    const xlsx = await ReportExportService.exportWorkspaceReport(report, metadata, 'xlsx');
    const pdf = await ReportExportService.exportWorkspaceReport(report, metadata, 'pdf');
    expect(csv.subarray(0, 3).toString('hex')).toBe('efbbbf');
    expect(xlsx.subarray(0, 2).toString()).toBe('PK');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
