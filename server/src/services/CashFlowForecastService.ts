import { db } from '../database/db';

export interface ForecastPeriodSummary {
  periodLabel: string;
  startDate: string;
  endDate: string;
  openingBalance: number;
  expectedInflows: number;
  expectedOutflows: number;
  netFlow: number;
  closingBalance: number;
}

export interface CashFlowForecastResponse {
  horizonDays: number;
  currentBankCashBalance: number;
  periods: ForecastPeriodSummary[];
  projectedClosingBalance: number;
}

export class CashFlowForecastService {
  public static async getForecast(
    orgId: string,
    horizonDays: number = 90
  ): Promise<CashFlowForecastResponse> {
    // 1. Get current total cash/bank GL balance
    const bankBalRes = await db.query(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) as total
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       JOIN accounts a ON jl.account_id = a.id
       WHERE je.organization_id = $1
         AND UPPER(je.status) = 'POSTED'
         AND (a.sub_type IN ('Bank', 'Cash', 'BANK', 'CASH') OR a.type IN ('BANK', 'CASH'))`,
      [orgId]
    );
    const currentBankCashBalance = Number(bankBalRes.rows[0]?.total || 0);

    const today = new Date();
    const periods: ForecastPeriodSummary[] = [];
    let runningOpening = currentBankCashBalance;

    // Divide horizon into 30-day buckets or weekly buckets
    const bucketCount = Math.max(1, Math.ceil(horizonDays / 30));

    for (let i = 0; i < bucketCount; i++) {
      const pStart = new Date(today);
      pStart.setDate(today.getDate() + i * 30);
      const pEnd = new Date(today);
      pEnd.setDate(today.getDate() + (i + 1) * 30 - 1);

      const pStartStr = pStart.toISOString().split('T')[0];
      const pEndStr = pEnd.toISOString().split('T')[0];

      // Expected Inflows: unpaid invoices due in this date range
      const invRes = await db.query(
        `SELECT COALESCE(SUM(balance_due), 0) as total
         FROM invoices
         WHERE organization_id = $1
           AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'PAID')
           AND due_date >= $2 AND due_date <= $3`,
        [orgId, pStartStr, pEndStr]
      );
      const expectedInflows = Number(invRes.rows[0]?.total || 0);

      // Expected Outflows: unpaid bills due in this date range
      const billRes = await db.query(
        `SELECT COALESCE(SUM(balance_due), 0) as total
         FROM bills
         WHERE organization_id = $1
           AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'PAID')
           AND due_date >= $2 AND due_date <= $3`,
        [orgId, pStartStr, pEndStr]
      );
      const expectedOutflows = Number(billRes.rows[0]?.total || 0);

      const netFlow = expectedInflows - expectedOutflows;
      const closingBalance = runningOpening + netFlow;

      periods.push({
        periodLabel: `Month ${i + 1} (${pStartStr.slice(5)} to ${pEndStr.slice(5)})`,
        startDate: pStartStr,
        endDate: pEndStr,
        openingBalance: Math.round(runningOpening * 100) / 100,
        expectedInflows: Math.round(expectedInflows * 100) / 100,
        expectedOutflows: Math.round(expectedOutflows * 100) / 100,
        netFlow: Math.round(netFlow * 100) / 100,
        closingBalance: Math.round(closingBalance * 100) / 100,
      });

      runningOpening = closingBalance;
    }

    return {
      horizonDays,
      currentBankCashBalance: Math.round(currentBankCashBalance * 100) / 100,
      periods,
      projectedClosingBalance: Math.round(runningOpening * 100) / 100,
    };
  }
}
