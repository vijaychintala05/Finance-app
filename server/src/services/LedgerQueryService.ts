import { db } from '../database/db';
import { centsToSafeNumber, databaseMoneyToCents } from '../utils/money';

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
    if (options.projectId || options.customerId || options.vendorId || options.businessLine || options.locationId || options.costCenterId || options.search) {
      throw new Error('The requested general-ledger dimension is not implemented');
    }
    if (options.fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(options.fromDate)) throw new Error('Invalid general ledger start date');
    if (options.toDate && !/^\d{4}-\d{2}-\d{2}$/.test(options.toDate)) throw new Error('Invalid general ledger end date');
    if (options.fromDate && options.toDate && options.fromDate > options.toDate) throw new Error('General ledger start date cannot be after end date');

    let sql = `
      SELECT 
        a.id as account_id, a.code as account_code, a.name as account_name, a.type as account_type,
        je.id as journal_entry_id, je.entry_number, je.date as entry_date, je.reference, je.description as narration,
        jl.debit, jl.credit
      FROM accounts a
      JOIN journal_lines jl ON a.id = jl.account_id
      JOIN journal_entries je ON jl.journal_entry_id = je.id AND je.organization_id = a.organization_id
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
      const debitCents = databaseMoneyToCents(row.debit, `General ledger debit for ${row.entry_number}`);
      const creditCents = databaseMoneyToCents(row.credit, `General ledger credit for ${row.entry_number}`);
      const deb = centsToSafeNumber(debitCents, `General ledger debit for ${row.entry_number}`);
      const cred = centsToSafeNumber(creditCents, `General ledger credit for ${row.entry_number}`);
      acc.transactions.push({
        journalEntryId: row.journal_entry_id,
        entryNumber: row.entry_number,
        entryDate: row.entry_date,
        reference: row.reference,
        narration: row.narration,
        debit: deb,
        credit: cred,
      });
      acc.totalDebitCents = (acc.totalDebitCents || 0n) + debitCents;
      acc.totalCreditCents = (acc.totalCreditCents || 0n) + creditCents;
    }

    const accounts = Array.from(accountsMap.values()).map((a) => {
      const totalDebitCents = BigInt(a.totalDebitCents ?? 0);
      const totalCreditCents = BigInt(a.totalCreditCents ?? 0);
      return {
        ...a,
        totalDebit: centsToSafeNumber(totalDebitCents, `General ledger total debit for ${a.accountCode}`),
        totalCredit: centsToSafeNumber(totalCreditCents, `General ledger total credit for ${a.accountCode}`),
        netBalance: centsToSafeNumber(totalDebitCents - totalCreditCents, `General ledger net balance for ${a.accountCode}`),
      };
    });

    for (const account of accounts) {
      delete account.totalDebitCents;
      delete account.totalCreditCents;
    }

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
    if (options.fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(options.fromDate)) throw new Error('Invalid account balance start date');
    if (options.toDate && !/^\d{4}-\d{2}-\d{2}$/.test(options.toDate)) throw new Error('Invalid account balance end date');
    if (options.fromDate && options.toDate && options.fromDate > options.toDate) throw new Error('Account balance start date cannot be after end date');
    const params: any[] = [orgId];
    let postedJournalJoin = `jl.journal_entry_id = je.id AND je.organization_id = a.organization_id AND UPPER(je.status) = 'POSTED'`;
    if (options.fromDate) {
      params.push(options.fromDate);
      postedJournalJoin += ` AND je.date >= $${params.length}`;
    }
    if (options.toDate) {
      params.push(options.toDate);
      postedJournalJoin += ` AND je.date <= $${params.length}`;
    }

    let sql = `
      SELECT 
        a.id, a.code, a.name, a.type,
        COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit ELSE 0 END), 0) as total_debit,
        COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit ELSE 0 END), 0) as total_credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON a.id = jl.account_id
      LEFT JOIN journal_entries je ON ${postedJournalJoin}
      WHERE a.organization_id = $1
    `;
    if (options.accountIds) {
      if (!Array.isArray(options.accountIds) || options.accountIds.length === 0 || options.accountIds.some((id) => typeof id !== 'string' || !id)) {
        throw new Error('Account balance account IDs are invalid');
      }
      params.push(options.accountIds);
      sql += ` AND a.id = ANY($${params.length}::text[])`;
    }

    sql += ` GROUP BY a.id, a.code, a.name, a.type ORDER BY a.code ASC`;

    const res = await db.query(sql, params);
    return res.rows.map((r: any) => {
      const debCents = databaseMoneyToCents(r.total_debit, `Account balance debit for ${r.code}`);
      const credCents = databaseMoneyToCents(r.total_credit, `Account balance credit for ${r.code}`);
      const normalDebit = ['ASSET', 'EXPENSE', 'COST OF GOODS SOLD', 'OTHER EXPENSE'].includes(r.type?.toUpperCase());
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        type: r.type,
        totalDebit: centsToSafeNumber(debCents, `Account balance debit for ${r.code}`),
        totalCredit: centsToSafeNumber(credCents, `Account balance credit for ${r.code}`),
        netBalance: centsToSafeNumber(normalDebit ? debCents - credCents : credCents - debCents, `Account net balance for ${r.code}`),
      };
    });
  }
}
