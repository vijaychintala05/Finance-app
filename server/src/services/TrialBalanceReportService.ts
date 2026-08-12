import { db } from '../database/db';
import { centsToSafeNumber, databaseMoneyToCents } from '../utils/money';

export class TrialBalanceReportService {
  public static async getTrialBalance(
    orgId: string,
    filter: { fromDate?: string; toDate?: string; projectId?: string } = {}
  ) {
    if (filter.projectId) throw new Error('Project-filtered trial balance is not implemented');
    if (filter.fromDate) throw new Error('Trial balance is an as-of report and does not accept a start date');
    if (filter.toDate && !/^\d{4}-\d{2}-\d{2}$/.test(filter.toDate)) throw new Error('Invalid trial balance end date');

    const params: any[] = [orgId];
    let postedJournalJoin = `jl.journal_entry_id = je.id AND je.organization_id = a.organization_id AND UPPER(je.status) = 'POSTED'`;
    if (filter.toDate) {
      params.push(filter.toDate);
      postedJournalJoin += ` AND je.date <= $${params.length}`;
    }

    const sql = `
      SELECT 
        a.id, a.code, a.name, a.type, a.sub_type,
        COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit ELSE 0 END), 0) as total_debit,
        COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit ELSE 0 END), 0) as total_credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON a.id = jl.account_id
      LEFT JOIN journal_entries je ON ${postedJournalJoin}
      WHERE a.organization_id = $1
      GROUP BY a.id, a.code, a.name, a.type, a.sub_type
      ORDER BY a.code ASC
    `;

    const res = await db.query(sql, params);

    let totalClosingDebitCents = 0n;
    let totalClosingCreditCents = 0n;

    const rows = res.rows.map((r: any) => {
      const activityDebitCents = databaseMoneyToCents(r.total_debit, `Trial balance debit for ${r.code}`);
      const activityCreditCents = databaseMoneyToCents(r.total_credit, `Trial balance credit for ${r.code}`);
      const netCents = activityDebitCents - activityCreditCents;
      const debitCents = netCents > 0n ? netCents : 0n;
      const creditCents = netCents < 0n ? -netCents : 0n;
      const debit = centsToSafeNumber(debitCents, `Trial balance debit for ${r.code}`);
      const credit = centsToSafeNumber(creditCents, `Trial balance credit for ${r.code}`);

      totalClosingDebitCents += debitCents;
      totalClosingCreditCents += creditCents;

      return {
        accountId: r.id,
        accountCode: r.code,
        accountName: r.name,
        accountType: r.type,
        accountSubType: r.sub_type,
        debit,
        credit,
        netBalance: centsToSafeNumber(netCents, `Trial balance net for ${r.code}`),
      };
    });

    const totalClosingDebit = centsToSafeNumber(totalClosingDebitCents, 'Trial balance total debit');
    const totalClosingCredit = centsToSafeNumber(totalClosingCreditCents, 'Trial balance total credit');
    const diff = centsToSafeNumber(totalClosingDebitCents >= totalClosingCreditCents ? totalClosingDebitCents - totalClosingCreditCents : totalClosingCreditCents - totalClosingDebitCents, 'Trial balance difference');

    return {
      organizationId: orgId,
      fromDate: filter.fromDate || null,
      toDate: filter.toDate || null,
      rows,
      totalClosingDebit,
      totalClosingCredit,
      totalDebits: totalClosingDebit,
      totalCredits: totalClosingCredit,
      difference: diff,
      isBalanced: diff === 0,
    };
  }
}
