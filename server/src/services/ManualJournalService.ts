import { db } from '../database/db';
import { ServerPostingEngine } from '../accounting/postingEngine';

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
    // 1. Validate Debit = Credit
    let totalDebit = 0;
    let totalCredit = 0;

    for (const l of input.lines) {
      totalDebit += Number(l.debit || 0);
      totalCredit += Number(l.credit || 0);
    }

    if (Math.abs(totalDebit - totalCredit) >= 0.01) {
      throw new Error(`JOURNAL_NOT_BALANCED: Total Debits (${totalDebit.toFixed(2)}) must equal Total Credits (${totalCredit.toFixed(2)})`);
    }

    if (totalDebit <= 0) {
      throw new Error('JOURNAL_ZERO_AMOUNT: Journal must have positive debit/credit amounts');
    }

    // 2. Control account checks
    const accIds = input.lines.map((l) => l.accountId);
    if (accIds.length > 0) {
      const accRes = await db.query(
        `SELECT id, code, name, type, sub_type, is_system_account FROM accounts WHERE organization_id = $1 AND id = ANY($2)`,
        [orgId, accIds]
      );
      const accMap = new Map<string, any>();
      for (const r of accRes.rows) accMap.set(r.id, r);

      for (const l of input.lines) {
        const acc = accMap.get(l.accountId);
        if (acc) {
          l.accountCode = l.accountCode || acc.code;
          l.accountName = l.accountName || acc.name;

          const isControl =
            acc.is_system_account ||
            this.RESTRICTED_CONTROL_SUBTYPES.includes(acc.sub_type) ||
            ['1100', '2000', '2100', '1400'].includes(acc.code);

          if (isControl && !l.customerId && !l.vendorId && (!input.narration || input.narration.length < 5)) {
            throw new Error(`JOURNAL_CONTROL_ACCOUNT_RESTRICTED: Direct posting to control account ${acc.code} (${acc.name}) requires a customer/vendor reference or specific audit narration.`);
          }
        }
      }
    }

    const entryNumber = `JV-${Date.now().toString().slice(-6)}`;
    const status = input.status || 'Posted';
    const journalId = `jrn-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status, approval_status, is_manual, source_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          journalId,
          orgId,
          entryNumber,
          input.date,
          input.reference || '',
          input.narration || '',
          status,
          status === 'Posted' ? 'APPROVED' : 'DRAFT',
          true,
          'MANUAL_JOURNAL',
        ]
      );

      for (const l of input.lines) {
        const lineId = `jl-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        await tx.query(
          `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit, description, project_id, cost_center_id, business_line, location_id, customer_id, vendor_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            lineId,
            journalId,
            l.accountId,
            l.accountCode || '',
            l.accountName || '',
            l.debit || 0,
            l.credit || 0,
            l.description || input.narration || '',
            l.projectId || null,
            l.costCenterId || null,
            l.businessLine || null,
            l.locationId || null,
            l.customerId || null,
            l.vendorId || null,
          ]
        );

        // Update account balance if Posted
        if (status === 'Posted') {
          await tx.query(
            `UPDATE accounts SET balance = balance + $1 - $2 WHERE id = $3 AND organization_id = $4`,
            [l.debit || 0, l.credit || 0, l.accountId, orgId]
          );
        }
      }
    });

    return { id: journalId, entryNumber, status };
  }

  public static async reverseJournal(
    orgId: string,
    userId: string,
    journalId: string,
    reversalReason: string
  ): Promise<{ reversalJournalId: string; reversalEntryNumber: string }> {
    const jRes = await db.query(
      `SELECT * FROM journal_entries WHERE organization_id = $1 AND id = $2`,
      [orgId, journalId]
    );
    if (jRes.rows.length === 0) {
      throw new Error('JOURNAL_NOT_FOUND: Journal entry does not exist');
    }

    const originalJournal = jRes.rows[0];
    if (originalJournal.status === 'REVERSED') {
      throw new Error('JOURNAL_ALREADY_REVERSED: This journal has already been reversed');
    }

    const linesRes = await db.query(
      `SELECT * FROM journal_lines WHERE journal_entry_id = $1`,
      [journalId]
    );

    const revEntryNumber = `RV-${originalJournal.entry_number}`;
    const revJournalId = `jrn-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const todayStr = new Date().toISOString().split('T')[0];

    await db.transaction(async (tx) => {
      // 1. Mark original journal as REVERSED
      await tx.query(
        `UPDATE journal_entries SET status = 'REVERSED' WHERE id = $1 AND organization_id = $2`,
        [journalId, orgId]
      );

      // 2. Insert reversal journal entry
      await tx.query(
        `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status, approval_status, is_manual, source_type, source_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          revJournalId,
          orgId,
          revEntryNumber,
          todayStr,
          `REV-${originalJournal.entry_number}`,
          `Reversal of ${originalJournal.entry_number}: ${reversalReason}`,
          'Posted',
          'APPROVED',
          true,
          'JOURNAL_REVERSAL',
          journalId,
        ]
      );

      // 3. Insert inverted lines and update account balances
      for (const l of linesRes.rows) {
        const revLineId = `jl-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const revDebit = Number(l.credit || 0);
        const revCredit = Number(l.debit || 0);

        await tx.query(
          `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit, description, project_id, cost_center_id, business_line, location_id, customer_id, vendor_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            revLineId,
            revJournalId,
            l.account_id,
            l.account_code,
            l.account_name,
            revDebit,
            revCredit,
            `Reversal line: ${l.description || ''}`,
            l.project_id,
            l.cost_center_id,
            l.business_line,
            l.location_id,
            l.customer_id,
            l.vendor_id,
          ]
        );

        await tx.query(
          `UPDATE accounts SET balance = balance + $1 - $2 WHERE id = $3 AND organization_id = $4`,
          [revDebit, revCredit, l.account_id, orgId]
        );
      }
    });

    return { reversalJournalId: revJournalId, reversalEntryNumber: revEntryNumber };
  }
}
