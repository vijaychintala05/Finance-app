import { db } from '../database/db';

type CashFlowCategory = 'operating' | 'investing' | 'financing';

interface CashFlowLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
}

function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function classifyCounterpart(account: { type?: string; sub_type?: string; name?: string }): CashFlowCategory {
  const type = (account.type || '').toUpperCase();
  const text = `${account.sub_type || ''} ${account.name || ''}`.toUpperCase();
  if (type === 'EQUITY' || type === 'LIABILITY' || type === 'LONG TERM LIABILITY') return 'financing';
  if (type === 'ASSET' && /(FIXED|PROPERTY|PLANT|EQUIPMENT|VEHICLE|INVESTMENT|INTANGIBLE)/.test(text)) return 'investing';
  return 'operating';
}

export class CashFlowStatementService {
  public static async getCashFlowStatement(orgId: string, filter: { fromDate?: string; toDate?: string } = {}) {
    const fromDate = filter.fromDate || '2026-04-01';
    const toDate = filter.toDate || new Date().toISOString().split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate) || fromDate > toDate) {
      throw new Error('Cash flow report requires a valid date range');
    }

    const bankAccountsRes = await db.query(
      `SELECT id FROM accounts WHERE organization_id = $1
       AND (UPPER(sub_type) = 'BANK' OR UPPER(name) LIKE '%CASH%' OR UPPER(name) LIKE '%BANK%')`,
      [orgId]
    );
    const bankAccountIds = bankAccountsRes.rows.map((row: any) => row.id);
    if (bankAccountIds.length === 0) return this.emptyReport(orgId, fromDate, toDate);

    const openingRes = await db.query(
      `SELECT COALESCE(SUM(jl.debit), 0) AS total_debit, COALESCE(SUM(jl.credit), 0) AS total_credit
       FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.organization_id = $1 AND jl.account_id = ANY($2::text[]) AND UPPER(je.status) = 'POSTED' AND je.date < $3`,
      [orgId, bankAccountIds, fromDate]
    );
    const openingCashBalance = Number(openingRes.rows[0]?.total_debit || 0) - Number(openingRes.rows[0]?.total_credit || 0);

    const entryLinesRes = await db.query(
      `SELECT je.id AS journal_entry_id, a.id AS account_id, a.code AS account_code, a.name AS account_name,
              a.type AS account_type, a.sub_type AS account_sub_type, jl.debit, jl.credit
       FROM journal_entries je
       JOIN journal_lines jl ON jl.journal_entry_id = je.id
       JOIN accounts a ON a.id = jl.account_id AND a.organization_id = je.organization_id
       WHERE je.organization_id = $1 AND UPPER(je.status) = 'POSTED' AND je.date >= $2 AND je.date <= $3
       ORDER BY je.id ASC, a.code ASC`,
      [orgId, fromDate, toDate]
    );

    const cashAccountIds = new Set(bankAccountIds);
    const entries = new Map<string, any[]>();
    for (const row of entryLinesRes.rows) entries.set(row.journal_entry_id, [...(entries.get(row.journal_entry_id) || []), row]);
    const buckets: Record<CashFlowCategory, Map<string, CashFlowLine>> = { operating: new Map(), investing: new Map(), financing: new Map() };
    let netCashFlow = 0;

    for (const lines of entries.values()) {
      const cashMovement = lines.filter((line) => cashAccountIds.has(line.account_id))
        .reduce((total, line) => total + Number(line.debit || 0) - Number(line.credit || 0), 0);
      if (Math.abs(cashMovement) < 0.00001) continue;
      netCashFlow += cashMovement;
      const counterparts = lines.filter((line) => !cashAccountIds.has(line.account_id));
      const totalWeight = counterparts.reduce((total, line) => total + Math.abs(Number(line.debit || 0) - Number(line.credit || 0)), 0);
      if (totalWeight < 0.00001) continue;

      let allocated = 0;
      counterparts.forEach((line, index) => {
        const lineWeight = Math.abs(Number(line.debit || 0) - Number(line.credit || 0));
        const amount = index === counterparts.length - 1 ? cashMovement - allocated : cashMovement * (lineWeight / totalWeight);
        allocated += amount;
        const category = classifyCounterpart({ type: line.account_type, sub_type: line.account_sub_type, name: line.account_name });
        const prior = buckets[category].get(line.account_id);
        buckets[category].set(line.account_id, {
          accountId: line.account_id, accountCode: line.account_code, accountName: line.account_name,
          amount: roundMoney((prior?.amount || 0) + amount),
        });
      });
    }

    const linesFor = (category: CashFlowCategory) => Array.from(buckets[category].values()).filter((line) => Math.abs(line.amount) >= 0.01);
    const operatingLines = linesFor('operating');
    const investingLines = linesFor('investing');
    const financingLines = linesFor('financing');
    const totalFor = (lines: CashFlowLine[]) => roundMoney(lines.reduce((total, line) => total + line.amount, 0));
    const operatingTotal = totalFor(operatingLines);
    const investingTotal = totalFor(investingLines);
    const financingTotal = totalFor(financingLines);
    const difference = roundMoney(netCashFlow - operatingTotal - investingTotal - financingTotal);
    const closingCashBalance = roundMoney(openingCashBalance + netCashFlow);

    return {
      organizationId: orgId, fromDate, toDate, openingCashBalance: roundMoney(openingCashBalance),
      operatingActivities: { total: operatingTotal, lines: operatingLines },
      investingActivities: { total: investingTotal, lines: investingLines },
      financingActivities: { total: financingTotal, lines: financingLines },
      netCashFlow: roundMoney(netCashFlow), closingCashBalance, closingCashBankBalance: closingCashBalance,
      isReconciled: Math.abs(difference) < 0.01, isBalanced: Math.abs(difference) < 0.01, reconciledWithGL: Math.abs(difference) < 0.01, difference,
    };
  }

  private static emptyReport(orgId: string, fromDate: string, toDate: string) {
    return {
      organizationId: orgId, fromDate, toDate, openingCashBalance: 0,
      operatingActivities: { total: 0, lines: [] }, investingActivities: { total: 0, lines: [] }, financingActivities: { total: 0, lines: [] },
      netCashFlow: 0, closingCashBalance: 0, closingCashBankBalance: 0,
      isReconciled: true, isBalanced: true, reconciledWithGL: true, difference: 0,
    };
  }
}
