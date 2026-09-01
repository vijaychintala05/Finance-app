import { db, type DbQueryClient } from '../database/db';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { newId } from '../utils/ids';
import { DocumentNumberingEngine } from './DocumentNumberingEngine';
import { centsToSafeNumber, moneyInputToCents } from '../utils/money';
import { isIsoCalendarDate } from '../utils/date';
import { ApprovalWorkflowService } from '../approvals/ApprovalWorkflowService';

export interface ManualJournalLineInput {
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debit: number;
  credit: number;
  description?: string;
  projectId?: string;
  costCenterId?: string;
  businessLine?: string;
  locationId?: string;
  customerId?: string;
  vendorId?: string;
}

export interface ManualJournalInput {
  date: string;
  reference?: string;
  narration?: string;
  lines: ManualJournalLineInput[];
  status?: 'Draft' | 'Submitted' | 'Approved' | 'Posted';
  draftId?: string;
}

export class ManualJournalService {
  private static RESTRICTED_CONTROL_SUBTYPES = [
    'Accounts Receivable',
    'Accounts Payable',
    'AR_CONTROL',
    'AP_CONTROL',
    'CUSTOMER_ADVANCE',
    'VENDOR_ADVANCE',
    'INVENTORY_CONTROL',
    'TAX_CONTROL',
  ];

  public static async createJournal(
    orgId: string,
    userId: string,
    input: ManualJournalInput
  ): Promise<{ id: string; entryNumber: string; status: string }> {
    if (!input || !isIsoCalendarDate(input.date)) throw new Error('JOURNAL_DATE_INVALID: Date must be a real calendar date using YYYY-MM-DD format');
    if (!Array.isArray(input.lines) || input.lines.length < 2 || input.lines.length > 1000) throw new Error('JOURNAL_LINES_INVALID: Journal requires 2-1000 lines');
    if (input.reference && (typeof input.reference !== 'string' || input.reference.length > 255)) throw new Error('JOURNAL_REFERENCE_INVALID: Reference cannot exceed 255 characters');
    if (input.narration && (typeof input.narration !== 'string' || input.narration.length > 4000)) throw new Error('JOURNAL_NARRATION_INVALID: Narration cannot exceed 4000 characters');
    // 1. Validate Debit = Credit
    let totalDebitCents = 0n;
    let totalCreditCents = 0n;

    for (const [index, l] of input.lines.entries()) {
      let debitCents: bigint;
      let creditCents: bigint;
      try {
        debitCents = moneyInputToCents(l.debit || 0, `Line ${index + 1} debit`);
        creditCents = moneyInputToCents(l.credit || 0, `Line ${index + 1} credit`);
      } catch {
        throw new Error(`JOURNAL_LINE_INVALID: Line ${index + 1} must contain one safe positive two-decimal debit or credit`);
      }
      if (!l.accountId || debitCents < 0n || creditCents < 0n || (debitCents === 0n) === (creditCents === 0n)) {
        throw new Error(`JOURNAL_LINE_INVALID: Line ${index + 1} must contain one safe positive two-decimal debit or credit`);
      }
      totalDebitCents += debitCents;
      totalCreditCents += creditCents;
    }

    if (totalDebitCents !== totalCreditCents) {
      throw new Error(`JOURNAL_NOT_BALANCED: Total Debits and Total Credits differ`);
    }

    if (totalDebitCents <= 0n) {
      throw new Error('JOURNAL_ZERO_AMOUNT: Journal must have positive debit/credit amounts');
    }

    // 2. Control account checks
    const accIds = input.lines.map((l) => l.accountId);
    if (accIds.length > 0) {
      const uniqueAccIds = [...new Set(accIds)];
      const placeholders = uniqueAccIds.map((_, index) => `$${index + 2}`).join(', ');
      const accRes = await db.query(
        `SELECT id, code, name, type, sub_type, system_role, status, allow_direct_posting FROM accounts WHERE organization_id = $1 AND id IN (${placeholders})`,
        [orgId, ...uniqueAccIds]
      );
      const accMap = new Map<string, any>();
      for (const r of accRes.rows) accMap.set(r.id, r);

      for (const l of input.lines) {
        const acc = accMap.get(l.accountId);
        if (acc) {
          if (acc.status !== 'Active') throw new Error(`JOURNAL_ACCOUNT_INACTIVE: Account ${acc.code} (${acc.name}) is archived`);
          if (acc.allow_direct_posting === false) throw new Error(`JOURNAL_DIRECT_POSTING_RESTRICTED: Account ${acc.code} (${acc.name}) must be posted through its approved workflow.`);
          l.accountCode = l.accountCode || acc.code;
          l.accountName = l.accountName || acc.name;

          const isControl = this.RESTRICTED_CONTROL_SUBTYPES.includes(acc.sub_type) ||
            ['AR_CONTROL', 'AP_CONTROL', 'CUSTOMER_ADVANCE', 'VENDOR_ADVANCE', 'GST_INPUT', 'GST_OUTPUT', 'TDS_RECEIVABLE', 'TDS_PAYABLE'].includes(acc.system_role) ||
            ['1100', '1200', '1400', '2000', '2100', '2200'].includes(acc.code);
          if (isControl) {
            throw new Error(`JOURNAL_CONTROL_ACCOUNT_RESTRICTED: Control account ${acc.code} (${acc.name}) can only be posted by its certified source-document workflow.`);
          }
        } else {
          throw new Error(`JOURNAL_ACCOUNT_INVALID: Account ${l.accountId} does not belong to this organization`);
        }
      }
    }

    const totalDebit = centsToSafeNumber(totalDebitCents, 'Journal total debit');
    const requiresApproval = await ApprovalWorkflowService.requiresApproval(orgId, 'MANUAL_JOURNAL', totalDebit);

    // If approval is required and no approved draft is supplied, persist as a Submitted draft and register approval request.
    if (requiresApproval && !input.draftId) {
      return db.transaction(async (tx) => {
        const draftId = newId('jrn');
        const entryNumber = await DocumentNumberingEngine.getNextNumber(orgId, 'JOURNAL', input.date, undefined, tx);

        await tx.query(
          `INSERT INTO journal_entries
            (id, organization_id, entry_number, date, reference, description, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'Submitted')`,
          [draftId, orgId, entryNumber, input.date, input.reference || '', input.narration || 'Manual journal']
        );

        for (const line of input.lines) {
          await tx.query(
            `INSERT INTO journal_lines
            (id, journal_entry_id, account_id, account_code, account_name, debit, credit, description, project_id, customer_id, vendor_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [newId('jln'), draftId, line.accountId, line.accountCode || null, line.accountName || null, line.debit, line.credit, line.description || '', line.projectId || null, line.customerId || null, line.vendorId || null]
          );
        }

        const req = await ApprovalWorkflowService.submitForApproval(orgId, 'MANUAL_JOURNAL', draftId, userId, totalDebit, tx);

        await tx.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
           VALUES ($1, $2, $3, 'MANUAL_JOURNAL_SUBMITTED', 'JournalEntry', $4, $5)`,
          [newId('aud'), orgId, userId, draftId, JSON.stringify({ entryNumber, totalDebit, status: 'Submitted', approvalRequestId: req.id })]
        );

        return { id: draftId, entryNumber, status: 'Submitted' };
      });
    }

    // Posting branch: If approval was required, strictly verify and consume the approved request in PostgreSQL!
    return db.transaction(async (tx) => {
      if (requiresApproval && input.draftId) {
        await ApprovalWorkflowService.consumeApproval(orgId, 'MANUAL_JOURNAL', input.draftId, tx);

        const draftRes = await tx.query(
          `SELECT * FROM journal_entries WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [orgId, input.draftId]
        );
        if (draftRes.rows.length === 0) throw new Error('JOURNAL_DRAFT_NOT_FOUND: Submitted journal draft does not exist');
        if (draftRes.rows[0].status === 'Posted') throw new Error('JOURNAL_ALREADY_POSTED: This journal is already posted');

        // Post lines to accounts
        for (const line of input.lines) {
          const accRes = await tx.query(`SELECT normal_balance FROM accounts WHERE id = $1 AND organization_id = $2`, [line.accountId, orgId]);
          const normalDebit = (accRes.rows[0]?.normal_balance || 'Debit') === 'Debit';
          const balanceDelta = normalDebit ? line.debit - line.credit : line.credit - line.debit;
          await tx.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND organization_id = $3', [balanceDelta, line.accountId, orgId]);
        }

        await tx.query(`UPDATE journal_entries SET status = 'Posted' WHERE id = $1 AND organization_id = $2`, [input.draftId, orgId]);

        await tx.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
           VALUES ($1, $2, $3, 'MANUAL_JOURNAL_POSTED', 'JournalEntry', $4, $5)`,
          [newId('aud'), orgId, userId, input.draftId, JSON.stringify({ entryNumber: draftRes.rows[0].entry_number, totalDebit, status: 'Posted' })]
        );

        return { id: input.draftId, entryNumber: draftRes.rows[0].entry_number, status: 'Posted' };
      }

      // If approval is not required, post directly via ServerPostingEngine
      const entryNumber = await DocumentNumberingEngine.getNextNumber(orgId, 'JOURNAL', input.date, undefined, tx);
      const posting = await ServerPostingEngine.postEntry({
        organizationId: orgId,
        entryNumber,
        date: input.date,
        reference: input.reference,
        description: input.narration || 'Manual journal',
        lines: input.lines,
      }, tx);
      await tx.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'MANUAL_JOURNAL_CREATED', 'JournalEntry', $4, $5)`,
        [newId('aud'), orgId, userId, posting.entryId, JSON.stringify({ entryNumber, totalDebit })]
      );
      return { id: posting.entryId, entryNumber, status: 'Posted' };
    });
  }

  public static async postApprovedJournal(
    orgId: string,
    userId: string,
    draftId: string,
    transactionClient?: DbQueryClient
  ): Promise<{ id: string; entryNumber: string; status: string }> {
    const execute = async (tx: DbQueryClient) => {
      const draftRes = await tx.query(
        `SELECT * FROM journal_entries WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [orgId, draftId]
      );
      if (draftRes.rows.length === 0) throw new Error('JOURNAL_DRAFT_NOT_FOUND: Journal draft does not exist');
      if (draftRes.rows[0].status === 'Posted') throw new Error('JOURNAL_ALREADY_POSTED: Journal is already posted');

      const linesRes = await tx.query(
        `SELECT * FROM journal_lines WHERE journal_entry_id = $1 ORDER BY id ASC`,
        [draftId]
      );
      if (linesRes.rows.length < 2) throw new Error('JOURNAL_LINES_INVALID: Draft journal has invalid lines');

      const lines: ManualJournalLineInput[] = linesRes.rows.map((r) => ({
        accountId: r.account_id,
        accountCode: r.account_code,
        accountName: r.account_name,
        debit: Number(r.debit || 0),
        credit: Number(r.credit || 0),
        description: r.description,
      }));

      await ApprovalWorkflowService.consumeApproval(orgId, 'MANUAL_JOURNAL', draftId, tx);

      for (const line of lines) {
        const accRes = await tx.query(`SELECT normal_balance FROM accounts WHERE id = $1 AND organization_id = $2`, [line.accountId, orgId]);
        const normalDebit = (accRes.rows[0]?.normal_balance || 'Debit') === 'Debit';
        const balanceDelta = normalDebit ? line.debit - line.credit : line.credit - line.debit;
        await tx.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND organization_id = $3', [balanceDelta, line.accountId, orgId]);
      }

      await tx.query(`UPDATE journal_entries SET status = 'Posted' WHERE id = $1 AND organization_id = $2`, [draftId, orgId]);

      await tx.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'MANUAL_JOURNAL_POSTED', 'JournalEntry', $4, $5)`,
        [newId('aud'), orgId, userId, draftId, JSON.stringify({ entryNumber: draftRes.rows[0].entry_number, status: 'Posted' })]
      );

      return { id: draftId, entryNumber: draftRes.rows[0].entry_number, status: 'Posted' };
    };

    if (transactionClient) return await execute(transactionClient);
    return await db.transaction(execute);
  }

  public static async createBulkJournals(
    orgId: string,
    userId: string,
    entries: ManualJournalInput[]
  ): Promise<Array<{ id: string; entryNumber: string; status: string }>> {
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 100) {
      throw new Error('BULK_JOURNAL_BATCH_INVALID: A batch must contain 1-100 journal entries');
    }
    return db.transaction(async () => {
      const created: Array<{ id: string; entryNumber: string; status: string }> = [];
      for (const entry of entries) {
        created.push(await this.createJournal(orgId, userId, entry));
      }
      return created;
    });
  }

  public static async reverseJournal(
    orgId: string,
    userId: string,
    journalId: string,
    reversalReason: string
  ): Promise<{ reversalJournalId: string; reversalEntryNumber: string }> {
    const normalizedReason = String(reversalReason || '').trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 1000) {
      throw new Error('JOURNAL_REVERSAL_REASON_INVALID: Reversal reason must contain 3-1000 characters');
    }
    const todayStr = new Date().toISOString().split('T')[0];
    let revEntryNumber = '';
    const reversalJournalId = await db.transaction(async (tx) => {
      const jRes = await tx.query(
        `SELECT * FROM journal_entries WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [orgId, journalId]
      );
      if (jRes.rows.length === 0) throw new Error('JOURNAL_NOT_FOUND: Journal entry does not exist');
      const originalJournal = jRes.rows[0];
      if (!String(originalJournal.entry_number || '').startsWith('JV/')) {
        throw new Error('JOURNAL_REVERSAL_SCOPE: Only manual journals can use this endpoint; source documents require their own audited reversal workflow');
      }
      if (originalJournal.reversed_by_journal_id) throw new Error('JOURNAL_ALREADY_REVERSED: This journal has already been reversed');
      const linesRes = await tx.query(
        `SELECT jl.* FROM journal_lines jl
          JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE jl.journal_entry_id = $1 AND je.organization_id = $2`,
        [journalId, orgId]
      );
      if (linesRes.rows.length < 2) throw new Error('JOURNAL_INVALID: Original journal has insufficient lines');
      revEntryNumber = `RV-${originalJournal.entry_number}`;

      const posting = await ServerPostingEngine.postEntry({
        organizationId: orgId,
        entryNumber: revEntryNumber,
        date: todayStr,
        reference: `REV-${originalJournal.entry_number}`,
        description: `Reversal of ${originalJournal.entry_number}: ${normalizedReason}`,
        lines: linesRes.rows.map((line) => ({
          accountId: line.account_id,
          debit: Number(line.credit || 0),
          credit: Number(line.debit || 0),
          description: `Reversal line: ${line.description || ''}`,
        })),
      }, tx);
      await tx.query(
        `UPDATE journal_entries
            SET reversal_of_journal_id = $1, reversal_reason = $2
          WHERE id = $3 AND organization_id = $4`,
        [journalId, normalizedReason, posting.entryId, orgId]
      );
      const updated = await tx.query(
        `UPDATE journal_entries
            SET reversed_by_journal_id = $1, reversed_at = CURRENT_TIMESTAMP,
                reversed_by = $2, reversal_reason = $3
          WHERE id = $4 AND organization_id = $5 AND reversed_by_journal_id IS NULL`,
        [posting.entryId, userId, normalizedReason, journalId, orgId]
      );
      if (updated.rowCount !== 1) throw new Error('JOURNAL_ALREADY_REVERSED: This journal has already been reversed');
      await tx.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'MANUAL_JOURNAL_REVERSED', 'JournalEntry', $4, $5, $6)`,
        [newId('aud'), orgId, userId, journalId, JSON.stringify({ status: originalJournal.status }), JSON.stringify({ status: originalJournal.status, reversalJournalId: posting.entryId, reversalReason: normalizedReason })]
      );
      return posting.entryId;
    });

    return { reversalJournalId, reversalEntryNumber: revEntryNumber };
  }
}
