import { db } from '../database/db';

export class LedgerQueryService {
  public static async getGeneralLedgerReport(
    orgId: string,
    options: {
      accountId?: string;
      fromDate?: string;
      toDate?: string;
      projectId?: string;
      customerId?: string;
      vendorId?: string;
      businessLine?: string;
      locationId?: string;
      costCenterId?: string;
      search?: string;
    } = {}
  ) {
    let sql = `
      SELECT 
        a.id as account_id, a.code as account_code, a.name as account_name, a.type as account_type,
        je.id as journal_entry_id, je.entry_number, je.date as entry_date, je.reference, je.description as narration,
        jl.debit, jl.credit
      FROM accounts a
      JOIN journal_lines jl ON a.id = jl.account_id
      JOIN journal_entries je ON jl.journal_entry_id = je.id
      WHERE a.organization_id = $1 AND UPPER(je.status) = 'POSTED'
    `;
    const params: any[] = [orgId];

    if (options.accountId) {
      params.push(options.accountId);
      sql += ` AND a.id = $${params.length}`;
    }
    if (options.fromDate) {
      params.push(options.fromDate);
      sql += ` AND je.date >= $${params.length}`;
    }
    if (options.toDate) {
      params.push(options.toDate);
      sql += ` AND je.date <= $${params.length}`;
    }

    sql += ` ORDER BY a.code ASC, je.date ASC, je.created_at ASC`;

    const res = await db.query(sql, params);

    const accountsMap = new Map<string, any>();
    for (const row of res.rows) {
      if (!accountsMap.has(row.account_id)) {
        accountsMap.set(row.account_id, {
          accountId: row.account_id,
          accountCode: row.account_code,
          accountName: row.account_name,
          accountType: row.account_type,
          transactions: [],
          totalDebit: 0,
          totalCredit: 0,
          netBalance: 0,
        });
      }
      const acc = accountsMap.get(row.account_id)!;
      const deb = Number(row.debit || 0);
      const cred = Number(row.credit || 0);
      acc.transactions.push({
        journalEntryId: row.journal_entry_id,
        entryNumber: row.entry_number,
        entryDate: row.entry_date,
        reference: row.reference,
        narration: row.narration,
        debit: deb,
        credit: cred,
      });
      acc.totalDebit += deb;
      acc.totalCredit += cred;
    }

    const accounts = Array.from(accountsMap.values()).map((a) => ({
      ...a,
      totalDebit: Math.round(a.totalDebit * 100) / 100,
      totalCredit: Math.round(a.totalCredit * 100) / 100,
      netBalance: Math.round((a.totalDebit - a.totalCredit) * 100) / 100,
    }));

    return {
      organizationId: orgId,
      fromDate: options.fromDate || null,
      toDate: options.toDate || null,
      accounts,
    };
  }

  public static async getAccountBalances(
    orgId: string,
    options: { fromDate?: string; toDate?: string; accountIds?: string[] } = {}
  ) {
    let sql = `
      SELECT 
        a.id, a.code, a.name, a.type,
        COALESCE(SUM(jl.debit), 0) as total_debit,
        COALESCE(SUM(jl.credit), 0) as total_credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON a.id = jl.account_id
      LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id AND UPPER(je.status) = 'POSTED'
      WHERE a.organization_id = $1
    `;
    const params: any[] = [orgId];

    if (options.fromDate) {
      params.push(options.fromDate);
      sql += ` AND (je.date IS NULL OR je.date >= $${params.length})`;
    }
    if (options.toDate) {
      params.push(options.toDate);
      sql += ` AND (je.date IS NULL OR je.date <= $${params.length})`;
    }

    sql += ` GROUP BY a.id, a.code, a.name, a.type ORDER BY a.code ASC`;

    const res = await db.query(sql, params);
    return res.rows.map((r: any) => {
      const deb = Number(r.total_debit || 0);
      const cred = Number(r.total_credit || 0);
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        type: r.type,
        totalDebit: deb,
        totalCredit: cred,
        netBalance: ['ASSET', 'EXPENSE'].includes(r.type?.toUpperCase()) ? deb - cred : cred - deb,
      };
    });
  }
}
