import { db, DbQueryResult } from '../database/db';
import { newId } from '../utils/ids';
import { centsToSafeNumber, moneyInputToCents } from '../utils/money';
import { isIsoCalendarDate } from '../utils/date';

export interface JournalLineItem {
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface PostJournalPayload {
  organizationId: string;
  entryNumber: string;
  date: string;
  reference?: string;
  description: string;
  lines: JournalLineItem[];
}

export interface QueryClient {
  query: (text: string, params?: any[]) => Promise<DbQueryResult>;
}

function asMoney(value: unknown, field: string): { amount: number; cents: bigint } {
  const cents = moneyInputToCents(value, field);
  if (cents < 0n) throw new Error(`${field} must be a non-negative amount`);
  return { amount: centsToSafeNumber(cents, field), cents };
}

function formatCents(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export class ServerPostingEngine {
  public static async postEntry(payload: PostJournalPayload, transactionClient?: QueryClient): Promise<{ entryId: string }> {
    const execute = async (client: QueryClient): Promise<{ entryId: string }> => {
      if (!isIsoCalendarDate(payload.date)) {
        throw new Error('Journal date must use YYYY-MM-DD format');
      }
      if (!payload.entryNumber?.trim() || !payload.organizationId || !Array.isArray(payload.lines) || payload.lines.length < 2) {
        throw new Error('A journal requires an organization, entry number, and at least two lines');
      }

      let debitCents = 0n;
      let creditCents = 0n;
      const normalizedLines = payload.lines.map((line, index) => {
        const debitMoney = asMoney(line.debit, `lines[${index}].debit`);
        const creditMoney = asMoney(line.credit, `lines[${index}].credit`);
        if (!line.accountId || (debitMoney.cents === 0n) === (creditMoney.cents === 0n)) {
          throw new Error(`Journal line ${index + 1} must have an account and exactly one positive debit or credit`);
        }
        debitCents += debitMoney.cents;
        creditCents += creditMoney.cents;
        return { ...line, debit: debitMoney.amount, credit: creditMoney.amount };
      });

      if (debitCents !== creditCents || debitCents === 0n) {
        throw new Error(`Journal is unbalanced: debit=${formatCents(debitCents)}, credit=${formatCents(creditCents)}`);
      }

      const periodLock = await client.query(
        `SELECT id FROM period_locks
          WHERE organization_id = $1 AND status = 'Active' AND lock_date >= $2
          LIMIT 1`,
        [payload.organizationId, payload.date]
      );
      if (periodLock.rows.length > 0) {
        throw new Error(`Accounting period is locked for ${payload.date}`);
      }

      for (const line of normalizedLines) {
        const account = await client.query(
          `SELECT id, code, name, type, is_locked, status
             FROM accounts
            WHERE id = $1 AND organization_id = $2`,
          [line.accountId, payload.organizationId]
        );
        if (account.rows.length === 0) throw new Error(`Account ${line.accountId} does not belong to this organization`);
        if (account.rows[0].is_locked || account.rows[0].status !== 'Active') {
          throw new Error(`Account ${line.accountId} is locked or inactive`);
        }
        line.accountCode = account.rows[0].code;
        line.accountName = account.rows[0].name;
        (line as JournalLineItem & { accountType: string }).accountType = account.rows[0].type;
      }

      const duplicate = await client.query(
        'SELECT id FROM journal_entries WHERE organization_id = $1 AND entry_number = $2',
        [payload.organizationId, payload.entryNumber]
      );
      if (duplicate.rows.length > 0) throw new Error(`Journal entry number ${payload.entryNumber} already exists`);

      const entryId = newId('jrn');
      await client.query(
        `INSERT INTO journal_entries
          (id, organization_id, entry_number, date, reference, description, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'Posted')`,
        [entryId, payload.organizationId, payload.entryNumber.trim(), payload.date, payload.reference || '', payload.description]
      );

      for (const line of normalizedLines) {
        await client.query(
          `INSERT INTO journal_lines
            (id, journal_entry_id, account_id, account_code, account_name, debit, credit, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [newId('jln'), entryId, line.accountId, line.accountCode, line.accountName, line.debit, line.credit, line.description || '']
        );
        const accountType = (line as JournalLineItem & { accountType: string }).accountType;
        const normalDebit = ['Asset', 'Expense', 'Cost of Goods Sold', 'Other Expense'].includes(accountType);
        const balanceDelta = normalDebit ? line.debit - line.credit : line.credit - line.debit;
        await client.query(
          'UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND organization_id = $3',
          [balanceDelta, line.accountId, payload.organizationId]
        );
      }

      return { entryId };
    };

    return transactionClient ? execute(transactionClient) : db.transaction(execute);
  }
}
