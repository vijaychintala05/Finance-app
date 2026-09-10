import { db, type DbQueryClient } from '../database/db';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { DocumentNumberingEngine } from './DocumentNumberingEngine';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { OrganizationProvisioningService } from './OrganizationProvisioningService';
import { newId } from '../utils/ids';
import { isIsoCalendarDate } from '../utils/date';

function toIsoCalendarDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

export interface CreateClaimItemInput {
  expenseAccountId: string;
  date: string;
  amount: number;
  taxRate?: number;
  taxAmount?: number;
  description?: string;
  projectId?: string;
  clientId?: string;
  receiptUrl?: string;
}

export interface CreateClaimInput {
  claimantId: string;
  claimantName: string;
  claimDate: string;
  title: string;
  description?: string;
  payableAccountId?: string;
  items: CreateClaimItemInput[];
}

export interface RecordPaymentInput {
  claimId: string;
  paymentDate: string;
  amount: number;
  paidFromAccountId: string;
  paymentMethod?: string;
  reference?: string;
  notes?: string;
}

export class EmployeeReimbursementService {
  /**
   * Create an employee expense claim in DRAFT status with validated items.
   */
  public static async createClaim(
    organizationId: string,
    userId: string,
    input: CreateClaimInput,
    transactionClient?: DbQueryClient
  ) {
    const execute = async (client: DbQueryClient) => {
      if (!isIsoCalendarDate(input.claimDate)) {
        throw new Error('CLAIM_DATE_INVALID: A valid calendar date is required');
      }
      if (!input.claimantId || !input.claimantName?.trim()) {
        throw new Error('CLAIMANT_REQUIRED: Claimant ID and name are required');
      }
      if (!input.title?.trim()) {
        throw new Error('CLAIM_TITLE_REQUIRED: A claim title is required');
      }
      if (!Array.isArray(input.items) || input.items.length === 0) {
        throw new Error('CLAIM_ITEMS_REQUIRED: At least one claim item line is required');
      }

      // Check period lock on claim date
      const lockCheck = await client.query(
        `SELECT id FROM period_locks WHERE organization_id = $1 AND status = 'Active' AND lock_date >= $2 LIMIT 1`,
        [organizationId, input.claimDate]
      );
      if (lockCheck.rows.length > 0) {
        throw new Error('CLAIM_PERIOD_LOCKED: Claim date falls within a locked accounting period');
      }

      // Validate all items
      let totalAmount = 0;
      const expenseAccountIds = new Set<string>();

      for (const item of input.items) {
        const amt = Number(item.amount);
        if (!Number.isFinite(amt) || amt <= 0 || Math.round(amt * 100) / 100 !== amt) {
          throw new Error('CLAIM_ITEM_AMOUNT_INVALID: Every claim line requires a positive two-decimal amount');
        }
        if (!isIsoCalendarDate(item.date)) {
          throw new Error('CLAIM_ITEM_DATE_INVALID: Every claim line requires a valid calendar date');
        }
        if (!item.expenseAccountId) {
          throw new Error('CLAIM_ITEM_ACCOUNT_REQUIRED: Every claim line requires an expense account');
        }
        totalAmount += amt;
        expenseAccountIds.add(item.expenseAccountId);
      }
      totalAmount = Math.round(totalAmount * 100) / 100;

      // Validate expense accounts in organization
      const accIds = Array.from(expenseAccountIds);
      const accountPlaceholders = accIds.map((_, index) => `$${index + 2}`).join(', ');
      const accCheck = await client.query(
        `SELECT id, type FROM accounts
         WHERE organization_id = $1 AND id IN (${accountPlaceholders})
           AND status = 'Active' AND COALESCE(is_locked, FALSE) = FALSE`,
        [organizationId, ...accIds]
      );
      if (accCheck.rows.length !== accIds.length) {
        throw new Error('CLAIM_ACCOUNT_INVALID: All expense line accounts must be active and unlocked in this organization');
      }
      for (const acc of accCheck.rows) {
        if (!['Expense', 'Cost of Goods Sold', 'Other Expense'].includes(acc.type)) {
          throw new Error('CLAIM_ACCOUNT_TYPE_INVALID: All claim items must debit an Expense or Cost of Goods Sold account');
        }
      }

      if (input.payableAccountId) {
        const payableCheck = await client.query(
          `SELECT id, type FROM accounts
           WHERE organization_id = $1 AND id = $2 AND status = 'Active' AND COALESCE(is_locked, FALSE) = FALSE`,
          [organizationId, input.payableAccountId]
        );
        if (payableCheck.rows.length !== 1 || payableCheck.rows[0].type !== 'Liability') {
          throw new Error('CLAIM_PAYABLE_ACCOUNT_INVALID: The reimbursement payable account must be an active liability account in this organization');
        }
      }

      const id = newId('clm');
      const claimNumber = await DocumentNumberingEngine.getNextNumber(organizationId, 'EMPLOYEE_CLAIM', input.claimDate, undefined, client);

      await client.query(
        `INSERT INTO employee_claims
           (id, organization_id, claim_number, claimant_id, claimant_name, claim_date,
            title, description, total_amount, approved_amount, paid_amount, status,
            payable_account_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, 'DRAFT', $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, organizationId, claimNumber, input.claimantId, input.claimantName.trim(), input.claimDate,
          input.title.trim(), input.description || '', totalAmount, input.payableAccountId || null]
      );

      for (const item of input.items) {
        const itemId = newId('clmi');
        await client.query(
          `INSERT INTO employee_claim_items
             (id, organization_id, claim_id, expense_account_id, date, amount,
              tax_rate, tax_amount, description, project_id, client_id, receipt_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [itemId, organizationId, id, item.expenseAccountId, item.date, Number(item.amount),
            item.taxRate || 0, item.taxAmount || 0, item.description || '',
            item.projectId || null, item.clientId || null, item.receiptUrl || null]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'EMPLOYEE_CLAIM_CREATED', 'EmployeeClaim', $4, $5)`,
        [newId('aud'), organizationId, userId, id, JSON.stringify({ claimNumber, totalAmount, claimantId: input.claimantId })]
      );

      return {
        id,
        claimNumber,
        claimantId: input.claimantId,
        claimantName: input.claimantName.trim(),
        claimDate: input.claimDate,
        title: input.title.trim(),
        totalAmount,
        status: 'DRAFT',
      };
    };
    return transactionClient ? execute(transactionClient) : db.transaction(execute);
  }

  /**
   * Submit an employee claim for approval.
   */
  public static async submitClaim(
    organizationId: string,
    userId: string,
    claimId: string,
    transactionClient?: DbQueryClient
  ) {
    const execute = async (client: DbQueryClient) => {
      const res = await client.query(
        `SELECT * FROM employee_claims WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, claimId]
      );
      if (res.rows.length !== 1) throw new Error('CLAIM_NOT_FOUND: Employee claim not found');
      const claim = res.rows[0];
      if (claim.status !== 'DRAFT' && claim.status !== 'REJECTED') {
        throw new Error(`CLAIM_NOT_SUBMITTABLE: Only DRAFT or REJECTED claims can be submitted (current: ${claim.status})`);
      }

      await client.query(
        `UPDATE employee_claims
            SET status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP, submitted_by = $1, updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = $2 AND id = $3`,
        [userId, organizationId, claimId]
      );

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'EMPLOYEE_CLAIM_SUBMITTED', 'EmployeeClaim', $4, $5)`,
        [newId('aud'), organizationId, userId, claimId, JSON.stringify({ claimNumber: claim.claim_number, status: 'SUBMITTED' })]
      );

      return { id: claimId, claimNumber: claim.claim_number, status: 'SUBMITTED' };
    };
    return transactionClient ? execute(transactionClient) : db.transaction(execute);
  }

  /**
   * Approve an employee claim.
   * This posts the authoritative liability journal entry:
   *   Debits: Expense line items
   *   Credit: 2105 Employee Reimbursements Payable
   */
  public static async approveClaim(
    organizationId: string,
    userId: string,
    claimId: string,
    transactionClient?: DbQueryClient
  ) {
    const execute = async (client: DbQueryClient) => {
      const res = await client.query(
        `SELECT * FROM employee_claims WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, claimId]
      );
      if (res.rows.length !== 1) throw new Error('CLAIM_NOT_FOUND: Employee claim not found');
      const claim = res.rows[0];
      if (claim.status !== 'SUBMITTED') {
        throw new Error(`CLAIM_NOT_IN_SUBMITTED_STATE: Claim must be in SUBMITTED status to approve (current: ${claim.status})`);
      }

      // Check period lock
      const claimDate = toIsoCalendarDate(claim.claim_date);
      const lockCheck = await client.query(
        `SELECT id FROM period_locks WHERE organization_id = $1 AND status = 'Active' AND lock_date >= $2 LIMIT 1`,
        [organizationId, claimDate]
      );
      if (lockCheck.rows.length > 0) {
        throw new Error('CLAIM_PERIOD_LOCKED: Claim date falls within a locked accounting period');
      }

      // Resolve Employee Reimbursements Payable liability account
      let payableAccountId = claim.payable_account_id;
      if (!payableAccountId) {
        try {
          payableAccountId = await OrganizationProvisioningService.resolveSystemAccountId(
            client,
            organizationId,
            'EMPLOYEE_REIMBURSEMENTS_PAYABLE',
            ['Liability']
          );
        } catch {
          const accRes = await client.query(
            `SELECT id FROM accounts 
             WHERE organization_id = $1 AND (code = '2105' OR system_role = 'EMPLOYEE_REIMBURSEMENTS_PAYABLE' OR LOWER(name) LIKE '%employee reimbursement%')
               AND status = 'Active'
             LIMIT 1`,
            [organizationId]
          );
          if (accRes.rows.length === 0) {
            throw new Error('CLAIM_PAYABLE_ACCOUNT_NOT_FOUND: No active Employee Reimbursements Payable account found');
          }
          payableAccountId = accRes.rows[0].id;
        }
      }

      // Fetch items
      const itemsRes = await client.query(
        `SELECT * FROM employee_claim_items WHERE organization_id = $1 AND claim_id = $2`,
        [organizationId, claimId]
      );
      if (itemsRes.rows.length === 0) {
        throw new Error('CLAIM_ITEMS_MISSING: Claim has no items to recognize');
      }

      // Build double-entry lines
      const totalAmount = Number(claim.total_amount);
      const journalLines: Array<{ accountId: string; debit: number; credit: number; description?: string; projectId?: string; customerId?: string }> = [];

      for (const it of itemsRes.rows) {
        journalLines.push({
          accountId: it.expense_account_id,
          debit: Number(it.amount),
          credit: 0,
          description: it.description || `Employee claim ${claim.claim_number} item`,
          projectId: it.project_id || undefined,
          customerId: it.client_id || undefined,
        });
      }

      // Credit the Employee Reimbursements Payable liability account
      journalLines.push({
        accountId: payableAccountId,
        debit: 0,
        credit: totalAmount,
        description: `Employee Reimbursements Payable - ${claim.claimant_name}`,
      });

      const posting = await ServerPostingEngine.postEntry({
        organizationId,
        entryNumber: `JRN-CLM-${claimId}`,
        date: claimDate,
        reference: claim.claim_number,
        description: `Employee Claim Approved: ${claim.title} (${claim.claimant_name})`,
        lines: journalLines,
      }, client);

      await client.query(
        `UPDATE employee_claims
            SET status = 'APPROVED', approved_amount = $1, payable_account_id = $2,
                claim_journal_entry_id = $3, approved_at = CURRENT_TIMESTAMP, approved_by = $4,
                updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = $5 AND id = $6`,
        [totalAmount, payableAccountId, posting.entryId, userId, organizationId, claimId]
      );

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'EMPLOYEE_CLAIM_APPROVED', 'EmployeeClaim', $4, $5)`,
        [newId('aud'), organizationId, userId, claimId, JSON.stringify({ claimNumber: claim.claim_number, approvedAmount: totalAmount, journalEntryId: posting.entryId })]
      );

      return {
        id: claimId,
        claimNumber: claim.claim_number,
        status: 'APPROVED',
        approvedAmount: totalAmount,
        journalEntryId: posting.entryId,
        payableAccountId,
      };
    };
    return transactionClient ? execute(transactionClient) : db.transaction(execute);
  }

  /**
   * Reject an employee claim with a clear reason.
   */
  public static async rejectClaim(
    organizationId: string,
    userId: string,
    claimId: string,
    reason: string,
    transactionClient?: DbQueryClient
  ) {
    const execute = async (client: DbQueryClient) => {
      const normalizedReason = String(reason || '').trim();
      if (normalizedReason.length < 3) {
        throw new Error('CLAIM_REJECTION_REASON_REQUIRED: A rejection reason of at least 3 characters is required');
      }

      const res = await client.query(
        `SELECT * FROM employee_claims WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, claimId]
      );
      if (res.rows.length !== 1) throw new Error('CLAIM_NOT_FOUND: Employee claim not found');
      const claim = res.rows[0];
      if (claim.status !== 'SUBMITTED') {
        throw new Error(`CLAIM_NOT_IN_SUBMITTED_STATE: Only SUBMITTED claims can be rejected (current: ${claim.status})`);
      }

      await client.query(
        `UPDATE employee_claims
            SET status = 'REJECTED', rejection_reason = $1, rejected_at = CURRENT_TIMESTAMP, rejected_by = $2, updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = $3 AND id = $4`,
        [normalizedReason, userId, organizationId, claimId]
      );

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'EMPLOYEE_CLAIM_REJECTED', 'EmployeeClaim', $4, $5)`,
        [newId('aud'), organizationId, userId, claimId, JSON.stringify({ claimNumber: claim.claim_number, reason: normalizedReason })]
      );

      return { id: claimId, claimNumber: claim.claim_number, status: 'REJECTED', reason: normalizedReason };
    };
    return transactionClient ? execute(transactionClient) : db.transaction(execute);
  }

  /**
   * Record a reimbursement payout to the employee from bank or cash.
   * Posts authoritative double-entry lines:
   *   Debit: 2105 Employee Reimbursements Payable
   *   Credit: Bank / Cash Account
   */
  public static async recordPayment(
    organizationId: string,
    userId: string,
    input: RecordPaymentInput,
    transactionClient?: DbQueryClient
  ) {
    const execute = async (client: DbQueryClient) => {
      if (!isIsoCalendarDate(input.paymentDate)) {
        throw new Error('PAYMENT_DATE_INVALID: A valid calendar date is required');
      }
      const paymentAmount = Number(input.amount);
      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || Math.round(paymentAmount * 100) / 100 !== paymentAmount) {
        throw new Error('PAYMENT_AMOUNT_INVALID: A positive two-decimal payment amount is required');
      }

      const claimRes = await client.query(
        `SELECT * FROM employee_claims WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, input.claimId]
      );
      if (claimRes.rows.length !== 1) throw new Error('CLAIM_NOT_FOUND: Employee claim not found');
      const claim = claimRes.rows[0];

      if (!['APPROVED', 'PARTIALLY_PAID'].includes(claim.status)) {
        throw new Error(`CLAIM_NOT_PAYABLE: Claim must be APPROVED or PARTIALLY_PAID to record a payment (current: ${claim.status})`);
      }

      const remainingPayable = Math.round((Number(claim.approved_amount) - Number(claim.paid_amount)) * 100) / 100;
      if (paymentAmount > remainingPayable) {
        throw new Error(`PAYMENT_AMOUNT_EXCEEDS_REMAINING: Payment (${paymentAmount}) exceeds remaining payable balance (${remainingPayable})`);
      }

      // Check period lock on payment date
      const lockCheck = await client.query(
        `SELECT id FROM period_locks WHERE organization_id = $1 AND status = 'Active' AND lock_date >= $2 LIMIT 1`,
        [organizationId, input.paymentDate]
      );
      if (lockCheck.rows.length > 0) {
        throw new Error('PAYMENT_PERIOD_LOCKED: Payment date falls within a locked accounting period');
      }

      // Validate payment account
      const bankAcc = await client.query(
        `SELECT id, type, sub_type FROM accounts 
         WHERE organization_id = $1 AND id = $2 AND status = 'Active' AND COALESCE(is_locked, FALSE) = FALSE`,
        [organizationId, input.paidFromAccountId]
      );
      if (bankAcc.rows.length !== 1) {
        throw new Error('PAYMENT_ACCOUNT_INVALID: Paid from account is missing or locked');
      }
      if (bankAcc.rows[0].type !== 'Asset') {
        throw new Error('PAYMENT_ACCOUNT_TYPE_INVALID: Reimbursement must be paid from an Asset account (bank or cash)');
      }

      const payableAccountId = claim.payable_account_id;
      if (!payableAccountId) {
        throw new Error('CLAIM_PAYABLE_ACCOUNT_MISSING: Claim does not have a recorded payable account');
      }

      const paymentId = newId('rpay');
      const paymentNumber = await DocumentNumberingEngine.getNextNumber(organizationId, 'REIMBURSEMENT_PAYMENT', input.paymentDate, undefined, client);

      // Construct balanced double-entry lines
      const journalLines = [
        {
          accountId: payableAccountId,
          debit: paymentAmount,
          credit: 0,
          description: `Employee Reimbursements Payable settled - ${claim.claimant_name}`,
        },
        {
          accountId: input.paidFromAccountId,
          debit: 0,
          credit: paymentAmount,
          description: `Reimbursement payout for ${claim.claim_number}`,
        },
      ];

      const posting = await ServerPostingEngine.postEntry({
        organizationId,
        entryNumber: `JRN-RPAY-${paymentId}`,
        date: input.paymentDate,
        reference: paymentNumber,
        description: `Reimbursement Payment ${paymentNumber} to ${claim.claimant_name} for ${claim.claim_number}`,
        lines: journalLines,
      }, client);

      await client.query(
        `INSERT INTO employee_reimbursement_payments
           (id, organization_id, payment_number, claim_id, claimant_id, payment_date,
            amount, paid_from_account_id, payable_account_id, payment_method,
            reference, notes, status, journal_entry_id, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'POSTED', $13, $14, CURRENT_TIMESTAMP)`,
        [paymentId, organizationId, paymentNumber, claim.id, claim.claimant_id, input.paymentDate,
          paymentAmount, input.paidFromAccountId, payableAccountId, input.paymentMethod || 'Bank Transfer',
          input.reference || '', input.notes || '', posting.entryId, userId]
      );

      const newPaidAmount = Math.round((Number(claim.paid_amount) + paymentAmount) * 100) / 100;
      const newStatus = newPaidAmount >= Number(claim.approved_amount) ? 'PAID' : 'PARTIALLY_PAID';

      await client.query(
        `UPDATE employee_claims
            SET paid_amount = $1, status = $2, updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = $3 AND id = $4`,
        [newPaidAmount, newStatus, organizationId, claim.id]
      );

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'EMPLOYEE_REIMBURSEMENT_PAID', 'EmployeeReimbursementPayment', $4, $5)`,
        [newId('aud'), organizationId, userId, paymentId,
          JSON.stringify({ paymentNumber, claimNumber: claim.claim_number, amount: paymentAmount, newPaidAmount, status: newStatus, journalEntryId: posting.entryId })]
      );

      return {
        id: paymentId,
        paymentNumber,
        claimId: claim.id,
        claimNumber: claim.claim_number,
        amount: paymentAmount,
        journalEntryId: posting.entryId,
        claimStatus: newStatus,
        claimPaidAmount: newPaidAmount,
      };
    };
    return transactionClient ? execute(transactionClient) : db.transaction(execute);
  }

  /**
   * Void a reimbursement payment.
   * Strictly enforces Scope 8: Blocks voiding if payment is matched in bank reconciliation.
   * Performs an audited reversal of the payment journal and updates claim balances.
   */
  public static async voidPayment(
    organizationId: string,
    userId: string,
    paymentId: string,
    reason: string,
    transactionClient?: DbQueryClient
  ) {
    const execute = async (client: DbQueryClient) => {
      const normalizedReason = String(reason || '').trim();
      if (normalizedReason.length < 3) {
        throw new Error('PAYMENT_VOID_REASON_REQUIRED: A reason containing at least 3 characters is required');
      }

      const pRes = await client.query(
        `SELECT * FROM employee_reimbursement_payments WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, paymentId]
      );
      if (pRes.rows.length !== 1) throw new Error('PAYMENT_NOT_FOUND: Reimbursement payment not found');
      const payment = pRes.rows[0];

      if (payment.status === 'VOIDED') {
        throw new Error('PAYMENT_ALREADY_VOIDED: Payment is already voided');
      }

      // Scope 8: Check bank reconciliation match
      const reconMatch = await client.query(
        `SELECT id FROM bank_reconciliation_matches
         WHERE organization_id = $1
           AND accounting_transaction_id IN ($2, $3)
           AND status = 'MATCHED'
         LIMIT 1`,
        [organizationId, paymentId, payment.journal_entry_id]
      );
      if (reconMatch.rows.length > 0) {
        throw new Error('PAYMENT_RECONCILED: This reimbursement payment is matched in bank reconciliation. Unmatch before voiding.');
      }

      const reversalJournalId = await FinancialDestructiveActionsService.reversePostedJournal(
        client,
        organizationId,
        payment.journal_entry_id,
        userId,
        normalizedReason,
        `reimbursement payment ${payment.payment_number}`
      );

      await client.query(
        `UPDATE employee_reimbursement_payments
            SET status = 'VOIDED', reversal_journal_id = $1
          WHERE organization_id = $2 AND id = $3`,
        [reversalJournalId, organizationId, paymentId]
      );

      // Restore claim paid amount
      const claimRes = await client.query(
        `SELECT * FROM employee_claims WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, payment.claim_id]
      );
      if (claimRes.rows.length === 1) {
        const claim = claimRes.rows[0];
        const newPaidAmount = Math.max(0, Math.round((Number(claim.paid_amount) - Number(payment.amount)) * 100) / 100);
        const restoredStatus = newPaidAmount > 0 ? 'PARTIALLY_PAID' : 'APPROVED';

        await client.query(
          `UPDATE employee_claims
              SET paid_amount = $1, status = $2, updated_at = CURRENT_TIMESTAMP
            WHERE organization_id = $3 AND id = $4`,
          [newPaidAmount, restoredStatus, organizationId, claim.id]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'EMPLOYEE_REIMBURSEMENT_PAYMENT_VOIDED', 'EmployeeReimbursementPayment', $4, $5, $6)`,
        [newId('aud'), organizationId, userId, paymentId,
          JSON.stringify({ status: 'POSTED', amount: payment.amount, journalEntryId: payment.journal_entry_id }),
          JSON.stringify({ status: 'VOIDED', reversalJournalId, reason: normalizedReason })]
      );

      return { id: paymentId, status: 'VOIDED', reversalJournalId, reversalEntryId: reversalJournalId };
    };
    return transactionClient ? execute(transactionClient) : db.transaction(execute);
  }

  /**
   * Void an approved or unapproved employee claim.
   * If approved, reverses the recognized liability journal entry.
   * Blocks voiding if any settled payments exist.
   */
  public static async voidClaim(
    organizationId: string,
    userId: string,
    claimId: string,
    reason: string,
    transactionClient?: DbQueryClient
  ) {
    const execute = async (client: DbQueryClient) => {
      const normalizedReason = String(reason || '').trim();
      if (normalizedReason.length < 3) {
        throw new Error('CLAIM_VOID_REASON_REQUIRED: A reason containing at least 3 characters is required');
      }

      const res = await client.query(
        `SELECT * FROM employee_claims WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, claimId]
      );
      if (res.rows.length !== 1) throw new Error('CLAIM_NOT_FOUND: Employee claim not found');
      const claim = res.rows[0];

      if (claim.status === 'VOIDED') {
        throw new Error('CLAIM_ALREADY_VOIDED: Claim is already voided');
      }

      if (Number(claim.paid_amount) > 0) {
        throw new Error('CLAIM_HAS_SETTLED_PAYMENTS: Void all linked reimbursement payments before voiding this claim');
      }

      let reversalJournalId: string | null = null;
      if (claim.claim_journal_entry_id) {
        reversalJournalId = await FinancialDestructiveActionsService.reversePostedJournal(
          client,
          organizationId,
          claim.claim_journal_entry_id,
          userId,
          normalizedReason,
          `employee claim ${claim.claim_number}`
        );
      }

      await client.query(
        `UPDATE employee_claims
            SET status = 'VOIDED', reversal_journal_id = $1, updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = $2 AND id = $3`,
        [reversalJournalId, organizationId, claimId]
      );

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'EMPLOYEE_CLAIM_VOIDED', 'EmployeeClaim', $4, $5, $6)`,
        [newId('aud'), organizationId, userId, claimId,
          JSON.stringify({ status: claim.status, totalAmount: claim.total_amount, journalEntryId: claim.claim_journal_entry_id }),
          JSON.stringify({ status: 'VOIDED', reversalJournalId, reason: normalizedReason })]
      );

      return { id: claimId, status: 'VOIDED', reversalJournalId, reversalEntryId: reversalJournalId };
    };
    return transactionClient ? execute(transactionClient) : db.transaction(execute);
  }

  /**
   * Get single claim with its line items and reimbursement payments.
   */
  public static async getClaim(organizationId: string, claimId: string) {
    const claimRes = await db.query(
      `SELECT c.*, pa.name AS payable_account_name
       FROM employee_claims c
       LEFT JOIN accounts pa ON pa.id = c.payable_account_id AND pa.organization_id = c.organization_id
       WHERE c.organization_id = $1 AND c.id = $2`,
      [organizationId, claimId]
    );
    if (claimRes.rows.length !== 1) return null;
    const claim = claimRes.rows[0];

    const itemsRes = await db.query(
      `SELECT ci.*, ea.name AS expense_account_name
       FROM employee_claim_items ci
       LEFT JOIN accounts ea ON ea.id = ci.expense_account_id AND ea.organization_id = ci.organization_id
       WHERE ci.organization_id = $1 AND ci.claim_id = $2
       ORDER BY ci.date ASC, ci.created_at ASC`,
      [organizationId, claimId]
    );

    const paymentsRes = await db.query(
      `SELECT p.*, ba.name AS paid_from_account_name
       FROM employee_reimbursement_payments p
       LEFT JOIN accounts ba ON ba.id = p.paid_from_account_id AND ba.organization_id = p.organization_id
       WHERE p.organization_id = $1 AND p.claim_id = $2
       ORDER BY p.payment_date DESC, p.created_at DESC`,
      [organizationId, claimId]
    );

    return {
      ...claim,
      items: itemsRes.rows,
      payments: paymentsRes.rows,
    };
  }

  /**
   * List employee claims for an organization.
   */
  public static async listClaims(
    organizationId: string,
    filters: { claimantId?: string; status?: string; fromDate?: string; toDate?: string; limit?: number; offset?: number } = {}
  ) {
    let queryText = `
      SELECT c.*, pa.name AS payable_account_name
      FROM employee_claims c
      LEFT JOIN accounts pa ON pa.id = c.payable_account_id AND pa.organization_id = c.organization_id
      WHERE c.organization_id = $1
    `;
    const params: any[] = [organizationId];

    if (filters.claimantId) {
      params.push(filters.claimantId);
      queryText += ` AND c.claimant_id = $${params.length}`;
    }
    if (filters.status) {
      params.push(filters.status.toUpperCase());
      queryText += ` AND UPPER(c.status) = $${params.length}`;
    }
    if (filters.fromDate) {
      params.push(filters.fromDate);
      queryText += ` AND c.claim_date >= $${params.length}`;
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      queryText += ` AND c.claim_date <= $${params.length}`;
    }

    queryText += ` ORDER BY c.claim_date DESC, c.created_at DESC`;

    if (filters.limit && filters.limit > 0) {
      params.push(filters.limit, filters.offset || 0);
      queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }

    const res = await db.query(queryText, params);
    return res.rows;
  }
}
