import { db } from '../database/db';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { newId } from '../utils/ids';
import { DocumentNumberingEngine } from './DocumentNumberingEngine';

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
    if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(String(input.date || ''))) throw new Error('JOURNAL_DATE_INVALID: Date must use YYYY-MM-DD format');
    if (!Array.isArray(input.lines) || input.lines.length < 2 || input.lines.length > 1000) throw new Error('JOURNAL_LINES_INVALID: Journal requires 2-1000 lines');
    if (input.reference && (typeof input.reference !== 'string' || input.reference.length > 255)) throw new Error('JOURNAL_REFERENCE_INVALID: Reference cannot exceed 255 characters');
    if (input.narration && (typeof input.narration !== 'string' || input.narration.length > 4000)) throw new Error('JOURNAL_NARRATION_INVALID: Narration cannot exceed 4000 characters');
    // 1. Validate Debit = Credit
    let totalDebitCents = 0;
    let totalCreditCents = 0;

    for (const [index, l] of input.lines.entries()) {
      const debit = Number(l.debit || 0);
      const credit = Number(l.credit || 0);
      if (!l.accountId || !Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0 || (debit === 0) === (credit === 0) || !Number.isSafeInteger(Math.round(debit * 100)) || !Number.isSafeInteger(Math.round(credit * 100)) || Math.abs(debit * 100 - Math.round(debit * 100)) > 1e-7 || Math.abs(credit * 100 - Math.round(credit * 100)) > 1e-7) {
        throw new Error(`JOURNAL_LINE_INVALID: Line ${index + 1} must contain one safe positive two-decimal debit or credit`);
      }
      totalDebitCents += Math.round(debit * 100);
      totalCreditCents += Math.round(credit * 100);
    }

    if (totalDebitCents !== totalCreditCents) {
      throw new Error(`JOURNAL_NOT_BALANCED: Total Debits (${(totalDebitCents / 100).toFixed(2)}) must equal Total Credits (${(totalCreditCents / 100).toFixed(2)})`);
    }

    if (totalDebitCents <= 0) {
      throw new Error('JOURNAL_ZERO_AMOUNT: Journal must have positive debit/credit amounts');
    }

    // 2. Control account checks
    const accIds = input.lines.map((l) => l.accountId);
    if (accIds.length > 0) {
      const uniqueAccIds = [...new Set(accIds)];
      const placeholders = uniqueAccIds.map((_, index) => `$${index + 2}`).join(', ');
      const accRes = await db.query(
        `SELECT id, code, name, type, sub_type FROM accounts WHERE organization_id = $1 AND id IN (${placeholders})`,
        [orgId, ...uniqueAccIds]
      );
      const accMap = new Map<string, any>();
      for (const r of accRes.rows) accMap.set(r.id, r);

      for (const l of input.lines) {
        const acc = accMap.get(l.accountId);
        if (acc) {
          l.accountCode = l.accountCode || acc.code;
          l.accountName = l.accountName || acc.name;

          const isControl = this.RESTRICTED_CONTROL_SUBTYPES.includes(acc.sub_type) ||
            ['1100', '1200', '1400', '2000', '2100', '2200'].includes(acc.code);
          if (isControl) {
            throw new Error(`JOURNAL_CONTROL_ACCOUNT_RESTRICTED: Control account ${acc.code} (${acc.name}) can only be posted by its certified source-document workflow.`);
          }
        } else {
          throw new Error(`JOURNAL_ACCOUNT_INVALID: Account ${l.accountId} does not belong to this organization`);
        }
      }
    }

    const status = input.status || 'Posted';
    if (status !== 'Posted') {
      throw new Error('JOURNAL_WORKFLOW_REQUIRED: Draft and submitted journals must use the approval workflow');
    }

    return db.transaction(async (tx) => {
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
        [newId('aud'), orgId, userId, posting.entryId, JSON.stringify({ entryNumber, totalDebit: totalDebitCents / 100 })]
      );
      return { id: posting.entryId, entryNumber, status };
    });
  }

  public static async reverseJournal(
    orgId: string,
    userId: string,
    journalId: string,
    reversalReason: string
  ): Promise<{ reversalJournalId: string; reversalEntryNumber: string }> {
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
      if (String(originalJournal.status).toUpperCase() === 'REVERSED') throw new Error('JOURNAL_ALREADY_REVERSED: This journal has already been reversed');
      const linesRes = await tx.query(
        `SELECT jl.* FROM journal_lines jl
          JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE jl.journal_entry_id = $1 AND je.organization_id = $2`,
        [journalId, orgId]
      );
      if (linesRes.rows.length < 2) throw new Error('JOURNAL_INVALID: Original journal has insufficient lines');
      revEntryNumber = `RV-${originalJournal.entry_number}`;

      const updated = await tx.query(
        `UPDATE journal_entries SET status = 'REVERSED'
          WHERE id = $1 AND organization_id = $2 AND UPPER(status) <> 'REVERSED'`,
        [journalId, orgId]
      );
      if (updated.rowCount !== 1) throw new Error('JOURNAL_ALREADY_REVERSED: This journal has already been reversed');
      const posting = await ServerPostingEngine.postEntry({
        organizationId: orgId,
        entryNumber: revEntryNumber,
        date: todayStr,
        reference: `REV-${originalJournal.entry_number}`,
        description: `Reversal of ${originalJournal.entry_number}: ${reversalReason}`,
        lines: linesRes.rows.map((line) => ({
          accountId: line.account_id,
          debit: Number(line.credit || 0),
          credit: Number(line.debit || 0),
          description: `Reversal line: ${line.description || ''}`,
        })),
      }, tx);
      await tx.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'MANUAL_JOURNAL_REVERSED', 'JournalEntry', $4, $5, $6)`,
        [newId('aud'), orgId, userId, journalId, JSON.stringify({ status: originalJournal.status }), JSON.stringify({ status: 'REVERSED', reversalJournalId: posting.entryId, reversalReason })]
      );
      return posting.entryId;
    });

    return { reversalJournalId, reversalEntryNumber: revEntryNumber };
  }
}
