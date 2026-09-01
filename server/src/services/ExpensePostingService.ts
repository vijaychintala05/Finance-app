import { db, type DbQueryClient } from '../database/db';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { DocumentNumberingEngine } from './DocumentNumberingEngine';
import { newId } from '../utils/ids';
import { isIsoCalendarDate } from '../utils/date';
import { ExpenseReceiptService, type ExpenseReceiptUpload } from './ExpenseReceiptService';

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
      const amount = Number(input.amount);
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

      const accountCheck = await client.query(
        `SELECT id, type, sub_type FROM accounts
          WHERE organization_id = $1 AND id IN ($2, $3)
            AND status = 'Active' AND COALESCE(is_locked, FALSE) = FALSE`,
        [organizationId, input.expenseAccountId, input.paidFromAccountId]
      );
      if (new Set(accountCheck.rows.map((row) => row.id)).size !== 2) {
        throw new Error('EXPENSE_ACCOUNT_INVALID: Both accounts must be active and unlocked in this organization');
      }
      const expenseAccount = accountCheck.rows.find((account) => account.id === input.expenseAccountId);
      const paymentAccount = accountCheck.rows.find((account) => account.id === input.paidFromAccountId);
      if (expenseAccount?.type !== 'Expense' || paymentAccount?.type !== 'Asset' ||
          !['bank', 'cash', 'cash & bank', 'digital wallet'].includes(String(paymentAccount.sub_type || '').toLowerCase())) {
        throw new Error('EXPENSE_ACCOUNT_TYPE_INVALID: Debit an expense account and credit a bank, cash, or wallet account');
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
      await client.query(
        `INSERT INTO expenses
          (id, organization_id, expense_number, expense_account_id, paid_from_account_id,
           vendor_name, date, amount, description, project_id, client_id, is_billable, source_occurrence_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [id, organizationId, expenseNumber, input.expenseAccountId, input.paidFromAccountId,
          input.vendorName || '', input.date, amount, input.description || '', input.projectId || null,
          input.clientId || null, Boolean(input.isBillable), input.sourceOccurrenceKey || null]
      );
      const receiptAttachments = await ExpenseReceiptService.attachToExpense(client, organizationId, id, receipts);
      const posting = await ServerPostingEngine.postEntry({
        organizationId,
        entryNumber: `JRN-EXP-${id}`,
        date: input.date,
        reference: expenseNumber,
        description: `Expense paid to ${input.vendorName || 'Vendor'}`,
        lines: [
          { accountId: input.expenseAccountId, debit: amount, credit: 0, projectId: input.projectId, customerId: input.clientId },
          { accountId: input.paidFromAccountId, debit: 0, credit: amount, projectId: input.projectId, customerId: input.clientId },
        ],
      }, client);
      await client.query(
        `UPDATE expenses SET journal_entry_id = $1 WHERE organization_id = $2 AND id = $3`,
        [posting.entryId, organizationId, id]
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'EXPENSE_CREATED', 'Expense', $4, $5)`,
        [newId('aud'), organizationId, userId, id, JSON.stringify({ amount, expenseNumber, journalEntryId: posting.entryId })]
      );
      return { id, expenseNumber, amount, journalEntryId: posting.entryId, receiptAttachments };
    };
    return transactionClient ? execute(transactionClient) : db.transaction(execute);
  }
}
