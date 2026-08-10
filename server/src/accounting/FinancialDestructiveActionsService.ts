import { db } from '../database/db';
import { AuditTrailService } from '../security/AuditTrailService';
import { AccountingPeriodService } from './AccountingPeriodService';

export class FinancialDestructiveActionsService {
  public static async voidInvoice(
    organizationId: string,
    invoiceId: string,
    userId: string,
    reason: string
  ): Promise<{ success: boolean; invoiceId: string; journalEntryId?: string }> {
    const invRes = await db.query(
      `SELECT * FROM invoices WHERE id = $1 AND organization_id = $2`,
      [invoiceId, organizationId]
    );

    if (invRes.rows.length === 0) {
      throw new Error(`Invoice [${invoiceId}] not found in organization [${organizationId}]`);
    }

    const invoice = invRes.rows[0];

    // Verify Period Lock
    const isLocked = await AccountingPeriodService.isPeriodLocked(
      organizationId,
      invoice.issue_date || invoice.issueDate
    );
    if (isLocked) {
      throw new Error(`Cannot void invoice in a locked accounting period.`);
    }

    if (invoice.status === 'VOID') {
      throw new Error(`Invoice [${invoiceId}] is already voided.`);
    }

    const paidAmount = Number(invoice.paid_amount || invoice.paidAmount || 0);
    const amountCredited = Number(invoice.amount_credited || invoice.amountCredited || 0);

    const allocRes = await db.query(
      `SELECT COUNT(*) as count FROM payment_received_allocations WHERE invoice_id = $1 AND organization_id = $2`,
      [invoiceId, organizationId]
    );
    const allocCount = Number(allocRes.rows[0]?.count || 0);

    if (paidAmount > 0 || amountCredited > 0 || allocCount > 0) {
      throw new Error(
        `INVOICE_HAS_ALLOCATED_PAYMENTS: Cannot void invoice [${invoiceId}] with active payment allocations or applied credits. Reverse or unallocate payments first.`
      );
    }

    // Reversing journal entry if original invoice was posted
    let reversingJournalId: string | undefined;
    const totalAmount = Number(invoice.total_amount || invoice.totalAmount || 0);

    if (totalAmount > 0) {
      reversingJournalId = `je-rev-inv-${Date.now()}`;
      await db.query(
        `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          reversingJournalId,
          organizationId,
          `REV-${invoice.invoice_number || invoice.invoiceNumber}`,
          new Date().toISOString().split('T')[0],
          invoice.invoice_number || invoice.invoiceNumber,
          `Reversing entry for Voided Invoice ${invoice.invoice_number || invoice.invoiceNumber}: ${reason}`,
          'Posted',
        ]
      );
    }

    // Update invoice status safely to VOID
    await db.query(
      `UPDATE invoices
       SET status = 'VOID', balance_due = 0.00, notes = COALESCE(notes, '') || ' [VOIDED: ' || $1 || ']'
       WHERE id = $2 AND organization_id = $3`,
      [reason, invoiceId, organizationId]
    );

    await AuditTrailService.logAction({
      organizationId,
      userId,
      action: 'INVOICE_VOIDED',
      entityType: 'INVOICE',
      entityId: invoiceId,
      beforeState: { status: invoice.status, balanceDue: invoice.balance_due },
      afterState: { status: 'VOID', balanceDue: 0, reason, reversingJournalId },
    });

    return { success: true, invoiceId, journalEntryId: reversingJournalId };
  }

  public static async reversePaymentReceived(
    organizationId: string,
    paymentId: string,
    userId: string,
    reason: string
  ): Promise<{ success: boolean; paymentId: string; journalEntryId?: string }> {
    const payRes = await db.query(
      `SELECT * FROM payments_received WHERE id = $1 AND organization_id = $2`,
      [paymentId, organizationId]
    );

    if (payRes.rows.length === 0) {
      throw new Error(`Payment [${paymentId}] not found in organization [${organizationId}]`);
    }

    const payment = payRes.rows[0];

    const isLocked = await AccountingPeriodService.isPeriodLocked(
      organizationId,
      payment.payment_date || payment.paymentDate
    );
    if (isLocked) {
      throw new Error(`Cannot reverse payment in a locked accounting period.`);
    }

    if (payment.status === 'REVERSED') {
      throw new Error(`Payment [${paymentId}] is already reversed.`);
    }

    // Re-open allocated invoice balances
    const allocRes = await db.query(
      `SELECT * FROM payment_received_allocations WHERE payment_id = $1 AND organization_id = $2`,
      [paymentId, organizationId]
    );

    for (const alloc of allocRes.rows) {
      const invId = alloc.invoice_id || alloc.invoiceId;
      const amount = Number(alloc.amount || 0);

      await db.query(
        `UPDATE invoices
         SET paid_amount = GREATEST(0.00, paid_amount - $1),
             balance_due = balance_due + $1,
             status = CASE WHEN total_amount = balance_due + $1 THEN 'Unpaid' ELSE 'Partially Paid' END
         WHERE id = $2 AND organization_id = $3`,
        [amount, invId, organizationId]
      );
    }

    // Reversing journal entry
    const reversingJournalId = `je-rev-payrec-${Date.now()}`;
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        reversingJournalId,
        organizationId,
        `REV-${payment.payment_number || payment.paymentNumber}`,
        new Date().toISOString().split('T')[0],
        payment.payment_number || payment.paymentNumber,
        `Reversing entry for Customer Payment ${payment.payment_number || payment.paymentNumber}: ${reason}`,
        'Posted',
      ]
    );

    // Update payment status to REVERSED
    await db.query(
      `UPDATE payments_received SET status = 'REVERSED' WHERE id = $1 AND organization_id = $2`,
      [paymentId, organizationId]
    );

    await AuditTrailService.logAction({
      organizationId,
      userId,
      action: 'PAYMENT_RECEIVED_REVERSED',
      entityType: 'PAYMENT_RECEIVED',
      entityId: paymentId,
      beforeState: { status: payment.status },
      afterState: { status: 'REVERSED', reason, reversingJournalId },
    });

    return { success: true, paymentId, journalEntryId: reversingJournalId };
  }

  public static async reverseJournalEntry(
    organizationId: string,
    journalEntryId: string,
    userId: string,
    reason: string
  ): Promise<{ success: boolean; originalId: string; reversingId: string }> {
    const jeRes = await db.query(
      `SELECT * FROM journal_entries WHERE id = $1 AND organization_id = $2`,
      [journalEntryId, organizationId]
    );

    if (jeRes.rows.length === 0) {
      throw new Error(`Journal entry [${journalEntryId}] not found in organization [${organizationId}]`);
    }

    const je = jeRes.rows[0];

    const isLocked = await AccountingPeriodService.isPeriodLocked(
      organizationId,
      je.date
    );
    if (isLocked) {
      throw new Error(`Cannot reverse journal entry in a locked accounting period.`);
    }

    if (je.status === 'REVERSED') {
      throw new Error(`Journal entry [${journalEntryId}] is already reversed.`);
    }

    const linesRes = await db.query(
      `SELECT * FROM journal_lines WHERE journal_entry_id = $1`,
      [journalEntryId]
    );

    const reversingId = `je-rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString().split('T')[0];

    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        reversingId,
        organizationId,
        `REV-${je.entry_number || je.entryNumber}`,
        now,
        je.entry_number || je.entryNumber,
        `Reversing Journal Entry for ${je.entry_number || je.entryNumber}: ${reason}`,
        'Posted',
      ]
    );

    // Swap debits and credits for reversing journal lines
    for (const line of linesRes.rows) {
      const lineId = `jl-rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const debit = Number(line.credit || 0);
      const credit = Number(line.debit || 0);

      await db.query(
        `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          lineId,
          reversingId,
          line.account_id || line.accountId,
          line.account_code || line.accountCode,
          line.account_name || line.accountName,
          debit,
          credit,
          `Reversal of line ${line.id}: ${reason}`,
        ]
      );
    }

    // Mark original entry status = REVERSED
    await db.query(
      `UPDATE journal_entries SET status = 'REVERSED' WHERE id = $1 AND organization_id = $2`,
      [journalEntryId, organizationId]
    );

    await AuditTrailService.logAction({
      organizationId,
      userId,
      action: 'JOURNAL_ENTRY_REVERSED',
      entityType: 'JOURNAL_ENTRY',
      entityId: journalEntryId,
      afterState: { originalStatus: 'REVERSED', reversingId, reason },
    });

    return { success: true, originalId: journalEntryId, reversingId };
  }
}
