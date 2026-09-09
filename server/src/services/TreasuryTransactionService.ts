import { db, type DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';
import { isIsoCalendarDate } from '../utils/date';
import { centsToSafeNumber, moneyInputToCents } from '../utils/money';
import { MonetaryAccountPolicy } from '../accounting/monetaryAccountPolicy';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { DocumentNumberingEngine } from './DocumentNumberingEngine';

export const TREASURY_TRANSACTION_TYPES = [
  'PAYROLL_PAYMENT',
  'EMPLOYEE_REIMBURSEMENT',
  'OWNER_CONTRIBUTION',
  'OWNER_WITHDRAWAL',
  'LOAN_RECEIVED',
  'LOAN_REPAYMENT',
  'TAX_PAYMENT',
] as const;

export type TreasuryTransactionType = typeof TREASURY_TRANSACTION_TYPES[number];

export interface TreasuryTransactionInput {
  transactionType: TreasuryTransactionType;
  transactionDate: string;
  /** Immutable accounts.id value; account codes are deliberately not accepted here. */
  monetaryAccountId: string;
  /** Expense, payable, equity, loan, or tax account according to transactionType. */
  counterAccountId: string;
  /** Total cash movement. For loan repayments this equals principalAmount + interestAmount. */
  amount: number;
  principalAmount?: number;
  interestAmount?: number;
  interestExpenseAccountId?: string;
  reference?: string;
  description?: string;
  employeeName?: string;
}

type TreasuryAccount = { id: string; code: string; name: string; type: string; sub_type: string };

function money(value: unknown, field: string, allowZero = false): number {
  const cents = moneyInputToCents(value, field);
  if (cents < 0n || (!allowZero && cents === 0n)) throw new Error(`${field.toUpperCase()}_INVALID: A positive exact monetary amount is required`);
  return centsToSafeNumber(cents, field);
}

function isExpense(account: TreasuryAccount): boolean {
  return ['Expense', 'Cost of Goods Sold', 'Other Expense'].includes(String(account.type));
}

/**
 * Durable source documents for actual cash movements that are not customer or vendor settlements.
 * Every create/reverse operation deliberately owns its source row and GL posting in one transaction.
 */
export class TreasuryTransactionService {
  private static async accountByImmutableId(
    client: DbQueryClient,
    organizationId: string,
    accountId: string,
    field: string
  ): Promise<TreasuryAccount> {
    if (!accountId || typeof accountId !== 'string') throw new Error(`${field.toUpperCase()}_REQUIRED: An immutable account ID is required`);
    const result = await client.query<TreasuryAccount>(
      `SELECT id, code, name, type, sub_type
         FROM accounts
        WHERE organization_id = $1 AND id = $2
          AND status = 'Active'
          AND COALESCE(is_locked, FALSE) = FALSE
          AND COALESCE(allow_direct_posting, TRUE) = TRUE`,
      [organizationId, accountId]
    );
    if (result.rows.length !== 1) throw new Error(`${field.toUpperCase()}_INVALID: Account is unavailable in this organization`);
    return result.rows[0];
  }

  private static validateCounterAccount(type: TreasuryTransactionType, account: TreasuryAccount): void {
    const accountType = String(account.type || '');
    const subType = String(account.sub_type || '').toLowerCase();
    if (type === 'OWNER_CONTRIBUTION' || type === 'OWNER_WITHDRAWAL') {
      if (accountType !== 'Equity') throw new Error('TREASURY_COUNTER_ACCOUNT_TYPE_INVALID: Owner contributions and drawings require an Equity account');
      return;
    }
    if (type === 'LOAN_RECEIVED' || type === 'LOAN_REPAYMENT') {
      if (accountType !== 'Liability' || subType.includes('credit card')) {
        throw new Error('TREASURY_COUNTER_ACCOUNT_TYPE_INVALID: Loan movements require a non-credit-card Liability account');
      }
      return;
    }
    if (type === 'TAX_PAYMENT') {
      if (accountType !== 'Liability' || !subType.includes('tax')) {
        throw new Error('TREASURY_COUNTER_ACCOUNT_TYPE_INVALID: Tax payments require a Taxes Payable liability account');
      }
      return;
    }
    if (isExpense(account)) return;
    if (accountType === 'Liability' && (subType.includes('payroll') || subType.includes('employee'))) return;
    throw new Error('TREASURY_COUNTER_ACCOUNT_TYPE_INVALID: Payroll and reimbursement payments require an expense or employee/payroll payable account');
  }

  public static async create(
    organizationId: string,
    userId: string,
    input: TreasuryTransactionInput,
    transactionClient?: DbQueryClient
  ): Promise<{ id: string; transactionNumber: string; journalEntryId: string }> {
    const execute = async (client: DbQueryClient) => {
      if (!TREASURY_TRANSACTION_TYPES.includes(input.transactionType)) throw new Error('TREASURY_TRANSACTION_TYPE_INVALID');
      if (!isIsoCalendarDate(input.transactionDate)) throw new Error('TREASURY_TRANSACTION_DATE_INVALID: Use YYYY-MM-DD');

      const amount = money(input.amount, 'amount');
      const monetary = await MonetaryAccountPolicy.resolve(client, organizationId, input.monetaryAccountId, input.transactionType === 'OWNER_CONTRIBUTION' || input.transactionType === 'LOAN_RECEIVED' ? 'INFLOW' : 'OUTFLOW', 'monetary_account');
      if (monetary.id !== input.monetaryAccountId) throw new Error('MONETARY_ACCOUNT_ID_REQUIRED: Select the monetary account by immutable account ID');
      const counter = await this.accountByImmutableId(client, organizationId, input.counterAccountId, 'counter_account');
      this.validateCounterAccount(input.transactionType, counter);

      let principalAmount = amount;
      let interestAmount = 0;
      let interestAccount: TreasuryAccount | undefined;
      if (input.transactionType === 'LOAN_REPAYMENT') {
        principalAmount = money(input.principalAmount ?? amount, 'principal_amount');
        interestAmount = money(input.interestAmount ?? 0, 'interest_amount', true);
        if (moneyInputToCents(principalAmount, 'principal_amount') + moneyInputToCents(interestAmount, 'interest_amount') !== moneyInputToCents(amount, 'amount')) {
          throw new Error('LOAN_REPAYMENT_TOTAL_INVALID: amount must equal principalAmount plus interestAmount');
        }
        if (interestAmount > 0) {
          interestAccount = await this.accountByImmutableId(client, organizationId, input.interestExpenseAccountId || '', 'interest_expense_account');
          if (!isExpense(interestAccount)) throw new Error('INTEREST_EXPENSE_ACCOUNT_TYPE_INVALID: Interest requires an expense account');
        } else if (input.interestExpenseAccountId) {
          throw new Error('INTEREST_EXPENSE_ACCOUNT_UNUSED: Do not provide an interest expense account when interestAmount is zero');
        }
      } else if (input.principalAmount !== undefined || input.interestAmount !== undefined || input.interestExpenseAccountId) {
        throw new Error('TREASURY_FIELDS_INVALID: Principal and interest fields are only valid for loan repayments');
      }

      const id = newId('try');
      const journalNumber = await DocumentNumberingEngine.getNextNumber(organizationId, 'JOURNAL', input.transactionDate, undefined, client);
      const transactionNumber = `TRS-${id}`;
      const isInflow = input.transactionType === 'OWNER_CONTRIBUTION' || input.transactionType === 'LOAN_RECEIVED';
      const lines = isInflow
        ? [
            { accountId: monetary.id, debit: amount, credit: 0, description: input.description || input.transactionType },
            { accountId: counter.id, debit: 0, credit: amount, description: input.description || input.transactionType },
          ]
        : [
            { accountId: counter.id, debit: principalAmount, credit: 0, description: input.description || input.transactionType },
            ...(interestAccount ? [{ accountId: interestAccount.id, debit: interestAmount, credit: 0, description: `${input.description || input.transactionType} interest` }] : []),
            { accountId: monetary.id, debit: 0, credit: amount, description: input.description || input.transactionType },
          ];

      const posting = await ServerPostingEngine.postEntry({
        organizationId,
        entryNumber: journalNumber,
        date: input.transactionDate,
        reference: input.reference || transactionNumber,
        description: input.description || input.transactionType.replaceAll('_', ' '),
        lines,
      }, client);

      await client.query(
        `INSERT INTO treasury_transactions (
           id, organization_id, transaction_number, transaction_type, transaction_date,
           monetary_account_id, counter_account_id, amount, principal_amount,
           interest_amount, interest_expense_account_id, employee_name, reference, description,
           status, journal_entry_id, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'POSTED', $15, $16)`,
        [id, organizationId, transactionNumber, input.transactionType, input.transactionDate,
          monetary.id, counter.id, amount, principalAmount, interestAmount, interestAccount?.id || null,
          input.employeeName?.trim() || null, input.reference?.trim() || null, input.description?.trim() || null,
          posting.entryId, userId]
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'TREASURY_TRANSACTION_POSTED', 'TreasuryTransaction', $4, $5)`,
        [newId('aud'), organizationId, userId, id, JSON.stringify({ transactionNumber, transactionType: input.transactionType, amount, journalEntryId: posting.entryId })]
      );
      return { id, transactionNumber, journalEntryId: posting.entryId };
    };
    return transactionClient ? execute(transactionClient) : db.transaction(execute);
  }

  public static async reverse(
    organizationId: string,
    transactionId: string,
    userId: string,
    reason: string
  ): Promise<{ id: string; reversalJournalEntryId: string }> {
    return db.transaction(async (client) => {
      const source = await client.query(
        `SELECT * FROM treasury_transactions WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, transactionId]
      );
      if (source.rows.length !== 1) throw new Error('TREASURY_TRANSACTION_NOT_FOUND');
      const transaction = source.rows[0];
      if (String(transaction.status).toUpperCase() !== 'POSTED') throw new Error('TREASURY_TRANSACTION_ALREADY_REVERSED');
      const reversalJournalEntryId = await FinancialDestructiveActionsService.reversePostedJournal(
        client, organizationId, transaction.journal_entry_id, userId, reason, 'Treasury transaction'
      );
      await client.query(
        `UPDATE treasury_transactions
            SET status = 'REVERSED', reversal_journal_id = $1, reversed_at = CURRENT_TIMESTAMP,
                reversed_by = $2, reversal_reason = $3
          WHERE organization_id = $4 AND id = $5 AND status = 'POSTED'`,
        [reversalJournalEntryId, userId, reason, organizationId, transactionId]
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'TREASURY_TRANSACTION_REVERSED', 'TreasuryTransaction', $4, $5, $6)`,
        [newId('aud'), organizationId, userId, transactionId, JSON.stringify({ status: 'POSTED' }), JSON.stringify({ status: 'REVERSED', reversalJournalEntryId, reason })]
      );
      return { id: transactionId, reversalJournalEntryId };
    });
  }

  public static async list(organizationId: string): Promise<any[]> {
    return (await db.query(
      `SELECT * FROM treasury_transactions WHERE organization_id = $1 ORDER BY transaction_date DESC, created_at DESC`,
      [organizationId]
    )).rows;
  }
}
