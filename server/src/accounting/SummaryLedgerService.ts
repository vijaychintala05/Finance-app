import { db, type DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';

export interface MonthlySummaryRecord {
  id: string;
  organizationId: string;
  accountId: string;
  fiscalYear: number;
  month: number;
  debitTurnover: number;
  creditTurnover: number;
  netTurnover: number;
  closingBalance: number;
  updatedAt: string;
}

export class SummaryLedgerService {
  /**
   * Incrementally updates the pre-aggregated monthly summary when journal lines are posted.
   */
  public static async recordJournalLines(
    client: DbQueryClient,
    organizationId: string,
    lines: Array<{ accountId: string; debit: number; credit: number }>,
    dateStr: string
  ): Promise<void> {
    if (!lines || lines.length === 0) return;

    const date = new Date(dateStr);
    const fiscalYear = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;

    for (const line of lines) {
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      const net = debit - credit;

      await client.query(
        `INSERT INTO ledger_monthly_summaries (
           id, organization_id, account_id, fiscal_year, month,
           debit_turnover, credit_turnover, net_turnover, closing_balance, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, CURRENT_TIMESTAMP)
         ON CONFLICT (organization_id, account_id, fiscal_year, month)
         DO UPDATE SET
           debit_turnover = ledger_monthly_summaries.debit_turnover + EXCLUDED.debit_turnover,
           credit_turnover = ledger_monthly_summaries.credit_turnover + EXCLUDED.credit_turnover,
           net_turnover = ledger_monthly_summaries.net_turnover + EXCLUDED.net_turnover,
           closing_balance = ledger_monthly_summaries.closing_balance + EXCLUDED.net_turnover,
           updated_at = CURRENT_TIMESTAMP`,
        [newId('lms'), organizationId, line.accountId, fiscalYear, month, debit, credit, net]
      );
    }
  }

  /**
   * Rebuilds all monthly summaries from historical posted journal lines for an organization.
   */
  public static async rebuildMonthlyRollups(
    organizationId: string,
    clientOrDb?: DbQueryClient
  ): Promise<{ processedRecords: number }> {
    const client = clientOrDb || db;

    await client.query(
      `DELETE FROM ledger_monthly_summaries WHERE organization_id = $1`,
      [organizationId]
    );

    const aggregates = await client.query(
      `SELECT 
         jl.account_id,
         EXTRACT(YEAR FROM je.date)::INT AS fiscal_year,
         EXTRACT(MONTH FROM je.date)::INT AS month,
         COALESCE(SUM(jl.debit), 0) AS total_debit,
         COALESCE(SUM(jl.credit), 0) AS total_credit
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       WHERE je.organization_id = $1 AND UPPER(je.status) = 'POSTED'
       GROUP BY jl.account_id, EXTRACT(YEAR FROM je.date), EXTRACT(MONTH FROM je.date)`,
      [organizationId]
    );

    for (const row of aggregates.rows) {
      const debit = Number(row.total_debit);
      const credit = Number(row.total_credit);
      const net = debit - credit;

      await client.query(
        `INSERT INTO ledger_monthly_summaries (
           id, organization_id, account_id, fiscal_year, month,
           debit_turnover, credit_turnover, net_turnover, closing_balance, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, CURRENT_TIMESTAMP)`,
        [newId('lms'), organizationId, row.account_id, row.fiscal_year, row.month, debit, credit, net]
      );
    }

    return { processedRecords: aggregates.rows.length };
  }

  /**
   * Fetches monthly summary with O(1) indexed lookup.
   */
  public static async getAccountMonthlySummary(
    organizationId: string,
    accountId: string,
    fiscalYear: number,
    month: number,
    clientOrDb?: DbQueryClient
  ): Promise<{ debitTurnover: number; creditTurnover: number; netTurnover: number } | null> {
    const client = clientOrDb || db;
    const res = await client.query(
      `SELECT debit_turnover, credit_turnover, net_turnover, closing_balance
         FROM ledger_monthly_summaries
        WHERE organization_id = $1 AND account_id = $2 AND fiscal_year = $3 AND month = $4`,
      [organizationId, accountId, fiscalYear, month]
    );

    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    return {
      debitTurnover: Number(row.debit_turnover),
      creditTurnover: Number(row.credit_turnover),
      netTurnover: Number(row.net_turnover),
    };
  }
}
