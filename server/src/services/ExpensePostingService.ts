import { db, type DbQueryClient } from '../database/db';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { DocumentNumberingEngine } from './DocumentNumberingEngine';
import { newId } from '../utils/ids';
import { isIsoCalendarDate } from '../utils/date';
import { ExpenseReceiptService, type ExpenseReceiptUpload } from './ExpenseReceiptService';

export interface ExpenseItemInput {
  id?: string;
  accountId: string;
  accountName?: string;
  description?: string;
  amount: number;
  projectId?: string;
  clientId?: string;
}

export interface ExpensePostingInput {
  id?: string;
  expenseAccountId: string;
  paidFromAccountId: string;
  vendorName?: string;
  date: string;
  amount: number;
  description?: string;
  projectId?: string;
  clientId?: string;
  isBillable?: boolean;
  sourceOccurrenceKey?: string;
  receiptImages?: ExpenseReceiptUpload[];
  isItemized?: boolean;
  items?: ExpenseItemInput[];
}

export class ExpensePostingService {
  public static async createAndPost(
    organizationId: string,
    userId: string,
    input: ExpensePostingInput,
    transactionClient?: DbQueryClient
  ): Promise<{ id: string; expenseNumber: string; amount: number; journalEntryId: string; receiptAttachments: Array<{ id: string; fileName: string; mimeType: string; byteSize: number }> }> {
    const execute = async (client: DbQueryClient) => {
      const receipts = ExpenseReceiptService.validateUploads(input.receiptImages);

      const isItemized = Boolean(input.isItemized && Array.isArray(input.items) && input.items.length > 0);
      let amount = Number(input.amount);

      if (isItemized) {
        // Validate each item line
        for (const item of input.items!) {
          const itemAmt = Number(item.amount);
          if (!item.accountId || !Number.isFinite(itemAmt) || itemAmt <= 0 || Math.round(itemAmt * 100) / 100 !== itemAmt) {
            throw new Error('EXPENSE_ITEM_INVALID: Every item line requires a valid expense account and positive two-decimal amount');
          }
        }
        const itemSum = input.items!.reduce((sum, it) => sum + Number(it.amount), 0);
        const roundedSum = Math.round(itemSum * 100) / 100;
        if (Number.isFinite(amount) && amount > 0) {
          if (Math.abs(amount - roundedSum) > 0.01) {
            throw new Error(`EXPENSE_AMOUNT_MISMATCH: Header amount (${amount}) does not match the sum of itemized lines (${roundedSum})`);
          }
        } else {
          amount = roundedSum;
        }
      }

      if (!isIsoCalendarDate(input.date) || !input.expenseAccountId || !input.paidFromAccountId ||
          !Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) / 100 !== amount) {
        throw new Error('EXPENSE_INPUT_INVALID: A real date, valid accounts, and a positive two-decimal amount are required');
      }

      const periodLock = await client.query(
        `SELECT id FROM period_locks
          WHERE organization_id = $1 AND status = 'Active' AND lock_date >= $2
          LIMIT 1`,
        [organizationId, input.date]
      );
      if (periodLock.rows.length) throw new Error('EXPENSE_PERIOD_LOCKED: Expense date falls within a locked period');

      // Check all unique accounts involved
      const distinctAccountIds = Array.from(new Set(
        isItemized
          ? [input.paidFromAccountId, input.expenseAccountId, ...input.items!.map(it => it.accountId)]
          : [input.paidFromAccountId, input.expenseAccountId]
      ));

      const placeholders = distinctAccountIds.map((_, i) => String.fromCharCode(36) + (i + 2)).join(', ');
      const accountCheck = await client.query(
        `SELECT id, type, sub_type FROM accounts
          WHERE organization_id = $1 AND id IN (${placeholders})
            AND status = 'Active' AND COALESCE(is_locked, FALSE) = FALSE`,
        [organizationId, ...distinctAccountIds]
      );

      if (accountCheck.rows.length !== distinctAccountIds.length) {
        throw new Error('EXPENSE_ACCOUNT_INVALID: All referenced accounts must be active and unlocked in this organization');
      }

      const paymentAccount = accountCheck.rows.find((account) => account.id === input.paidFromAccountId);
      const isAssetPayment = Boolean(paymentAccount?.type === 'Asset' &&
        ['bank', 'cash', 'cash & bank', 'digital wallet', 'undeposited funds', 'payment clearing'].includes(String(paymentAccount.sub_type || '').toLowerCase()));
      const isLiabilityPayment = Boolean(paymentAccount?.type === 'Liability' &&
        ['credit card', 'credit cards', 'loan/credit'].includes(String(paymentAccount.sub_type || '').toLowerCase()));

      if (!isAssetPayment && !isLiabilityPayment) {
        throw new Error('EXPENSE_ACCOUNT_TYPE_INVALID: Credit a bank, cash, wallet, or credit card account');
      }

      // Check all expense accounts
      const expenseAccountIdsToCheck = isItemized
        ? input.items!.map(it => it.accountId)
        : [input.expenseAccountId];

      for (const accId of expenseAccountIdsToCheck) {
        const acc = accountCheck.rows.find(a => a.id === accId);
        const isExp = Boolean(acc && ['Expense', 'Cost of Goods Sold', 'Other Expense'].includes(acc.type));
        if (!isExp) {
          throw new Error('EXPENSE_ACCOUNT_TYPE_INVALID: All expense lines must debit an Expense or Cost of Goods Sold account');
        }
      }

      if (input.projectId) {
        const project = await client.query(
          `SELECT client_id FROM projects WHERE organization_id = $1 AND id = $2 AND status <> 'Cancelled'`,
          [organizationId, input.projectId]
        );
        if (project.rows.length !== 1) throw new Error('EXPENSE_PROJECT_INVALID: Project is unavailable in this organization');
        if (input.clientId && project.rows[0].client_id && input.clientId !== project.rows[0].client_id) {
          throw new Error('EXPENSE_PROJECT_CUSTOMER_MISMATCH: Customer does not match the selected project');
        }
      }

      const id = input.id || newId('exp');
      const expenseNumber = await DocumentNumberingEngine.getNextNumber(organizationId, 'EXPENSE', input.date, undefined, client);

      const itemsJson = isItemized ? JSON.stringify(input.items) : null;

      await client.query(
        `INSERT INTO expenses
          (id, organization_id, expense_number, expense_account_id, paid_from_account_id,
           vendor_name, date, amount, description, project_id, client_id, is_billable, source_occurrence_key,
           is_itemized, items)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [id, organizationId, expenseNumber, input.expenseAccountId, input.paidFromAccountId,
          input.vendorName || '', input.date, amount, input.description || '', input.projectId || null,
          input.clientId || null, Boolean(input.isBillable), input.sourceOccurrenceKey || null,
          isItemized, itemsJson]
      );
      const receiptAttachments = await ExpenseReceiptService.attachToExpense(client, organizationId, id, receipts);

      // Construct balanced double-entry lines
      const journalLines: Array<{ accountId: string; debit: number; credit: number; description?: string; projectId?: string; customerId?: string }> = [];

      if (isItemized) {
        for (const it of input.items!) {
          journalLines.push({
            accountId: it.accountId,
            debit: Number(it.amount),
            credit: 0,
            description: it.description || input.description || `Expense item`,
            projectId: it.projectId || input.projectId,
            customerId: it.clientId || input.clientId,
          });
        }
      } else {
        journalLines.push({
          accountId: input.expenseAccountId,
          debit: amount,
          credit: 0,
          projectId: input.projectId,
          customerId: input.clientId,
        });
      }

      // Credit the payment account (Bank / Cash / Card)
      journalLines.push({
        accountId: input.paidFromAccountId,
        debit: 0,
        credit: amount,
        projectId: input.projectId,
        customerId: input.clientId,
      });

      const posting = await ServerPostingEngine.postEntry({
        organizationId,
        entryNumber: `JRN-EXP-${id}`,
        date: input.date,
        reference: expenseNumber,
        description: `Expense paid to ${input.vendorName || 'Vendor'}`,
        lines: journalLines,
      }, client);

      await client.query(
        `UPDATE expenses SET journal_entry_id = $1 WHERE organization_id = $2 AND id = $3`,
        [posting.entryId, organizationId, id]
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'EXPENSE_CREATED', 'Expense', $4, $5)`,
        [newId('aud'), organizationId, userId, id, JSON.stringify({ amount, expenseNumber, isItemized, itemsCount: isItemized ? input.items!.length : 1, journalEntryId: posting.entryId })]
      );
      return { id, expenseNumber, amount, journalEntryId: posting.entryId, receiptAttachments };
    };
    return transactionClient ? execute(transactionClient) : db.transaction(execute);
  }
}
