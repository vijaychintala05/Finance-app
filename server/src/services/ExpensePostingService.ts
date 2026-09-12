import { ApprovalWorkflowService } from '../approvals/ApprovalWorkflowService';
import { DocumentLifecycleHelper } from '../approvals/DocumentLifecycleHelper';
import { db, type DbQueryClient } from '../database/db';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { DocumentNumberingEngine } from './DocumentNumberingEngine';
import { newId } from '../utils/ids';
import { isIsoCalendarDate } from '../utils/date';
import { ExpenseReceiptService, type ExpenseReceiptUpload } from './ExpenseReceiptService';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';

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
  vendorId?: string;
  vendorName?: string;
  vendorInvoiceNumber?: string;
  date: string;
  amount: number;
  taxRate?: number;
  taxAmount?: number;
  taxAccountId?: string;
  isTaxInclusive?: boolean;
  isRcm?: boolean;
  rcmTaxAccountId?: string;
  tdsRate?: number;
  tdsAmount?: number;
  tdsSection?: string;
  tdsAccountId?: string;
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
  /**
   * Correct a posted cash expense without ever changing its original journal.
   * The original is reversed and retained, then the replacement is posted in
   * the same transaction so GL, cash/bank, and the document trail agree.
   */
  public static async correctAndPost(
    organizationId: string,
    userId: string,
    expenseId: string,
    input: ExpensePostingInput,
    reason: string
  ): Promise<{ voidedExpenseId: string; reversalJournalId: string; replacement: Awaited<ReturnType<typeof ExpensePostingService.createAndPost>> }> {
    const normalizedReason = String(reason || '').trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 1000) {
      throw new Error('EXPENSE_CORRECTION_REASON_INVALID: A correction reason containing 3-1000 characters is required');
    }

    return db.transaction(async (client) => {
      const originalResult = await client.query(
        `SELECT * FROM expenses WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, expenseId]
      );
      if (originalResult.rows.length !== 1) throw new Error('EXPENSE_NOT_FOUND: Expense not found');
      const original = originalResult.rows[0];
      if (String(original.status).toUpperCase() === 'VOIDED') throw new Error('EXPENSE_ALREADY_VOIDED: A voided expense cannot be corrected');
      if (original.is_billed || original.invoice_id) throw new Error('EXPENSE_ALREADY_BILLED: Reverse the linked customer invoice before correcting this expense');
      if (!original.journal_entry_id) throw new Error('EXPENSE_POSTING_MISSING: Expense has no certified posting journal to reverse');

      // Scope 8: Reject correction if expense or its journal entry is actively matched in a bank reconciliation
      const matchedCheck = await client.query(
        `SELECT id FROM bank_reconciliation_matches
          WHERE organization_id = $1
            AND accounting_transaction_id IN ($2, $3)
            AND status = 'MATCHED'
          LIMIT 1`,
        [organizationId, expenseId, original.journal_entry_id]
      );
      if (matchedCheck.rows.length > 0) {
        throw new Error('EXPENSE_RECONCILED: This expense is matched in bank reconciliation. Unmatch or reopen the reconciliation before correcting.');
      }

      const reversalJournalId = await FinancialDestructiveActionsService.reversePostedJournal(
        client, organizationId, original.journal_entry_id, userId, normalizedReason, `expense correction ${original.expense_number}`
      );
      await client.query(
        `UPDATE expenses SET status = 'VOIDED', reversal_journal_id = $1,
            reversed_at = CURRENT_TIMESTAMP, reversed_by = $2, reversal_reason = $3
          WHERE organization_id = $4 AND id = $5`,
        [reversalJournalId, userId, normalizedReason, organizationId, expenseId]
      );
      await DocumentLifecycleHelper.onDocumentVoided(organizationId, 'EXPENSE', expenseId, client, normalizedReason);

      const replacement = await this.createAndPost(organizationId, userId, input, client);
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'EXPENSE_CORRECTED', 'Expense', $4, $5, $6)`,
        [newId('aud'), organizationId, userId, expenseId,
          JSON.stringify({ expenseNumber: original.expense_number, amount: original.amount, journalEntryId: original.journal_entry_id }),
          JSON.stringify({ replacementExpenseId: replacement.id, replacementExpenseNumber: replacement.expenseNumber, reversalJournalId, reason: normalizedReason })]
      );
      return { voidedExpenseId: expenseId, reversalJournalId, replacement };
    });
  }

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

      const grossOrBase = amount;
      const isTaxInclusive = Boolean(input.isTaxInclusive);
      const isRcm = Boolean(input.isRcm);
      const taxRate = input.taxRate !== undefined ? Number(input.taxRate) : 0;
      const tdsRate = input.tdsRate !== undefined ? Number(input.tdsRate) : 0;
      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
        throw new Error('EXPENSE_TAX_RATE_INVALID: Tax rate must be between 0 and 100');
      }
      if (!Number.isFinite(tdsRate) || tdsRate < 0 || tdsRate > 100) {
        throw new Error('EXPENSE_TDS_RATE_INVALID: TDS rate must be between 0 and 100');
      }
      if (input.taxAmount !== undefined && (!Number.isFinite(Number(input.taxAmount)) || Number(input.taxAmount) < 0)) {
        throw new Error('EXPENSE_TAX_INVALID: Tax amount must be a non-negative two-decimal amount');
      }
      if (input.tdsAmount !== undefined && (!Number.isFinite(Number(input.tdsAmount)) || Number(input.tdsAmount) < 0)) {
        throw new Error('EXPENSE_TDS_INVALID: TDS amount must be a non-negative two-decimal amount');
      }

      let taxableBaseAmount: number;
      let computedTaxAmount: number;

      if (isTaxInclusive) {
        if (input.taxAmount !== undefined && Number.isFinite(Number(input.taxAmount)) && Number(input.taxAmount) >= 0) {
          computedTaxAmount = Math.round(Number(input.taxAmount) * 100) / 100;
          taxableBaseAmount = Math.round((grossOrBase - computedTaxAmount) * 100) / 100;
        } else if (taxRate > 0) {
          taxableBaseAmount = Math.round((grossOrBase / (1 + taxRate / 100)) * 100) / 100;
          computedTaxAmount = Math.round((grossOrBase - taxableBaseAmount) * 100) / 100;
        } else {
          taxableBaseAmount = grossOrBase;
          computedTaxAmount = 0;
        }
      } else {
        taxableBaseAmount = grossOrBase;
        if (input.taxAmount !== undefined && Number.isFinite(Number(input.taxAmount)) && Number(input.taxAmount) >= 0) {
          computedTaxAmount = Math.round(Number(input.taxAmount) * 100) / 100;
        } else if (taxRate > 0) {
          computedTaxAmount = Math.round((grossOrBase * (taxRate / 100)) * 100) / 100;
        } else {
          computedTaxAmount = 0;
        }
      }

      if (taxableBaseAmount < 0) {
        throw new Error('EXPENSE_TAX_INVALID: Tax amount cannot exceed expense gross amount');
      }
      if (isRcm && computedTaxAmount <= 0) {
        throw new Error('EXPENSE_RCM_TAX_REQUIRED: Reverse charge expenses require a positive GST amount');
      }

      let computedTdsAmount: number;
      if (input.tdsAmount !== undefined && Number.isFinite(Number(input.tdsAmount)) && Number(input.tdsAmount) >= 0) {
        computedTdsAmount = Math.round(Number(input.tdsAmount) * 100) / 100;
      } else if (tdsRate > 0) {
        computedTdsAmount = Math.round((taxableBaseAmount * (tdsRate / 100)) * 100) / 100;
      } else {
        computedTdsAmount = 0;
      }

      if (computedTdsAmount > taxableBaseAmount) {
        throw new Error('EXPENSE_TDS_INVALID: TDS amount cannot exceed the taxable expense amount');
      }

      let bankCreditAmount: number;
      if (isRcm) {
        bankCreditAmount = Math.round((taxableBaseAmount - computedTdsAmount) * 100) / 100;
      } else {
        const grossTotal = Math.round((taxableBaseAmount + computedTaxAmount) * 100) / 100;
        bankCreditAmount = Math.round((grossTotal - computedTdsAmount) * 100) / 100;
      }

      if (bankCreditAmount < 0) {
        throw new Error('EXPENSE_TDS_INVALID: TDS amount cannot exceed total payout amount');
      }

      let resolvedTaxAccountId: string | null = null;
      if (computedTaxAmount > 0) {
        if (input.taxAccountId) {
          resolvedTaxAccountId = input.taxAccountId;
        } else {
          const taxAccRes = await client.query(
            `SELECT id FROM accounts
             WHERE organization_id = $1 AND (system_role = 'GST_INPUT' OR code IN ('1200', '2110') OR LOWER(name) LIKE '%input gst%')
               AND status = 'Active' AND COALESCE(is_locked, FALSE) = FALSE
             ORDER BY (system_role = 'GST_INPUT') DESC, (code = '1200') DESC
             LIMIT 1`,
            [organizationId]
          );
          if (taxAccRes.rows.length === 0) {
            throw new Error('EXPENSE_TAX_ACCOUNT_NOT_FOUND: No active Input Tax account found for organization');
          }
          resolvedTaxAccountId = taxAccRes.rows[0].id;
        }
      }

      let resolvedRcmAccountId: string | null = null;
      if (isRcm && computedTaxAmount > 0) {
        if (input.rcmTaxAccountId) {
          resolvedRcmAccountId = input.rcmTaxAccountId;
        } else {
          const rcmAccRes = await client.query(
            `SELECT id FROM accounts
             WHERE organization_id = $1 AND (code = '2240' OR LOWER(name) LIKE '%reverse charge%' OR system_role = 'GST_OUTPUT' OR code = '2200')
               AND status = 'Active' AND COALESCE(is_locked, FALSE) = FALSE
             ORDER BY (code = '2240') DESC, (LOWER(name) LIKE '%reverse charge%') DESC
             LIMIT 1`,
            [organizationId]
          );
          if (rcmAccRes.rows.length === 0) {
            throw new Error('EXPENSE_RCM_ACCOUNT_NOT_FOUND: No active Reverse Charge Liability account found for organization');
          }
          resolvedRcmAccountId = rcmAccRes.rows[0].id;
        }
      }

      let resolvedTdsAccountId: string | null = null;
      if (computedTdsAmount > 0) {
        if (input.tdsAccountId) {
          resolvedTdsAccountId = input.tdsAccountId;
        } else {
          const tdsAccRes = await client.query(
            `SELECT id FROM accounts
             WHERE organization_id = $1 AND (system_role = 'TDS_PAYABLE' OR code = '2250' OR LOWER(name) LIKE '%tds payable%')
               AND status = 'Active' AND COALESCE(is_locked, FALSE) = FALSE
             ORDER BY (system_role = 'TDS_PAYABLE') DESC, (code = '2250') DESC
             LIMIT 1`,
            [organizationId]
          );
          if (tdsAccRes.rows.length === 0) {
            throw new Error('EXPENSE_TDS_ACCOUNT_NOT_FOUND: No active TDS Payable account found for organization');
          }
          resolvedTdsAccountId = tdsAccRes.rows[0].id;
        }
      }

      // Check all unique accounts involved
      const distinctAccountIds = Array.from(new Set([
        input.paidFromAccountId,
        input.expenseAccountId,
        ...(isItemized ? input.items!.map(it => it.accountId) : []),
        ...(resolvedTaxAccountId ? [resolvedTaxAccountId] : []),
        ...(resolvedRcmAccountId ? [resolvedRcmAccountId] : []),
        ...(resolvedTdsAccountId ? [resolvedTdsAccountId] : []),
      ]));

      const placeholders = distinctAccountIds.map((_, i) => String.fromCharCode(36) + (i + 2)).join(', ');
      const accountCheck = await client.query(
        `SELECT id, code, name, type, sub_type, system_role FROM accounts
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

      const taxAccount = accountCheck.rows.find((account) => account.id === resolvedTaxAccountId);
      if (taxAccount) {
        const isInputTaxControl =
          taxAccount.system_role === 'GST_INPUT' ||
          ['1200', '1210', '1220', '1230', '2110'].includes(String(taxAccount.code)) ||
          String(taxAccount.name || '').toLowerCase().includes('input gst');
        if (!isInputTaxControl) {
          throw new Error('EXPENSE_TAX_ACCOUNT_INVALID: Tax must debit an Input GST control account');
        }
      }

      const rcmAccount = accountCheck.rows.find((account) => account.id === resolvedRcmAccountId);
      if (rcmAccount) {
        const isOutputTaxControl =
          rcmAccount.type === 'Liability' && (
            rcmAccount.system_role === 'GST_OUTPUT' ||
            ['2200', '2210', '2220', '2230', '2240'].includes(String(rcmAccount.code)) ||
            String(rcmAccount.name || '').toLowerCase().includes('reverse charge')
          );
        if (!isOutputTaxControl) {
          throw new Error('EXPENSE_RCM_ACCOUNT_INVALID: Reverse charge GST must credit an Output GST liability account');
        }
      }

      const tdsAccount = accountCheck.rows.find((account) => account.id === resolvedTdsAccountId);
      if (tdsAccount) {
        const isTdsPayableControl =
          tdsAccount.type === 'Liability' && (
            tdsAccount.system_role === 'TDS_PAYABLE' ||
            String(tdsAccount.code) === '2250' ||
            String(tdsAccount.name || '').toLowerCase().includes('tds payable')
          );
        if (!isTdsPayableControl) {
          throw new Error('EXPENSE_TDS_ACCOUNT_INVALID: TDS must credit a TDS Payable liability account');
        }
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

      let effectiveClientId = input.clientId || null;
      if (input.projectId) {
        const project = await client.query(
          `SELECT client_id FROM projects WHERE organization_id = $1 AND id = $2 AND status <> 'Cancelled'`,
          [organizationId, input.projectId]
        );
        if (project.rows.length !== 1) throw new Error('EXPENSE_PROJECT_INVALID: Project is unavailable in this organization');
        if (effectiveClientId && project.rows[0].client_id && effectiveClientId !== project.rows[0].client_id) {
          throw new Error('EXPENSE_PROJECT_CUSTOMER_MISMATCH: Customer does not match the selected project');
        }
        // A normal project cost is allowed to remain party-neutral.  Only a
        // recoverable (billable) cost should inherit the project's customer.
        // Otherwise historic projects with a retired customer could no longer
        // accept ordinary expense postings.
        if (input.isBillable && !effectiveClientId && project.rows[0].client_id) {
          effectiveClientId = project.rows[0].client_id;
        }
      }

      if (input.isBillable && !effectiveClientId) {
        throw new Error('EXPENSE_CUSTOMER_REQUIRED: Billable expenses must be assigned to a customer');
      }

      if (effectiveClientId) {
        const customerCheck = await client.query(
          `SELECT id FROM customers WHERE organization_id = $1 AND id = $2
           UNION ALL
           SELECT id FROM clients WHERE organization_id = $1 AND id = $2
           LIMIT 1`,
          [organizationId, effectiveClientId]
        );
        if (customerCheck.rows.length === 0) {
          throw new Error('EXPENSE_CUSTOMER_INVALID: Customer was not found in this organization');
        }
      }

      let vendorId: string | null = null;
      let vendorName = String(input.vendorName || '').trim();
      if (input.vendorId !== undefined && input.vendorId !== null && input.vendorId !== '') {
        if (typeof input.vendorId !== 'string' || input.vendorId.length > 64) {
          throw new Error('EXPENSE_VENDOR_INVALID: Vendor is invalid');
        }
        const vendorCheck = await client.query(
          `SELECT id, name, company_name FROM vendors WHERE organization_id = $1 AND id = $2`,
          [organizationId, input.vendorId]
        );
        if (vendorCheck.rows.length !== 1) {
          throw new Error('EXPENSE_VENDOR_INVALID: Vendor was not found in this organization');
        }
        vendorId = vendorCheck.rows[0].id;
        vendorName = String(vendorCheck.rows[0].company_name || vendorCheck.rows[0].name || '').trim();
      }

      const vendorInvoiceNumber = input.vendorInvoiceNumber === undefined || input.vendorInvoiceNumber === null
        ? null
        : String(input.vendorInvoiceNumber).trim();
      if (vendorInvoiceNumber !== null && vendorInvoiceNumber.length > 128) {
        throw new Error('EXPENSE_INPUT_INVALID: Vendor invoice or receipt reference cannot exceed 128 characters');
      }

      const id = input.id || newId('exp');
      const expenseNumber = await DocumentNumberingEngine.getNextNumber(organizationId, 'EXPENSE', input.date, undefined, client);

      const itemsJson = isItemized ? JSON.stringify(input.items) : null;

      await client.query(
        `INSERT INTO expenses
          (id, organization_id, expense_number, expense_account_id, paid_from_account_id,
           vendor_id, vendor_name, vendor_invoice_number, date, amount, tax_rate, tax_amount, tax_account_id,
           is_tax_inclusive, is_rcm, rcm_tax_account_id,
           tds_rate, tds_amount, tds_section, tds_account_id,
           description, project_id, client_id, is_billable, is_billed, invoice_id, source_occurrence_key,
           is_itemized, items)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, FALSE, NULL, $25, $26, $27)`,
        [id, organizationId, expenseNumber, input.expenseAccountId, input.paidFromAccountId,
          vendorId, vendorName, vendorInvoiceNumber || null, input.date, amount, taxRate, computedTaxAmount, resolvedTaxAccountId,
          isTaxInclusive, isRcm, resolvedRcmAccountId,
          tdsRate, computedTdsAmount, input.tdsSection || null, resolvedTdsAccountId,
          input.description || '', input.projectId || null,
          effectiveClientId, Boolean(input.isBillable), input.sourceOccurrenceKey || null,
          isItemized, itemsJson]
      );
      const receiptAttachments = await ExpenseReceiptService.attachToExpense(client, organizationId, id, receipts);

      // Construct balanced double-entry lines
      const journalLines: Array<{ accountId: string; debit: number; credit: number; description?: string; projectId?: string; customerId?: string }> = [];

      if (isItemized) {
        if (isTaxInclusive) {
          let itemDebitsSum = 0;
          for (let i = 0; i < input.items!.length; i++) {
            const it = input.items![i];
            let itemDebit: number;
            if (i === input.items!.length - 1) {
              itemDebit = Math.round((taxableBaseAmount - itemDebitsSum) * 100) / 100;
            } else {
              itemDebit = Math.round((taxableBaseAmount * (Number(it.amount) / grossOrBase)) * 100) / 100;
              itemDebitsSum += itemDebit;
            }
            journalLines.push({
              accountId: it.accountId,
              debit: itemDebit,
              credit: 0,
              description: it.description || input.description || `Expense item`,
              projectId: it.projectId || input.projectId,
              customerId: it.clientId || effectiveClientId,
            });
          }
        } else {
          for (const it of input.items!) {
            journalLines.push({
              accountId: it.accountId,
              debit: Number(it.amount),
              credit: 0,
              description: it.description || input.description || `Expense item`,
              projectId: it.projectId || input.projectId,
              customerId: it.clientId || effectiveClientId,
            });
          }
        }
      } else {
        journalLines.push({
          accountId: input.expenseAccountId,
          debit: taxableBaseAmount,
          credit: 0,
          projectId: input.projectId,
          customerId: effectiveClientId || undefined,
        });
      }

      if (computedTaxAmount > 0 && resolvedTaxAccountId) {
        journalLines.push({
          accountId: resolvedTaxAccountId,
          debit: computedTaxAmount,
          credit: 0,
          description: isRcm ? 'Input GST on Reverse Charge' : 'Input GST Credit',
          projectId: input.projectId,
          customerId: effectiveClientId || undefined,
        });
      }

      if (bankCreditAmount > 0) {
        journalLines.push({
          accountId: input.paidFromAccountId,
          debit: 0,
          credit: bankCreditAmount,
          projectId: input.projectId,
          customerId: effectiveClientId || undefined,
        });
      }

      if (computedTdsAmount > 0 && resolvedTdsAccountId) {
        journalLines.push({
          accountId: resolvedTdsAccountId,
          debit: 0,
          credit: computedTdsAmount,
          description: `TDS deducted ${input.tdsSection ? `u/s ${input.tdsSection}` : ''}`.trim(),
          projectId: input.projectId,
          customerId: effectiveClientId || undefined,
        });
      }

      if (isRcm && computedTaxAmount > 0 && resolvedRcmAccountId) {
        journalLines.push({
          accountId: resolvedRcmAccountId,
          debit: 0,
          credit: computedTaxAmount,
          description: 'Output GST Liability under Reverse Charge',
          projectId: input.projectId,
          customerId: effectiveClientId || undefined,
        });
      }

      const posting = await ServerPostingEngine.postEntry({
        organizationId,
        entryNumber: `JRN-${expenseNumber}`,
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
      return {
        id,
        expenseNumber,
        amount,
        taxRate,
        taxAmount: computedTaxAmount,
        taxAccountId: resolvedTaxAccountId,
        isTaxInclusive,
        isRcm,
        rcmTaxAccountId: resolvedRcmAccountId,
        tdsRate,
        tdsAmount: computedTdsAmount,
        tdsSection: input.tdsSection || null,
        tdsAccountId: resolvedTdsAccountId,
        isBillable: Boolean(input.isBillable),
        isBilled: false,
        clientId: effectiveClientId,
        projectId: input.projectId || null,
        journalEntryId: posting.entryId,
        receiptAttachments,
      };
    };
    return transactionClient ? execute(transactionClient) : db.transaction(execute);
  }

  public static async updateExpense(
    organizationId: string,
    expenseId: string,
    data: { description?: string; vendorName?: string; isBillable?: boolean; date?: string; amount?: number },
    transactionClient?: DbQueryClient
  ): Promise<any> {
    const execute = async (client: DbQueryClient) => {
      const res = await client.query(
        `SELECT * FROM expenses WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, expenseId]
      );
      if (res.rows.length === 0) throw new Error('EXPENSE_NOT_FOUND: Expense not found');
      const exp = res.rows[0];
      if (String(exp.status).toUpperCase() === 'VOIDED') throw new Error('Cannot edit a voided expense');

      // Automatically invalidate active approval requests
      await DocumentLifecycleHelper.onDocumentModified(
        organizationId,
        'EXPENSE',
        expenseId,
        client,
        'Document modified after submission'
      );

      const desc = data.description !== undefined ? data.description : exp.description;
      const vendor = data.vendorName !== undefined ? data.vendorName : exp.vendor_name;
      const billable = data.isBillable !== undefined ? Boolean(data.isBillable) : Boolean(exp.is_billable);
      const date = data.date || exp.date;
      const amt = data.amount !== undefined ? Number(data.amount) : Number(exp.amount);

      await client.query(
        `UPDATE expenses SET description = $1, vendor_name = $2, is_billable = $3, date = $4, amount = $5
          WHERE organization_id = $6 AND id = $7`,
        [desc, vendor, billable, date, amt, organizationId, expenseId]
      );

      return { ...exp, description: desc, vendorName: vendor, isBillable: billable, date, amount: amt };
    };

    return transactionClient ? await execute(transactionClient) : await db.transaction(execute);
  }
}
