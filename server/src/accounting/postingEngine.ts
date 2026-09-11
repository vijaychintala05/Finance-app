import { db, DbQueryResult } from '../database/db';
import { newId } from '../utils/ids';
import { centsToSafeNumber, moneyInputToCents } from '../utils/money';
import { isIsoCalendarDate } from '../utils/date';
import { TenantRecoveryLockService } from '../recovery/TenantRecoveryLockService';

export interface JournalLineItem {
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debit: number;
  credit: number;
  description?: string;
  projectId?: string;
  customerId?: string;
  vendorId?: string;
}

export interface PostJournalPayload {
  organizationId: string;
  entryNumber: string;
  date: string;
  reference?: string;
  description: string;
  lines: JournalLineItem[];
  reversalOfJournalId?: string;
  reversalReason?: string;
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

export function resolveAccountNormalBalance(account: {
  normal_balance?: string;
  normal_balance_is_explicit?: boolean;
  type?: string;
}): 'Debit' | 'Credit' {
  if (account.normal_balance_is_explicit && (account.normal_balance === 'Debit' || account.normal_balance === 'Credit')) {
    return account.normal_balance;
  }
  return ['Liability', 'Equity', 'Income', 'Revenue', 'Other Income'].includes(account.type || '') ? 'Credit' : 'Debit';
}

export class ServerPostingEngine {
  public static async postExistingDraft(
    organizationId: string,
    journalEntryId: string,
    transactionClient?: QueryClient
  ): Promise<{ entryId: string }> {
    const execute = async (client: QueryClient): Promise<{ entryId: string }> => {
      await TenantRecoveryLockService.assertNotLocked(organizationId, client);
      const headerResult = await client.query(
        `SELECT id, date, status
           FROM journal_entries
          WHERE organization_id = $1 AND id = $2
          FOR UPDATE`,
        [organizationId, journalEntryId]
      );
      if (headerResult.rows.length !== 1) throw new Error('JOURNAL_DRAFT_NOT_FOUND: Journal draft does not exist');
      if (String(headerResult.rows[0].status).toUpperCase() === 'POSTED') {
        throw new Error('JOURNAL_ALREADY_POSTED: This journal is already posted');
      }
      const date = headerResult.rows[0].date instanceof Date
        ? headerResult.rows[0].date.toISOString().slice(0, 10)
        : String(headerResult.rows[0].date).slice(0, 10);
      if (!isIsoCalendarDate(date)) throw new Error('Journal date must use YYYY-MM-DD format');

      const periodLock = await client.query(
        `SELECT id FROM period_locks
          WHERE organization_id = $1 AND status = 'Active' AND lock_date >= $2
          LIMIT 1`,
        [organizationId, date]
      );
      if (periodLock.rows.length > 0) throw new Error(`Accounting period is locked for ${date}`);

      const lineResult = await client.query(
        `SELECT id, account_id, debit, credit, project_id, customer_id, vendor_id
           FROM journal_lines
          WHERE organization_id = $1 AND journal_entry_id = $2
          ORDER BY id`,
        [organizationId, journalEntryId]
      );
      if (lineResult.rows.length < 2) throw new Error('A journal requires at least two lines');

      let debitCents = 0n;
      let creditCents = 0n;
      const verified: Array<{ accountId: string; debit: number; credit: number; normalBalance: 'Debit' | 'Credit'; code: string; name: string }> = [];
      for (const [index, line] of lineResult.rows.entries()) {
        const debit = asMoney(line.debit, `lines[${index}].debit`);
        const credit = asMoney(line.credit, `lines[${index}].credit`);
        if ((debit.cents === 0n) === (credit.cents === 0n)) {
          throw new Error(`Journal line ${index + 1} must have exactly one positive debit or credit`);
        }
        debitCents += debit.cents;
        creditCents += credit.cents;
        const accountResult = await client.query(
          `SELECT id, code, name, type, normal_balance, normal_balance_is_explicit, is_locked, status, allow_direct_posting
             FROM accounts
            WHERE organization_id = $1 AND id = $2`,
          [organizationId, line.account_id]
        );
        if (accountResult.rows.length !== 1) throw new Error(`Account ${line.account_id} does not belong to this organization`);
        const account = accountResult.rows[0];
        if (account.is_locked || account.status !== 'Active' || account.allow_direct_posting === false) {
          throw new Error(`Account ${line.account_id} is locked or inactive`);
        }
        verified.push({
          accountId: account.id,
          debit: debit.amount,
          credit: credit.amount,
          normalBalance: resolveAccountNormalBalance(account),
          code: account.code,
          name: account.name,
        });
      }
      if (debitCents !== creditCents || debitCents === 0n) {
        throw new Error(`Journal is unbalanced: debit=${formatCents(debitCents)}, credit=${formatCents(creditCents)}`);
      }

      for (const line of verified) {
        const balanceDelta = line.normalBalance === 'Debit' ? line.debit - line.credit : line.credit - line.debit;
        await client.query(
          `UPDATE journal_lines SET account_code = $1, account_name = $2
            WHERE organization_id = $3 AND journal_entry_id = $4 AND account_id = $5`,
          [line.code, line.name, organizationId, journalEntryId, line.accountId]
        );
        await client.query(
          'UPDATE accounts SET balance = COALESCE(balance, 0) + $1 WHERE id = $2 AND organization_id = $3',
          [balanceDelta, line.accountId, organizationId]
        );
        await client.query(
          'UPDATE bank_accounts SET current_balance = COALESCE(current_balance, 0) + $1, updated_at = CURRENT_TIMESTAMP WHERE (ledger_account_id = $2 OR id = $2) AND organization_id = $3',
          [balanceDelta, line.accountId, organizationId]
        );
      }
      const updated = await client.query(
        `UPDATE journal_entries SET status = 'Posted'
          WHERE organization_id = $1 AND id = $2 AND UPPER(status) <> 'POSTED'`,
        [organizationId, journalEntryId]
      );
      if (updated.rowCount !== 1) throw new Error('Journal state changed concurrently');
      return { entryId: journalEntryId };
    };
    return transactionClient ? execute(transactionClient) : db.transaction(execute);
  }

  public static async postEntry(payload: PostJournalPayload, transactionClient?: QueryClient): Promise<{ entryId: string }> {
    const execute = async (client: QueryClient): Promise<{ entryId: string }> => {
      await TenantRecoveryLockService.assertNotLocked(payload.organizationId, client);
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
          `SELECT id, code, name, type, normal_balance, normal_balance_is_explicit, is_locked, status, allow_direct_posting
             FROM accounts
            WHERE id = $1 AND organization_id = $2`,
          [line.accountId, payload.organizationId]
        );
        if (account.rows.length === 0) throw new Error(`Account ${line.accountId} does not belong to this organization`);
        if (account.rows[0].is_locked || account.rows[0].status !== 'Active' || account.rows[0].allow_direct_posting === false) {
          throw new Error(`Account ${line.accountId} is locked or inactive`);
        }
        if (line.projectId) {
          const project = await client.query(
            `SELECT id FROM projects WHERE id = $1 AND organization_id = $2`,
            [line.projectId, payload.organizationId]
          );
          if (project.rows.length !== 1) throw new Error(`Project ${line.projectId} does not belong to this organization`);
        }
        if (line.customerId) {
          const customer = await client.query(
            `SELECT id FROM clients WHERE id = $1 AND organization_id = $2
             UNION ALL
             SELECT id FROM customers WHERE id = $1 AND organization_id = $2
             LIMIT 1`,
            [line.customerId, payload.organizationId]
          );
          if (customer.rows.length === 0) throw new Error(`Customer ${line.customerId} does not belong to this organization`);
        }
        if (line.vendorId) {
          const vendor = await client.query(
            `SELECT id FROM vendors WHERE id = $1 AND organization_id = $2`,
            [line.vendorId, payload.organizationId]
          );
          if (vendor.rows.length !== 1) throw new Error(`Vendor ${line.vendorId} does not belong to this organization`);
        }
        line.accountCode = account.rows[0].code;
        line.accountName = account.rows[0].name;
        (line as JournalLineItem & { normalBalance: string }).normalBalance = resolveAccountNormalBalance(account.rows[0]);
      }

      const duplicate = await client.query(
        'SELECT id FROM journal_entries WHERE organization_id = $1 AND entry_number = $2',
        [payload.organizationId, payload.entryNumber]
      );
      if (duplicate.rows.length > 0) throw new Error(`Journal entry number ${payload.entryNumber} already exists`);

      const entryId = newId('jrn');
      await client.query(
        `INSERT INTO journal_entries
          (id, organization_id, entry_number, date, reference, description, status, reversal_of_journal_id, reversal_reason)
         VALUES ($1, $2, $3, $4, $5, $6, 'Posted', $7, $8)`,
        [entryId, payload.organizationId, payload.entryNumber.trim(), payload.date, payload.reference || '', payload.description, payload.reversalOfJournalId || null, payload.reversalReason || null]
      );

      for (const line of normalizedLines) {
        await client.query(
          `INSERT INTO journal_lines
            (id, journal_entry_id, organization_id, account_id, account_code, account_name, debit, credit, description, project_id, customer_id, vendor_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [newId('jln'), entryId, payload.organizationId, line.accountId, line.accountCode, line.accountName, line.debit, line.credit, line.description || '', line.projectId || null, line.customerId || null, line.vendorId || null]
        );
        const normalDebit = (line as JournalLineItem & { normalBalance: string }).normalBalance === 'Debit';
        const balanceDelta = normalDebit ? line.debit - line.credit : line.credit - line.debit;
        await client.query(
          'UPDATE accounts SET balance = COALESCE(balance, 0) + $1 WHERE id = $2 AND organization_id = $3',
          [balanceDelta, line.accountId, payload.organizationId]
        );
        await client.query(
          'UPDATE bank_accounts SET current_balance = COALESCE(current_balance, 0) + $1, updated_at = CURRENT_TIMESTAMP WHERE (ledger_account_id = $2 OR id = $2) AND organization_id = $3',
          [balanceDelta, line.accountId, payload.organizationId]
        );
      }

      return { entryId };
    };

    return transactionClient ? execute(transactionClient) : db.transaction(execute);
  }
}
