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
  customerId?: string;
  isBillable?: boolean;
  markupPercentage?: number;
  sellingPrice?: number;
  sourceOccurrenceKey?: string;
  receiptImages?: ExpenseReceiptUpload[];
  isItemized?: boolean;
  items?: ExpenseItemInput[];
}

export class ExpensePostingService {
  /**
   * Helper to validate inputs, compute taxes/TDS, resolve accounts, and construct balanced double-entry lines.
   */
  private static async validateAndPrepareExpenseData(
    organizationId: string,
    input: ExpensePostingInput,
    client: DbQueryClient,
    retainedArchivedProjectId?: string | null
  ) {
    const isItemized = Boolean(input.isItemized && Array.isArray(input.items) && input.items.length > 0);
    let amount = Number(input.amount);

    if (isItemized) {
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

    const placeholders = distinctAccountIds.map((_, i) => '$' + (i + 2)).join(', ');
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

    let effectiveClientId = input.clientId || input.customerId || null;
    if (input.projectId) {
      const project = await client.query(
        `SELECT client_id, archived_at FROM projects WHERE organization_id = $1 AND id = $2 AND status <> 'Cancelled' FOR UPDATE`,
        [organizationId, input.projectId]
      );
      if (project.rows.length !== 1) throw new Error('EXPENSE_PROJECT_INVALID: Project is unavailable in this organization');
      if (project.rows[0].archived_at && input.projectId !== retainedArchivedProjectId) throw new Error('EXPENSE_PROJECT_ARCHIVED: Archived projects cannot be assigned to a new expense');
      if (effectiveClientId && project.rows[0].client_id && effectiveClientId !== project.rows[0].client_id) {
        throw new Error('EXPENSE_PROJECT_CUSTOMER_MISMATCH: Customer does not match the selected project');
      }
      if (input.isBillable && !effectiveClientId && project.rows[0].client_id) {
        effectiveClientId = project.rows[0].client_id;
      }
    }

    if (input.isBillable && !effectiveClientId) {
      throw new Error('EXPENSE_CUSTOMER_REQUIRED: Billable expenses must be assigned to a customer');
    }

    const markupPercentage = input.markupPercentage !== undefined && input.markupPercentage !== null
      ? Number(input.markupPercentage)
      : 0;
    if (!Number.isFinite(markupPercentage) || markupPercentage < 0) {
      throw new Error('EXPENSE_MARKUP_INVALID: Markup percentage must be a non-negative number');
    }

    let sellingPrice = 0;
    if (input.isBillable) {
      if (input.sellingPrice !== undefined && input.sellingPrice !== null && Number.isFinite(Number(input.sellingPrice)) && Number(input.sellingPrice) >= 0) {
        sellingPrice = Math.round(Number(input.sellingPrice) * 100) / 100;
      } else {
        sellingPrice = Math.round(amount * (1 + markupPercentage / 100) * 100) / 100;
      }
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
        `SELECT id, name, company_name, active FROM vendors WHERE organization_id = $1 AND id = $2`,
        [organizationId, input.vendorId]
      );
      if (vendorCheck.rows.length !== 1) {
        throw new Error('EXPENSE_VENDOR_INVALID: Vendor was not found in this organization');
      }
      if (vendorCheck.rows[0].active === false) {
        throw new Error('EXPENSE_VENDOR_ARCHIVED: Archived vendors cannot be selected for new expenses');
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
            customerId: it.clientId || effectiveClientId || undefined,
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
            customerId: it.clientId || effectiveClientId || undefined,
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

    return {
      amount,
      taxRate,
      taxAmount: computedTaxAmount,
      resolvedTaxAccountId,
      isTaxInclusive,
      isRcm,
      resolvedRcmAccountId,
      tdsRate,
      tdsAmount: computedTdsAmount,
      resolvedTdsAccountId,
      effectiveClientId,
      vendorId,
      vendorName,
      vendorInvoiceNumber,
      isBillable: Boolean(input.isBillable),
      isItemized,
      items: input.items,
      markupPercentage,
      sellingPrice,
      journalLines,
    };
  }

  /**
   * Create and post a new expense with balanced double-entry accounting.
   */
  public static async createAndPost(
    organizationId: string,
    userId: string,
    input: ExpensePostingInput,
    transactionClient?: DbQueryClient
  ): Promise<{
    id: string;
    expenseNumber: string;
    amount: number;
    taxRate: number;
    taxAmount: number;
    taxAccountId: string | null;
    isTaxInclusive: boolean;
    isRcm: boolean;
    rcmTaxAccountId: string | null;
    tdsRate: number;
    tdsAmount: number;
    tdsSection: string | null;
    tdsAccountId: string | null;
    isBillable: boolean;
    markupPercentage: number;
    sellingPrice: number;
    isBilled: boolean;
    clientId: string | null;
    projectId: string | null;
    journalEntryId: string;
    receiptAttachments: Array<{ id: string; fileName: string; mimeType: string; byteSize: number }>;
  }> {
    const execute = async (client: DbQueryClient) => {
      const receipts = ExpenseReceiptService.validateUploads(input.receiptImages);

      const prepared = await this.validateAndPrepareExpenseData(organizationId, input, client);

      const periodLock = await client.query(
        `SELECT id FROM period_locks
          WHERE organization_id = $1 AND status = 'Active' AND lock_date >= $2
          LIMIT 1`,
        [organizationId, input.date]
      );
      if (periodLock.rows.length) throw new Error('EXPENSE_PERIOD_LOCKED: Expense date falls within a locked period');

      const id = input.id || newId('exp');
      const expenseNumber = await DocumentNumberingEngine.getNextNumber(organizationId, 'EXPENSE', input.date, undefined, client);
      const itemsJson = prepared.isItemized ? JSON.stringify(prepared.items) : null;

      await client.query(
        `INSERT INTO expenses
          (id, organization_id, expense_number, expense_account_id, paid_from_account_id,
           vendor_id, vendor_name, vendor_invoice_number, date, amount, tax_rate, tax_amount, tax_account_id,
           is_tax_inclusive, is_rcm, rcm_tax_account_id,
           tds_rate, tds_amount, tds_section, tds_account_id,
           description, project_id, client_id, is_billable, markup_percentage, selling_price,
           is_billed, invoice_id, source_occurrence_key,
           is_itemized, items)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, FALSE, NULL, $27, $28, $29)`,
        [
          id, organizationId, expenseNumber, input.expenseAccountId, input.paidFromAccountId,
          prepared.vendorId, prepared.vendorName, prepared.vendorInvoiceNumber || null, input.date, prepared.amount,
          prepared.taxRate, prepared.taxAmount, prepared.resolvedTaxAccountId,
          prepared.isTaxInclusive, prepared.isRcm, prepared.resolvedRcmAccountId,
          prepared.tdsRate, prepared.tdsAmount, input.tdsSection || null, prepared.resolvedTdsAccountId,
          input.description || '', input.projectId || null,
          prepared.effectiveClientId, prepared.isBillable, prepared.markupPercentage, prepared.sellingPrice,
          input.sourceOccurrenceKey || null,
          prepared.isItemized, itemsJson
        ]
      );

      const receiptAttachments = await ExpenseReceiptService.attachToExpense(client, organizationId, id, receipts);

      const posting = await ServerPostingEngine.postEntry({
        organizationId,
        entryNumber: `JRN-${expenseNumber}`,
        date: input.date,
        reference: expenseNumber,
        description: `Expense paid to ${prepared.vendorName || 'Vendor'}`,
        lines: prepared.journalLines,
      }, client);

      await client.query(
        `UPDATE expenses SET journal_entry_id = $1 WHERE organization_id = $2 AND id = $3`,
        [posting.entryId, organizationId, id]
      );

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'EXPENSE_CREATED', 'Expense', $4, $5)`,
        [newId('aud'), organizationId, userId, id, JSON.stringify({ amount: prepared.amount, expenseNumber, isItemized: prepared.isItemized, itemsCount: prepared.isItemized ? prepared.items!.length : 1, journalEntryId: posting.entryId })]
      );

      return {
        id,
        expenseNumber,
        amount: prepared.amount,
        taxRate: prepared.taxRate,
        taxAmount: prepared.taxAmount,
        taxAccountId: prepared.resolvedTaxAccountId,
        isTaxInclusive: prepared.isTaxInclusive,
        isRcm: prepared.isRcm,
        rcmTaxAccountId: prepared.resolvedRcmAccountId,
        tdsRate: prepared.tdsRate,
        tdsAmount: prepared.tdsAmount,
        tdsSection: input.tdsSection || null,
        tdsAccountId: prepared.resolvedTdsAccountId,
        isBillable: prepared.isBillable,
        markupPercentage: prepared.markupPercentage,
        sellingPrice: prepared.sellingPrice,
        isBilled: false,
        clientId: prepared.effectiveClientId,
        projectId: input.projectId || null,
        journalEntryId: posting.entryId,
        receiptAttachments,
      };
    };

    return transactionClient ? execute(transactionClient) : db.transaction(execute);
  }

  /**
   * Update an existing expense in place like Zoho Books.
   * Preserves expense identity (same id, same expense_number, status remains POSTED).
   * Reverses previous GL journal and posts a new balanced journal for financial changes.
   * Records EXPENSE_UPDATED in audit_logs with reason and before/after state.
   */
  public static async updateExpense(
    organizationId: string,
    expenseId: string,
    data: Partial<ExpensePostingInput> & { reason?: string; editReason?: string; invoiceNumber?: string },
    userId?: string,
    editReason?: string,
    transactionClient?: DbQueryClient
  ): Promise<any> {
    const execute = async (client: DbQueryClient) => {
      const normalizedReason = String(editReason || data.reason || data.editReason || 'Expense updated').trim();
      const effectiveUserId = userId || 'system';

      const originalResult = await client.query(
        `SELECT * FROM expenses WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, expenseId]
      );
      if (originalResult.rows.length !== 1) throw new Error('EXPENSE_NOT_FOUND: Expense not found');
      const original = originalResult.rows[0];

      if (String(original.status).toUpperCase() === 'VOIDED') {
        throw new Error('EXPENSE_ALREADY_VOIDED: Cannot edit a voided expense');
      }
      if (original.is_billed || original.invoice_id) {
        throw new Error('EXPENSE_ALREADY_BILLED: Reverse the linked customer invoice before editing this expense');
      }

      const originalDate = original.date instanceof Date ? original.date.toISOString().slice(0, 10) : String(original.date).slice(0, 10);
      const targetDate = data.date ? String(data.date).slice(0, 10) : originalDate;

      // Check period locks
      const periodLockCheck = await client.query(
        `SELECT id FROM period_locks
          WHERE organization_id = $1 AND status = 'Active' AND (lock_date >= $2 OR lock_date >= $3)
          LIMIT 1`,
        [organizationId, originalDate, targetDate]
      );
      if (periodLockCheck.rows.length) {
        throw new Error('EXPENSE_PERIOD_LOCKED: Expense date falls within a locked period');
      }

      // Reject edit if expense or its journal entry is matched in active bank reconciliation
      const matchedCheck = await client.query(
        `SELECT id FROM bank_reconciliation_matches
          WHERE organization_id = $1
            AND accounting_transaction_id IN ($2, $3)
            AND COALESCE(status, '') NOT IN ('REJECTED', 'UNMATCHED')
          LIMIT 1`,
        [organizationId, expenseId, original.journal_entry_id]
      );
      if (matchedCheck.rows.length > 0) {
        throw new Error('EXPENSE_RECONCILED: This expense is matched in bank reconciliation. Unmatch or reopen the reconciliation before editing.');
      }

      // Automatically invalidate active approval requests
      await DocumentLifecycleHelper.onDocumentModified(
        organizationId,
        'EXPENSE',
        expenseId,
        client,
        'Document modified after submission'
      );

      const mergedInput: ExpensePostingInput = {
        amount: data.amount !== undefined ? Number(data.amount) : Number(original.amount),
        date: targetDate,
        expenseAccountId: data.expenseAccountId || original.expense_account_id,
        paidFromAccountId: data.paidFromAccountId || original.paid_from_account_id,
        vendorId: data.vendorId !== undefined ? data.vendorId : (original.vendor_id || undefined),
        vendorName: data.vendorName !== undefined ? data.vendorName : (original.vendor_name || undefined),
        vendorInvoiceNumber: data.vendorInvoiceNumber !== undefined
          ? data.vendorInvoiceNumber
          : (data.invoiceNumber !== undefined ? data.invoiceNumber : (original.vendor_invoice_number || undefined)),
        description: data.description !== undefined ? data.description : (original.description || ''),
        projectId: data.projectId !== undefined ? data.projectId : (original.project_id || undefined),
        clientId: data.clientId !== undefined
          ? data.clientId
          : (data.customerId !== undefined ? data.customerId : (original.client_id || undefined)),
        isBillable: data.isBillable !== undefined ? Boolean(data.isBillable) : Boolean(original.is_billable),
        markupPercentage: data.markupPercentage !== undefined ? Number(data.markupPercentage) : Number(original.markup_percentage || 0),
        sellingPrice: data.sellingPrice !== undefined ? Number(data.sellingPrice) : Number(original.selling_price || 0),
        taxRate: data.taxRate !== undefined ? Number(data.taxRate) : Number(original.tax_rate || 0),
        taxAmount: data.taxAmount !== undefined ? Number(data.taxAmount) : Number(original.tax_amount || 0),
        taxAccountId: data.taxAccountId !== undefined ? data.taxAccountId : (original.tax_account_id || undefined),
        isTaxInclusive: data.isTaxInclusive !== undefined ? Boolean(data.isTaxInclusive) : Boolean(original.is_tax_inclusive),
        isRcm: data.isRcm !== undefined ? Boolean(data.isRcm) : Boolean(original.is_rcm),
        rcmTaxAccountId: data.rcmTaxAccountId !== undefined ? data.rcmTaxAccountId : (original.rcm_tax_account_id || undefined),
        tdsRate: data.tdsRate !== undefined ? Number(data.tdsRate) : Number(original.tds_rate || 0),
        tdsAmount: data.tdsAmount !== undefined ? Number(data.tdsAmount) : Number(original.tds_amount || 0),
        tdsSection: data.tdsSection !== undefined ? data.tdsSection : (original.tds_section || undefined),
        tdsAccountId: data.tdsAccountId !== undefined ? data.tdsAccountId : (original.tds_account_id || undefined),
        isItemized: data.isItemized !== undefined ? Boolean(data.isItemized) : Boolean(original.is_itemized),
        items: data.items !== undefined ? data.items : (typeof original.items === 'string' ? JSON.parse(original.items) : (original.items || undefined)),
        receiptImages: data.receiptImages,
      };

      const prepared = await this.validateAndPrepareExpenseData(organizationId, mergedInput, client, original.project_id || null);

      const hasFinancialChanges =
        Number(original.amount) !== prepared.amount ||
        originalDate !== targetDate ||
        original.expense_account_id !== mergedInput.expenseAccountId ||
        original.paid_from_account_id !== mergedInput.paidFromAccountId ||
        Boolean(original.is_itemized) !== prepared.isItemized ||
        Number(original.tax_amount || 0) !== prepared.taxAmount ||
        Number(original.tds_amount || 0) !== prepared.tdsAmount ||
        Boolean(original.is_rcm) !== prepared.isRcm ||
        Boolean(original.is_tax_inclusive) !== prepared.isTaxInclusive ||
        (original.project_id || null) !== (prepared.journalLines[0]?.projectId || null) ||
        (original.client_id || null) !== (prepared.journalLines[0]?.customerId || null);

      let newJournalEntryId = original.journal_entry_id;

      if (hasFinancialChanges || !original.journal_entry_id) {
        if (original.journal_entry_id) {
          await FinancialDestructiveActionsService.reversePostedJournal(
            client,
            organizationId,
            original.journal_entry_id,
            effectiveUserId,
            normalizedReason,
            `expense revision ${original.expense_number}`
          );
        }

        const revJournalNumber = await DocumentNumberingEngine.getNextNumber(
          organizationId,
          'JOURNAL',
          targetDate,
          undefined,
          client
        );

        const posting = await ServerPostingEngine.postEntry({
          organizationId,
          entryNumber: revJournalNumber || `JRN-${original.expense_number}-REV-${newId('jrn').slice(-8).toUpperCase()}`,
          date: targetDate,
          reference: original.expense_number,
          description: `Expense paid to ${prepared.vendorName || 'Vendor'} (Revision)`,
          lines: prepared.journalLines,
        }, client);

        newJournalEntryId = posting.entryId;
      }

      let receiptAttachments = [];
      if (data.receiptImages && data.receiptImages.length > 0) {
        const receipts = ExpenseReceiptService.validateUploads(data.receiptImages);
        receiptAttachments = await ExpenseReceiptService.attachToExpense(client, organizationId, expenseId, receipts);
      }

      const itemsJson = prepared.isItemized ? JSON.stringify(prepared.items) : null;

      // Update in-place: original id and expense_number remain intact, status remains POSTED
      await client.query(
        `UPDATE expenses SET
          expense_account_id = $1, paid_from_account_id = $2,
          vendor_id = $3, vendor_name = $4, vendor_invoice_number = $5,
          date = $6, amount = $7, tax_rate = $8, tax_amount = $9, tax_account_id = $10,
          is_tax_inclusive = $11, is_rcm = $12, rcm_tax_account_id = $13,
          tds_rate = $14, tds_amount = $15, tds_section = $16, tds_account_id = $17,
          description = $18, project_id = $19, client_id = $20, is_billable = $21,
          markup_percentage = $22, selling_price = $23,
          is_itemized = $24, items = $25, journal_entry_id = $26
        WHERE organization_id = $27 AND id = $28`,
        [
          mergedInput.expenseAccountId, mergedInput.paidFromAccountId,
          prepared.vendorId, prepared.vendorName, prepared.vendorInvoiceNumber,
          targetDate, prepared.amount, prepared.taxRate, prepared.taxAmount, prepared.resolvedTaxAccountId,
          prepared.isTaxInclusive, prepared.isRcm, prepared.resolvedRcmAccountId,
          prepared.tdsRate, prepared.tdsAmount, mergedInput.tdsSection || null, prepared.resolvedTdsAccountId,
          mergedInput.description || '', mergedInput.projectId || null, prepared.effectiveClientId, prepared.isBillable,
          prepared.markupPercentage, prepared.sellingPrice,
          prepared.isItemized, itemsJson, newJournalEntryId,
          organizationId, expenseId
        ]
      );

      // Record edit event in audit_logs
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'EXPENSE_UPDATED', 'Expense', $4, $5, $6)`,
        [
          newId('aud'),
          organizationId,
          effectiveUserId,
          expenseId,
          JSON.stringify({
            amount: Number(original.amount),
            date: originalDate,
            expenseAccountId: original.expense_account_id,
            paidFromAccountId: original.paid_from_account_id,
            vendorName: original.vendor_name,
            description: original.description,
            isItemized: Boolean(original.is_itemized),
            journalEntryId: original.journal_entry_id,
          }),
          JSON.stringify({
            amount: prepared.amount,
            date: targetDate,
            expenseAccountId: mergedInput.expenseAccountId,
            paidFromAccountId: mergedInput.paidFromAccountId,
            vendorName: prepared.vendorName,
            description: mergedInput.description,
            isItemized: prepared.isItemized,
            journalEntryId: newJournalEntryId,
            reason: normalizedReason,
          }),
        ]
      );

      return {
        id: expenseId,
        expenseNumber: original.expense_number,
        amount: prepared.amount,
        date: targetDate,
        expenseAccountId: mergedInput.expenseAccountId,
        paidFromAccountId: mergedInput.paidFromAccountId,
        vendorId: prepared.vendorId,
        vendorName: prepared.vendorName,
        vendorInvoiceNumber: prepared.vendorInvoiceNumber,
        invoiceNumber: prepared.vendorInvoiceNumber,
        description: mergedInput.description || '',
        projectId: mergedInput.projectId || null,
        clientId: prepared.effectiveClientId,
        isBillable: prepared.isBillable,
        markupPercentage: prepared.markupPercentage,
        sellingPrice: prepared.sellingPrice,
        taxRate: prepared.taxRate,
        taxAmount: prepared.taxAmount,
        taxAccountId: prepared.resolvedTaxAccountId,
        isTaxInclusive: prepared.isTaxInclusive,
        isRcm: prepared.isRcm,
        rcmTaxAccountId: prepared.resolvedRcmAccountId,
        tdsRate: prepared.tdsRate,
        tdsAmount: prepared.tdsAmount,
        tdsSection: mergedInput.tdsSection || null,
        tdsAccountId: prepared.resolvedTdsAccountId,
        isItemized: prepared.isItemized,
        items: prepared.isItemized ? prepared.items : undefined,
        journalEntryId: newJournalEntryId,
        status: original.status || 'POSTED',
        receiptAttachments,
      };
    };

    return transactionClient ? await execute(transactionClient) : await db.transaction(execute);
  }

  /**
   * Correct a posted expense. In Zoho Books, expenses are edited in-place
   * and GL journals are adjusted/reposted without voiding the expense identity.
   */
  public static async correctAndPost(
    organizationId: string,
    userId: string,
    expenseId: string,
    input: ExpensePostingInput,
    reason: string
  ): Promise<{ voidedExpenseId: string; reversalJournalId: string; replacement: any }> {
    const normalizedReason = String(reason || '').trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 1000) {
      throw new Error('EXPENSE_CORRECTION_REASON_INVALID: A correction reason containing 3-1000 characters is required');
    }

    const updated = await this.updateExpense(
      organizationId,
      expenseId,
      input,
      userId,
      normalizedReason
    );

    return {
      voidedExpenseId: expenseId,
      reversalJournalId: updated.journalEntryId,
      replacement: updated,
    };
  }
}
