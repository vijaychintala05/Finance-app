import { ServerPostingEngine } from './postingEngine';
import { db, DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';
import { databaseMoneyToCents } from '../utils/money';
import { DocumentNumberingEngine } from '../services/DocumentNumberingEngine';

interface ReversalResult {
  success: boolean;
  journalEntryId: string;
}

function validReason(reason: string): string {
  const normalized = String(reason || '').trim();
  if (normalized.length < 3 || normalized.length > 1000) {
    throw new Error('REVERSAL_REASON_INVALID: A reversal reason containing 3-1000 characters is required');
  }
  return normalized;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export class FinancialDestructiveActionsService {
  public static async reversePostedJournal(
    client: DbQueryClient,
    organizationId: string,
    journalEntryId: string,
    userId: string,
    reason: string,
    sourceLabel: string
  ): Promise<string> {
    const originalResult = await client.query(
      `SELECT * FROM journal_entries
        WHERE organization_id = $1 AND id = $2
        FOR UPDATE`,
      [organizationId, journalEntryId]
    );
    if (originalResult.rows.length !== 1) throw new Error(`${sourceLabel} posting journal was not found`);
    const original = originalResult.rows[0];
    if (String(original.status).toUpperCase() !== 'POSTED') throw new Error(`${sourceLabel} posting journal is not posted`);
    if (original.reversed_by_journal_id) throw new Error(`${sourceLabel} posting has already been reversed`);
    if (original.reversal_of_journal_id) throw new Error('A reversal journal cannot itself be reversed through a source-document workflow');

    const lines = await client.query(
      `SELECT jl.account_id, jl.debit, jl.credit, jl.description
         FROM journal_lines jl
         JOIN accounts a ON a.id = jl.account_id AND a.organization_id = $1
        WHERE jl.journal_entry_id = $2
        ORDER BY jl.id`,
      [organizationId, journalEntryId]
    );
    if (lines.rows.length < 2) throw new Error(`${sourceLabel} posting journal has insufficient lines`);

    const reversalDate = todayUtc();
    const reversalNumber = await DocumentNumberingEngine.getNextNumber(
      organizationId,
      'JOURNAL',
      reversalDate,
      undefined,
      client
    );
    const reversal = await ServerPostingEngine.postEntry({
      organizationId,
      entryNumber: reversalNumber,
      date: reversalDate,
      reference: String(original.entry_number || '').slice(0, 255),
      description: `Reversal of ${sourceLabel}: ${reason}`,
      lines: lines.rows.map((line) => ({
        accountId: line.account_id,
        debit: Number(line.credit || 0),
        credit: Number(line.debit || 0),
        description: `Reversal: ${String(line.description || '').slice(0, 900)}`,
      })),
    }, client);

    await client.query(
      `UPDATE journal_entries
          SET reversal_of_journal_id = $1, reversal_reason = $2
        WHERE organization_id = $3 AND id = $4`,
      [journalEntryId, reason, organizationId, reversal.entryId]
    );
    const linked = await client.query(
      `UPDATE journal_entries
          SET reversed_by_journal_id = $1, reversed_at = CURRENT_TIMESTAMP,
              reversed_by = $2, reversal_reason = $3
        WHERE organization_id = $4 AND id = $5 AND reversed_by_journal_id IS NULL`,
      [reversal.entryId, userId, reason, organizationId, journalEntryId]
    );
    if (linked.rowCount !== 1) throw new Error(`${sourceLabel} posting was reversed concurrently`);
    return reversal.entryId;
  }

  private static async audit(
    client: DbQueryClient,
    organizationId: string,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    beforeState: unknown,
    afterState: unknown
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_logs
        (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newId('aud'), organizationId, userId, action, entityType, entityId, JSON.stringify(beforeState), JSON.stringify(afterState)]
    );
  }

  public static async voidInvoice(
    organizationId: string,
    invoiceId: string,
    userId: string,
    reason: string
  ): Promise<ReversalResult & { invoiceId: string }> {
    const normalizedReason = validReason(reason);
    return db.transaction(async (client) => {
      const result = await client.query(
        `SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, invoiceId]
      );
      if (result.rows.length !== 1) throw new Error('Invoice was not found in this organization');
      const invoice = result.rows[0];
      if (['VOID', 'VOIDED'].includes(String(invoice.status).toUpperCase())) throw new Error('Invoice is already voided');
      const financialState = [invoice.paid_amount, invoice.amount_credited, invoice.amount_written_off]
        .map((value, index) => databaseMoneyToCents(value, `Invoice settlement amount ${index + 1}`));
      const allocations = await client.query(
        `SELECT COUNT(*) AS count
           FROM payment_received_allocations pra
           JOIN payments_received pr ON pr.id = pra.payment_id AND pr.organization_id = pra.organization_id
          WHERE pra.organization_id = $1 AND pra.invoice_id = $2
            AND UPPER(pr.status) <> 'REVERSED'`,
        [organizationId, invoiceId]
      );
      if (financialState.some((value) => value !== 0n) || Number(allocations.rows[0]?.count || 0) > 0) {
        throw new Error('INVOICE_HAS_ALLOCATED_PAYMENTS: Reverse all payments and credits before voiding this invoice');
      }
      if (!invoice.journal_entry_id) throw new Error('Invoice has no certified posting journal to reverse');

      const reversalJournalId = await this.reversePostedJournal(
        client, organizationId, invoice.journal_entry_id, userId, normalizedReason,
        `invoice ${invoice.invoice_number}`
      );
      const updated = await client.query(
        `UPDATE invoices
            SET status = 'VOIDED', balance_due = 0,
                reversal_journal_id = $1, reversed_at = CURRENT_TIMESTAMP,
                reversed_by = $2, reversal_reason = $3
          WHERE organization_id = $4 AND id = $5
            AND UPPER(status) NOT IN ('VOID', 'VOIDED')`,
        [reversalJournalId, userId, normalizedReason, organizationId, invoiceId]
      );
      if (updated.rowCount !== 1) throw new Error('Invoice state changed concurrently');
      if (invoice.sales_order_id) {
        const salesOrder = await client.query(
          `SELECT total_amount, invoiced_amount FROM sales_orders
            WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [organizationId, invoice.sales_order_id]
        );
        if (salesOrder.rows.length !== 1) throw new Error('Invoice source sales order was not found');
        const newInvoicedCents = databaseMoneyToCents(salesOrder.rows[0].invoiced_amount, 'Sales order invoiced amount')
          - databaseMoneyToCents(invoice.total_amount, 'Voided invoice total');
        if (newInvoicedCents < 0n) throw new Error('Invoice total exceeds the sales order invoiced amount');
        const orderTotalCents = databaseMoneyToCents(salesOrder.rows[0].total_amount, 'Sales order total');
        const orderStatus = newInvoicedCents === 0n
          ? 'CONFIRMED'
          : newInvoicedCents >= orderTotalCents ? 'INVOICED' : 'PARTIALLY_INVOICED';
        await client.query(
          `UPDATE sales_orders SET invoiced_amount = $1, status = $2
            WHERE organization_id = $3 AND id = $4`,
          [Number(newInvoicedCents) / 100, orderStatus, organizationId, invoice.sales_order_id]
        );
      }
      await this.audit(client, organizationId, userId, 'INVOICE_VOIDED', 'Invoice', invoiceId,
        { status: invoice.status, balanceDue: invoice.balance_due },
        { status: 'VOIDED', balanceDue: 0, reversalJournalId, reason: normalizedReason });
      return { success: true, invoiceId, journalEntryId: reversalJournalId };
    });
  }

  public static async reversePaymentReceived(
    organizationId: string,
    paymentId: string,
    userId: string,
    reason: string
  ): Promise<ReversalResult & { paymentId: string }> {
    const normalizedReason = validReason(reason);
    return db.transaction(async (client) => {
      const result = await client.query(
        `SELECT * FROM payments_received WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, paymentId]
      );
      if (result.rows.length !== 1) throw new Error('Payment was not found in this organization');
      const payment = result.rows[0];
      if (String(payment.status).toUpperCase() === 'REVERSED') throw new Error('Payment is already reversed');
      if (!payment.journal_entry_id) throw new Error('Payment has no certified posting journal to reverse');

      const advances = await client.query(
        `SELECT * FROM customer_advances WHERE organization_id = $1 AND payment_id = $2 FOR UPDATE`,
        [organizationId, paymentId]
      );
      for (const advance of advances.rows) {
        if (databaseMoneyToCents(advance.amount, 'Customer advance amount') !==
            databaseMoneyToCents(advance.unapplied_amount, 'Customer advance unapplied amount')) {
          throw new Error('PAYMENT_ADVANCE_APPLIED: Reverse all applications of this customer advance before reversing the payment');
        }
      }

      const allocations = await client.query(
        `SELECT * FROM payment_received_allocations
          WHERE organization_id = $1 AND payment_id = $2
          FOR UPDATE`,
        [organizationId, paymentId]
      );
      for (const allocation of allocations.rows) {
        const invoiceResult = await client.query(
          `SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [organizationId, allocation.invoice_id]
        );
        if (invoiceResult.rows.length !== 1) throw new Error('Allocated invoice was not found');
        const invoice = invoiceResult.rows[0];
        if (['VOID', 'VOIDED'].includes(String(invoice.status).toUpperCase())) throw new Error('Cannot reverse a payment allocated to a voided invoice');
        const allocatedCents = databaseMoneyToCents(allocation.amount, 'Payment allocation');
        const paidCents = databaseMoneyToCents(invoice.paid_amount, 'Invoice paid amount');
        if (allocatedCents > paidCents) throw new Error('Payment allocation exceeds the invoice paid amount');
        const newPaidCents = paidCents - allocatedCents;
        const newBalanceCents = databaseMoneyToCents(invoice.total_amount, 'Invoice total')
          - newPaidCents
          - databaseMoneyToCents(invoice.amount_credited, 'Invoice credited amount')
          - databaseMoneyToCents(invoice.amount_written_off, 'Invoice written-off amount');
        const status = newBalanceCents === 0n ? 'PAID' : newPaidCents > 0n ? 'PARTIALLY_PAID' : 'POSTED';
        await client.query(
          `UPDATE invoices SET paid_amount = $1, balance_due = $2, status = $3
            WHERE organization_id = $4 AND id = $5`,
          [Number(newPaidCents) / 100, Number(newBalanceCents) / 100, status, organizationId, invoice.id]
        );
      }

      const reversalJournalId = await this.reversePostedJournal(
        client, organizationId, payment.journal_entry_id, userId, normalizedReason,
        `payment ${payment.payment_number}`
      );
      await client.query(
        `UPDATE customer_advances
            SET status = 'REVERSED', unapplied_amount = 0
          WHERE organization_id = $1 AND payment_id = $2`,
        [organizationId, paymentId]
      );
      const updated = await client.query(
        `UPDATE payments_received
            SET status = 'REVERSED', unallocated_amount = 0,
                reversal_journal_id = $1, reversed_at = CURRENT_TIMESTAMP,
                reversed_by = $2, reversal_reason = $3
          WHERE organization_id = $4 AND id = $5 AND UPPER(status) <> 'REVERSED'`,
        [reversalJournalId, userId, normalizedReason, organizationId, paymentId]
      );
      if (updated.rowCount !== 1) throw new Error('Payment state changed concurrently');
      await this.audit(client, organizationId, userId, 'PAYMENT_RECEIVED_REVERSED', 'PaymentReceived', paymentId,
        { status: payment.status, amount: payment.amount },
        { status: 'REVERSED', reversalJournalId, reason: normalizedReason });
      return { success: true, paymentId, journalEntryId: reversalJournalId };
    });
  }

  public static async reverseVendorPayment(
    organizationId: string,
    paymentId: string,
    userId: string,
    reason: string
  ): Promise<ReversalResult & { paymentId: string }> {
    const normalizedReason = validReason(reason);
    return db.transaction(async (client) => {
      const result = await client.query(
        `SELECT * FROM payments_made WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, paymentId]
      );
      if (result.rows.length !== 1) throw new Error('Vendor payment was not found in this organization');
      const payment = result.rows[0];
      if (String(payment.status).toUpperCase() === 'REVERSED') throw new Error('Vendor payment is already reversed');
      if (!payment.journal_entry_id) throw new Error('Vendor payment has no certified posting journal to reverse');

      const advances = await client.query(
        `SELECT * FROM vendor_advances
          WHERE organization_id = $1 AND payment_id = $2
          ORDER BY id FOR UPDATE`,
        [organizationId, paymentId]
      );
      for (const advance of advances.rows) {
        if (databaseMoneyToCents(advance.amount, 'Vendor advance amount') !==
            databaseMoneyToCents(advance.unapplied_amount, 'Vendor advance unapplied amount')) {
          throw new Error('VENDOR_PAYMENT_ADVANCE_APPLIED: Reverse all vendor advance applications before reversing this payment');
        }
      }

      const allocations = await client.query(
        `SELECT * FROM payment_made_allocations
          WHERE organization_id = $1 AND payment_id = $2
          ORDER BY bill_id, id FOR UPDATE`,
        [organizationId, paymentId]
      );
      let allocatedCents = 0n;
      for (const allocation of allocations.rows) {
        const billResult = await client.query(
          `SELECT * FROM bills WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [organizationId, allocation.bill_id]
        );
        if (billResult.rows.length !== 1) throw new Error('Allocated bill was not found');
        const bill = billResult.rows[0];
        if (['VOID', 'VOIDED'].includes(String(bill.status).toUpperCase())) {
          throw new Error('Cannot reverse a payment allocated to a voided bill');
        }
        const amountCents = databaseMoneyToCents(allocation.amount, 'Vendor payment allocation');
        const paidCents = databaseMoneyToCents(bill.amount_paid, 'Bill paid amount');
        if (amountCents > paidCents) throw new Error('Vendor payment allocation exceeds the bill paid amount');
        allocatedCents += amountCents;
        const newPaidCents = paidCents - amountCents;
        const newBalanceCents = databaseMoneyToCents(bill.total_amount, 'Bill total')
          - newPaidCents
          - databaseMoneyToCents(bill.amount_debited, 'Bill debited amount')
          - databaseMoneyToCents(bill.amount_written_off, 'Bill written-off amount');
        const status = newBalanceCents === 0n ? 'PAID' : newPaidCents > 0n ? 'PARTIALLY_PAID' : 'POSTED';
        const updatedBill = await client.query(
          `UPDATE bills SET amount_paid = $1, balance_due = $2, status = $3
            WHERE organization_id = $4 AND id = $5 AND amount_paid >= $6`,
          [Number(newPaidCents) / 100, Number(newBalanceCents) / 100, status,
            organizationId, bill.id, Number(amountCents) / 100]
        );
        if (updatedBill.rowCount !== 1) throw new Error('Bill state changed concurrently');
      }

      const reversalJournalId = await this.reversePostedJournal(
        client, organizationId, payment.journal_entry_id, userId, normalizedReason,
        `vendor payment ${payment.payment_number}`
      );
      const unallocatedCents = databaseMoneyToCents(payment.unallocated_amount, 'Vendor payment unallocated amount');
      const vendorUpdate = await client.query(
        `UPDATE vendors
            SET payables_balance = payables_balance + $1,
                advance_balance = advance_balance - $2
          WHERE organization_id = $3 AND id = $4 AND advance_balance >= $2`,
        [Number(allocatedCents) / 100, Number(unallocatedCents) / 100, organizationId, payment.vendor_id]
      );
      if (vendorUpdate.rowCount !== 1) throw new Error('Vendor balances do not reconcile to the payment being reversed');
      await client.query(
        `UPDATE vendor_advances SET status = 'REVERSED', unapplied_amount = 0
          WHERE organization_id = $1 AND payment_id = $2`,
        [organizationId, paymentId]
      );
      const updated = await client.query(
        `UPDATE payments_made
            SET status = 'REVERSED', unallocated_amount = 0,
                reversal_journal_id = $1, reversed_at = CURRENT_TIMESTAMP,
                reversed_by = $2, reversal_reason = $3
          WHERE organization_id = $4 AND id = $5 AND UPPER(status) <> 'REVERSED'`,
        [reversalJournalId, userId, normalizedReason, organizationId, paymentId]
      );
      if (updated.rowCount !== 1) throw new Error('Vendor payment state changed concurrently');
      await this.audit(client, organizationId, userId, 'VENDOR_PAYMENT_REVERSED', 'VendorPayment', paymentId,
        { status: payment.status, amount: payment.amount },
        { status: 'REVERSED', reversalJournalId, reason: normalizedReason });
      return { success: true, paymentId, journalEntryId: reversalJournalId };
    });
  }

  public static async reverseCreditNote(
    organizationId: string,
    creditNoteId: string,
    userId: string,
    reason: string
  ): Promise<ReversalResult & { creditNoteId: string }> {
    const normalizedReason = validReason(reason);
    return db.transaction(async (client) => {
      const result = await client.query(
        `SELECT * FROM credit_notes WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, creditNoteId]
      );
      if (result.rows.length !== 1) throw new Error('Credit note was not found in this organization');
      const note = result.rows[0];
      if (String(note.status).toUpperCase() === 'REVERSED') throw new Error('Credit note is already reversed');
      if (!note.journal_entry_id) throw new Error('Credit note has no certified posting journal to reverse');

      const refunds = await client.query(
        `SELECT COUNT(*) AS count FROM customer_refunds
          WHERE organization_id = $1 AND credit_note_id = $2
            AND UPPER(COALESCE(status, 'POSTED')) <> 'REVERSED'`,
        [organizationId, creditNoteId]
      );
      if (Number(refunds.rows[0]?.count || 0) > 0) {
        throw new Error('CREDIT_NOTE_HAS_REFUNDS: Reverse linked refunds before reversing this credit note');
      }

      const applications = await client.query(
        `SELECT * FROM credit_note_applications
          WHERE organization_id = $1 AND credit_note_id = $2
            AND UPPER(COALESCE(status, 'POSTED')) <> 'REVERSED'
          ORDER BY invoice_id, id FOR UPDATE`,
        [organizationId, creditNoteId]
      );
      for (const application of applications.rows) {
        const invoiceResult = await client.query(
          `SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [organizationId, application.invoice_id]
        );
        if (invoiceResult.rows.length !== 1) throw new Error('Credit-note invoice was not found');
        const invoice = invoiceResult.rows[0];
        const applied = databaseMoneyToCents(application.amount_applied, 'Credit note application');
        const credited = databaseMoneyToCents(invoice.amount_credited, 'Invoice credited amount');
        if (applied > credited) throw new Error('Credit-note application exceeds invoice credited amount');
        const newCredited = credited - applied;
        const newBalance = databaseMoneyToCents(invoice.total_amount, 'Invoice total')
          - databaseMoneyToCents(invoice.paid_amount, 'Invoice paid amount')
          - newCredited
          - databaseMoneyToCents(invoice.amount_written_off, 'Invoice written-off amount');
        const status = newBalance === 0n ? 'PAID' : databaseMoneyToCents(invoice.paid_amount, 'Invoice paid amount') > 0n ? 'PARTIALLY_PAID' : 'POSTED';
        await client.query(
          `UPDATE invoices SET amount_credited = $1, balance_due = $2, status = $3
            WHERE organization_id = $4 AND id = $5`,
          [Number(newCredited) / 100, Number(newBalance) / 100, status, organizationId, invoice.id]
        );
      }

      const reversalJournalId = await this.reversePostedJournal(
        client, organizationId, note.journal_entry_id, userId, normalizedReason,
        `credit note ${note.credit_note_number}`
      );
      await client.query(
        `UPDATE credit_note_applications SET status = 'REVERSED', reversed_at = CURRENT_TIMESTAMP, reversed_by = $1
          WHERE organization_id = $2 AND credit_note_id = $3 AND UPPER(COALESCE(status, 'POSTED')) <> 'REVERSED'`,
        [userId, organizationId, creditNoteId]
      );
      const updated = await client.query(
        `UPDATE credit_notes SET status = 'REVERSED', remaining_credit = 0,
            reversal_journal_id = $1, reversed_at = CURRENT_TIMESTAMP, reversal_reason = $2
          WHERE organization_id = $3 AND id = $4 AND UPPER(status) <> 'REVERSED'`,
        [reversalJournalId, normalizedReason, organizationId, creditNoteId]
      );
      if (updated.rowCount !== 1) throw new Error('Credit note state changed concurrently');
      await this.audit(client, organizationId, userId, 'CREDIT_NOTE_REVERSED', 'CreditNote', creditNoteId,
        { status: note.status, remainingCredit: note.remaining_credit },
        { status: 'REVERSED', reversalJournalId, reason: normalizedReason });
      return { success: true, creditNoteId, journalEntryId: reversalJournalId };
    });
  }

  public static async reverseCustomerRefund(
    organizationId: string,
    refundId: string,
    userId: string,
    reason: string
  ): Promise<ReversalResult & { refundId: string }> {
    const normalizedReason = validReason(reason);
    return db.transaction(async (client) => {
      const result = await client.query(
        `SELECT * FROM customer_refunds WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, refundId]
      );
      if (result.rows.length !== 1) throw new Error('Customer refund was not found in this organization');
      const refund = result.rows[0];
      if (String(refund.status).toUpperCase() === 'REVERSED') throw new Error('Customer refund is already reversed');
      if (!refund.journal_entry_id) throw new Error('Customer refund has no certified posting journal to reverse');
      if (refund.credit_note_id) {
        const note = await client.query(
          `SELECT * FROM credit_notes WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [organizationId, refund.credit_note_id]
        );
        if (note.rows.length !== 1 || String(note.rows[0].status).toUpperCase() === 'REVERSED') {
          throw new Error('Linked credit note is unavailable for refund reversal');
        }
        const restored = databaseMoneyToCents(note.rows[0].remaining_credit, 'Remaining credit')
          + databaseMoneyToCents(refund.amount, 'Refund amount');
        const total = databaseMoneyToCents(note.rows[0].total_amount, 'Credit note total');
        if (restored > total) throw new Error('Refund reversal would overstate the credit note balance');
        await client.query(
          `UPDATE credit_notes SET remaining_credit = $1, status = $2 WHERE organization_id = $3 AND id = $4`,
          [Number(restored) / 100, restored === total ? 'Open' : 'Partially Applied', organizationId, refund.credit_note_id]
        );
      }
      const reversalJournalId = await this.reversePostedJournal(
        client, organizationId, refund.journal_entry_id, userId, normalizedReason,
        `customer refund ${refund.refund_number}`
      );
      const updated = await client.query(
        `UPDATE customer_refunds SET status = 'REVERSED', reversal_journal_id = $1,
            reversed_at = CURRENT_TIMESTAMP, reversed_by = $2, reversal_reason = $3
          WHERE organization_id = $4 AND id = $5 AND UPPER(COALESCE(status, 'POSTED')) <> 'REVERSED'`,
        [reversalJournalId, userId, normalizedReason, organizationId, refundId]
      );
      if (updated.rowCount !== 1) throw new Error('Customer refund state changed concurrently');
      await this.audit(client, organizationId, userId, 'CUSTOMER_REFUND_REVERSED', 'CustomerRefund', refundId,
        { status: refund.status || 'POSTED', amount: refund.amount },
        { status: 'REVERSED', reversalJournalId, reason: normalizedReason });
      return { success: true, refundId, journalEntryId: reversalJournalId };
    });
  }

  public static async reverseReceivableWriteOff(
    organizationId: string,
    writeOffId: string,
    userId: string,
    reason: string
  ): Promise<ReversalResult & { writeOffId: string }> {
    return this.reverseWriteOff('ar_write_offs', 'invoices', 'invoice_id', 'amount_written_off',
      organizationId, writeOffId, userId, reason, 'AR_WRITE_OFF_REVERSED');
  }

  public static async reversePayableWriteOff(
    organizationId: string,
    writeOffId: string,
    userId: string,
    reason: string
  ): Promise<ReversalResult & { writeOffId: string }> {
    return this.reverseWriteOff('ap_write_offs', 'bills', 'bill_id', 'amount_written_off',
      organizationId, writeOffId, userId, reason, 'AP_WRITE_OFF_REVERSED');
  }

  private static async reverseWriteOff(
    sourceTable: 'ar_write_offs' | 'ap_write_offs',
    documentTable: 'invoices' | 'bills',
    documentIdColumn: 'invoice_id' | 'bill_id',
    amountColumn: 'amount_written_off',
    organizationId: string,
    writeOffId: string,
    userId: string,
    reason: string,
    auditAction: string
  ): Promise<ReversalResult & { writeOffId: string }> {
    const normalizedReason = validReason(reason);
    return db.transaction(async (client) => {
      const result = await client.query(
        `SELECT * FROM ${sourceTable} WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, writeOffId]
      );
      if (result.rows.length !== 1) throw new Error('Write-off was not found in this organization');
      const writeOff = result.rows[0];
      if (String(writeOff.status).toUpperCase() === 'REVERSED') throw new Error('Write-off is already reversed');
      if (!writeOff.journal_entry_id) throw new Error('Write-off has no certified posting journal to reverse');
      const documentId = writeOff[documentIdColumn];
      const documentResult = await client.query(
        `SELECT * FROM ${documentTable} WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, documentId]
      );
      if (documentResult.rows.length !== 1) throw new Error('Write-off source document was not found');
      const document = documentResult.rows[0];
      const current = databaseMoneyToCents(document[amountColumn], 'Document written-off amount');
      const amount = databaseMoneyToCents(writeOff.amount, 'Write-off amount');
      if (amount > current) throw new Error('Write-off amount exceeds the document written-off amount');
      const restoredWrittenOff = current - amount;
      const paidColumn = documentTable === 'invoices' ? 'paid_amount' : 'amount_paid';
      const creditColumn = documentTable === 'invoices' ? 'amount_credited' : 'amount_debited';
      const restoredBalance = databaseMoneyToCents(document.total_amount, 'Document total')
        - databaseMoneyToCents(document[paidColumn], 'Document paid amount')
        - databaseMoneyToCents(document[creditColumn], 'Document credited amount')
        - restoredWrittenOff;
      const status = restoredBalance === 0n ? 'PAID' : databaseMoneyToCents(document[paidColumn], 'Document paid amount') > 0n ? 'PARTIALLY_PAID' : 'POSTED';
      await client.query(
        `UPDATE ${documentTable} SET ${amountColumn} = $1, balance_due = $2, status = $3
          WHERE organization_id = $4 AND id = $5`,
        [Number(restoredWrittenOff) / 100, Number(restoredBalance) / 100, status, organizationId, documentId]
      );
      const reversalJournalId = await this.reversePostedJournal(
        client, organizationId, writeOff.journal_entry_id, userId, normalizedReason,
        `${sourceTable === 'ar_write_offs' ? 'receivable' : 'payable'} write-off ${writeOffId}`
      );
      const updated = await client.query(
        `UPDATE ${sourceTable} SET status = 'REVERSED', reversal_journal_id = $1,
            reversed_at = CURRENT_TIMESTAMP, reversed_by = $2, reversal_reason = $3
          WHERE organization_id = $4 AND id = $5 AND UPPER(COALESCE(status, 'POSTED')) <> 'REVERSED'`,
        [reversalJournalId, userId, normalizedReason, organizationId, writeOffId]
      );
      if (updated.rowCount !== 1) throw new Error('Write-off state changed concurrently');
      await this.audit(client, organizationId, userId, auditAction, 'WriteOff', writeOffId,
        { status: writeOff.status || 'POSTED', amount: writeOff.amount },
        { status: 'REVERSED', reversalJournalId, reason: normalizedReason });
      return { success: true, writeOffId, journalEntryId: reversalJournalId };
    });
  }

  public static async reverseVendorCredit(
    organizationId: string,
    vendorCreditId: string,
    userId: string,
    reason: string
  ): Promise<ReversalResult & { vendorCreditId: string }> {
    const normalizedReason = validReason(reason);
    return db.transaction(async (client) => {
      const result = await client.query(
        `SELECT * FROM vendor_credits WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, vendorCreditId]
      );
      if (result.rows.length !== 1) throw new Error('Vendor credit was not found in this organization');
      const credit = result.rows[0];
      if (String(credit.status).toUpperCase() === 'REVERSED') throw new Error('Vendor credit is already reversed');
      if (!credit.journal_entry_id) throw new Error('Vendor credit has no certified posting journal to reverse');
      const applications = await client.query(
        `SELECT * FROM debit_note_applications
          WHERE organization_id = $1 AND debit_note_id = $2
            AND UPPER(COALESCE(status, 'POSTED')) <> 'REVERSED'
          ORDER BY bill_id, id FOR UPDATE`,
        [organizationId, vendorCreditId]
      );
      for (const application of applications.rows) {
        const billResult = await client.query(
          `SELECT * FROM bills WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [organizationId, application.bill_id]
        );
        if (billResult.rows.length !== 1) throw new Error('Vendor-credit bill was not found');
        const bill = billResult.rows[0];
        const applied = databaseMoneyToCents(application.amount_applied, 'Vendor credit application');
        const debited = databaseMoneyToCents(bill.amount_debited, 'Bill debited amount');
        if (applied > debited) throw new Error('Vendor-credit application exceeds bill debited amount');
        const newDebited = debited - applied;
        const newBalance = databaseMoneyToCents(bill.total_amount, 'Bill total')
          - databaseMoneyToCents(bill.amount_paid, 'Bill paid amount')
          - newDebited
          - databaseMoneyToCents(bill.amount_written_off, 'Bill written-off amount');
        const paid = databaseMoneyToCents(bill.amount_paid, 'Bill paid amount');
        const status = newBalance === 0n ? 'PAID' : paid > 0n ? 'PARTIALLY_PAID' : 'POSTED';
        await client.query(
          `UPDATE bills SET amount_debited = $1, balance_due = $2, status = $3
            WHERE organization_id = $4 AND id = $5`,
          [Number(newDebited) / 100, Number(newBalance) / 100, status, organizationId, bill.id]
        );
      }
      const remaining = databaseMoneyToCents(credit.remaining_credit, 'Vendor credit remaining amount');
      if (credit.vendor_id && remaining > 0n) {
        const vendor = await client.query(
          `UPDATE vendors SET unused_credits = unused_credits - $1
            WHERE organization_id = $2 AND id = $3 AND unused_credits >= $1`,
          [Number(remaining) / 100, organizationId, credit.vendor_id]
        );
        if (vendor.rowCount !== 1) throw new Error('Vendor unused-credit balance does not reconcile');
      }
      if (credit.vendor_id && applications.rows.length > 0) {
        const appliedTotal = applications.rows.reduce(
          (sum, application) => sum + databaseMoneyToCents(application.amount_applied, 'Vendor credit application'),
          0n
        );
        await client.query(
          `UPDATE vendors SET payables_balance = payables_balance + $1
            WHERE organization_id = $2 AND id = $3`,
          [Number(appliedTotal) / 100, organizationId, credit.vendor_id]
        );
      }
      const reversalJournalId = await this.reversePostedJournal(
        client, organizationId, credit.journal_entry_id, userId, normalizedReason,
        `vendor credit ${credit.credit_number || credit.debit_note_number}`
      );
      await client.query(
        `UPDATE debit_note_applications SET status = 'REVERSED', reversed_at = CURRENT_TIMESTAMP, reversed_by = $1
          WHERE organization_id = $2 AND debit_note_id = $3 AND UPPER(COALESCE(status, 'POSTED')) <> 'REVERSED'`,
        [userId, organizationId, vendorCreditId]
      );
      const updated = await client.query(
        `UPDATE vendor_credits SET status = 'REVERSED', remaining_credit = 0,
            reversal_journal_id = $1, reversed_at = CURRENT_TIMESTAMP, reversal_reason = $2
          WHERE organization_id = $3 AND id = $4 AND UPPER(status) <> 'REVERSED'`,
        [reversalJournalId, normalizedReason, organizationId, vendorCreditId]
      );
      if (updated.rowCount !== 1) throw new Error('Vendor credit state changed concurrently');
      await this.audit(client, organizationId, userId, 'VENDOR_CREDIT_REVERSED', 'VendorCredit', vendorCreditId,
        { status: credit.status, remainingCredit: credit.remaining_credit },
        { status: 'REVERSED', reversalJournalId, reason: normalizedReason });
      return { success: true, vendorCreditId, journalEntryId: reversalJournalId };
    });
  }

  public static async reverseVendorAdvance(
    organizationId: string,
    advanceId: string,
    userId: string,
    reason: string
  ): Promise<ReversalResult & { advanceId: string }> {
    const normalizedReason = validReason(reason);
    return db.transaction(async (client) => {
      const result = await client.query(
        `SELECT * FROM vendor_advances WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, advanceId]
      );
      if (result.rows.length !== 1) throw new Error('Vendor advance was not found in this organization');
      const advance = result.rows[0];
      if (String(advance.status).toUpperCase() === 'REVERSED') throw new Error('Vendor advance is already reversed');
      if (advance.payment_id) throw new Error('Reverse the source vendor payment to reverse this linked advance');
      if (!advance.journal_entry_id) throw new Error('Vendor advance has no certified posting journal to reverse');
      if (databaseMoneyToCents(advance.amount, 'Vendor advance amount') !== databaseMoneyToCents(advance.unapplied_amount, 'Vendor advance unapplied amount')) {
        throw new Error('VENDOR_ADVANCE_APPLIED: Reverse every application before reversing this advance');
      }
      const reversalJournalId = await this.reversePostedJournal(
        client, organizationId, advance.journal_entry_id, userId, normalizedReason,
        `vendor advance ${advanceId}`
      );
      const vendor = await client.query(
        `UPDATE vendors SET advance_balance = advance_balance - $1
          WHERE organization_id = $2 AND id = $3 AND advance_balance >= $1`,
        [advance.amount, organizationId, advance.vendor_id]
      );
      if (vendor.rowCount !== 1) throw new Error('Vendor advance balance does not reconcile');
      const updated = await client.query(
        `UPDATE vendor_advances SET status = 'REVERSED', unapplied_amount = 0,
            reversal_journal_id = $1, reversed_at = CURRENT_TIMESTAMP, reversed_by = $2, reversal_reason = $3
          WHERE organization_id = $4 AND id = $5 AND UPPER(status) <> 'REVERSED'`,
        [reversalJournalId, userId, normalizedReason, organizationId, advanceId]
      );
      if (updated.rowCount !== 1) throw new Error('Vendor advance state changed concurrently');
      await this.audit(client, organizationId, userId, 'VENDOR_ADVANCE_REVERSED', 'VendorAdvance', advanceId,
        { status: advance.status, amount: advance.amount },
        { status: 'REVERSED', reversalJournalId, reason: normalizedReason });
      return { success: true, advanceId, journalEntryId: reversalJournalId };
    });
  }

  public static async reverseAdvanceApplication(
    kind: 'customer' | 'vendor',
    organizationId: string,
    applicationId: string,
    userId: string,
    reason: string
  ): Promise<ReversalResult & { applicationId: string }> {
    const normalizedReason = validReason(reason);
    return db.transaction(async (client) => {
      const customer = kind === 'customer';
      const table = customer ? 'customer_advance_applications' : 'vendor_advance_applications';
      const documentTable = customer ? 'invoices' : 'bills';
      const documentColumn = customer ? 'invoice_id' : 'bill_id';
      const result = await client.query(
        `SELECT * FROM ${table} WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, applicationId]
      );
      if (result.rows.length !== 1) throw new Error('Advance application was not found in this organization');
      const application = result.rows[0];
      if (String(application.status).toUpperCase() === 'REVERSED') throw new Error('Advance application is already reversed');
      const advanceTable = customer ? 'customer_advances' : 'vendor_advances';
      const advance = await client.query(
        `SELECT * FROM ${advanceTable} WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, application.advance_id]
      );
      const document = await client.query(
        `SELECT * FROM ${documentTable} WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, application[documentColumn]]
      );
      if (advance.rows.length !== 1 || document.rows.length !== 1) throw new Error('Advance application source records were not found');
      const amount = databaseMoneyToCents(application.amount_applied, 'Advance application amount');
      const paidColumn = customer ? 'paid_amount' : 'amount_paid';
      const paid = databaseMoneyToCents(document.rows[0][paidColumn], 'Document paid amount');
      if (amount > paid) throw new Error('Advance application exceeds the document paid amount');
      const restoredPaid = paid - amount;
      const creditColumn = customer ? 'amount_credited' : 'amount_debited';
      const restoredBalance = databaseMoneyToCents(document.rows[0].total_amount, 'Document total')
        - restoredPaid
        - databaseMoneyToCents(document.rows[0][creditColumn], 'Document credited amount')
        - databaseMoneyToCents(document.rows[0].amount_written_off, 'Document written-off amount');
      const status = restoredBalance === 0n ? 'PAID' : restoredPaid > 0n ? 'PARTIALLY_PAID' : 'POSTED';
      await client.query(
        `UPDATE ${documentTable} SET ${paidColumn} = $1, balance_due = $2, status = $3
          WHERE organization_id = $4 AND id = $5`,
        [Number(restoredPaid) / 100, Number(restoredBalance) / 100, status, organizationId, application[documentColumn]]
      );
      const restoredAdvance = databaseMoneyToCents(advance.rows[0].unapplied_amount, 'Advance unapplied amount') + amount;
      await client.query(
        `UPDATE ${advanceTable} SET unapplied_amount = $1, status = $2 WHERE organization_id = $3 AND id = $4`,
        [Number(restoredAdvance) / 100, restoredAdvance === databaseMoneyToCents(advance.rows[0].amount, 'Advance total') ? 'UNAPPLIED' : 'PARTIALLY_APPLIED', organizationId, application.advance_id]
      );
      if (!customer) {
        await client.query(
          `UPDATE vendors SET advance_balance = advance_balance + $1, payables_balance = payables_balance + $1
            WHERE organization_id = $2 AND id = $3`,
          [Number(amount) / 100, organizationId, advance.rows[0].vendor_id]
        );
      }
      const reversalJournalId = await this.reversePostedJournal(
        client, organizationId, application.journal_entry_id, userId, normalizedReason,
        `${kind} advance application ${applicationId}`
      );
      const updated = await client.query(
        `UPDATE ${table} SET status = 'REVERSED', reversal_journal_id = $1,
            reversed_at = CURRENT_TIMESTAMP, reversed_by = $2, reversal_reason = $3
          WHERE organization_id = $4 AND id = $5 AND UPPER(status) <> 'REVERSED'`,
        [reversalJournalId, userId, normalizedReason, organizationId, applicationId]
      );
      if (updated.rowCount !== 1) throw new Error('Advance application state changed concurrently');
      await this.audit(client, organizationId, userId, `${kind.toUpperCase()}_ADVANCE_APPLICATION_REVERSED`, 'AdvanceApplication', applicationId,
        { status: application.status, amount: application.amount_applied },
        { status: 'REVERSED', reversalJournalId, reason: normalizedReason });
      return { success: true, applicationId, journalEntryId: reversalJournalId };
    });
  }

  public static async voidExpense(
    organizationId: string,
    expenseId: string,
    userId: string,
    reason: string
  ): Promise<ReversalResult & { expenseId: string }> {
    const normalizedReason = validReason(reason);
    return db.transaction(async (client) => {
      const result = await client.query(
        `SELECT * FROM expenses WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, expenseId]
      );
      if (result.rows.length !== 1) throw new Error('Expense was not found in this organization');
      const expense = result.rows[0];
      if (String(expense.status).toUpperCase() === 'VOIDED') throw new Error('Expense is already voided');
      if (!expense.journal_entry_id) throw new Error('Expense has no certified posting journal to reverse');
      const reversalJournalId = await this.reversePostedJournal(
        client, organizationId, expense.journal_entry_id, userId, normalizedReason,
        `expense ${expense.expense_number}`
      );
      await client.query(
        `UPDATE expenses SET status = 'VOIDED', reversal_journal_id = $1,
            reversed_at = CURRENT_TIMESTAMP, reversed_by = $2, reversal_reason = $3
          WHERE organization_id = $4 AND id = $5`,
        [reversalJournalId, userId, normalizedReason, organizationId, expenseId]
      );
      await this.audit(client, organizationId, userId, 'EXPENSE_VOIDED', 'Expense', expenseId,
        { status: expense.status, amount: expense.amount },
        { status: 'VOIDED', reversalJournalId, reason: normalizedReason });
      return { success: true, expenseId, journalEntryId: reversalJournalId };
    });
  }

  public static async voidBill(
    organizationId: string,
    billId: string,
    userId: string,
    reason: string
  ): Promise<ReversalResult & { billId: string }> {
    const normalizedReason = validReason(reason);
    return db.transaction(async (client) => {
      const result = await client.query(
        `SELECT * FROM bills WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [organizationId, billId]
      );
      if (result.rows.length !== 1) throw new Error('Bill was not found in this organization');
      const bill = result.rows[0];
      if (['VOID', 'VOIDED'].includes(String(bill.status).toUpperCase())) throw new Error('Bill is already voided');
      if (
        databaseMoneyToCents(bill.amount_paid, 'Bill paid amount') !== 0n ||
        databaseMoneyToCents(bill.amount_debited, 'Bill debited amount') !== 0n ||
        databaseMoneyToCents(bill.amount_written_off, 'Bill written-off amount') !== 0n
      ) {
        throw new Error('BILL_HAS_SETTLEMENTS: Reverse all payments, vendor credits, and write-offs before voiding this bill');
      }
      if (!bill.journal_entry_id) throw new Error('Bill has no certified posting journal to reverse');
      const reversalJournalId = await this.reversePostedJournal(
        client, organizationId, bill.journal_entry_id, userId, normalizedReason,
        `bill ${bill.bill_number}`
      );
      await client.query(
        `UPDATE bills SET status = 'VOIDED', balance_due = 0,
            reversal_journal_id = $1, reversed_at = CURRENT_TIMESTAMP,
            reversed_by = $2, reversal_reason = $3
          WHERE organization_id = $4 AND id = $5`,
        [reversalJournalId, userId, normalizedReason, organizationId, billId]
      );
      const vendorBalance = await client.query(
        `UPDATE vendors SET payables_balance = payables_balance - $1
          WHERE organization_id = $2 AND id = $3`,
        [Number(databaseMoneyToCents(bill.total_amount, 'Voided bill total')) / 100, organizationId, bill.vendor_id]
      );
      if (vendorBalance.rowCount !== 1) throw new Error('Bill vendor balance does not reconcile to the document being voided');
      if (bill.purchase_order_id) {
        const purchaseOrder = await client.query(
          `SELECT total_amount, billed_amount FROM purchase_orders
            WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [organizationId, bill.purchase_order_id]
        );
        if (purchaseOrder.rows.length !== 1) throw new Error('Bill source purchase order was not found');
        const newBilledCents = databaseMoneyToCents(purchaseOrder.rows[0].billed_amount, 'Purchase order billed amount')
          - databaseMoneyToCents(bill.total_amount, 'Voided bill total');
        if (newBilledCents < 0n) throw new Error('Bill total exceeds the purchase order billed amount');
        const orderTotalCents = databaseMoneyToCents(purchaseOrder.rows[0].total_amount, 'Purchase order total');
        const orderStatus = newBilledCents === 0n
          ? 'APPROVED'
          : newBilledCents >= orderTotalCents ? 'BILLED' : 'PARTIALLY_BILLED';
        await client.query(
          `UPDATE purchase_orders SET billed_amount = $1, status = $2
            WHERE organization_id = $3 AND id = $4`,
          [Number(newBilledCents) / 100, orderStatus, organizationId, bill.purchase_order_id]
        );
      }
      await this.audit(client, organizationId, userId, 'BILL_VOIDED', 'Bill', billId,
        { status: bill.status, balanceDue: bill.balance_due },
        { status: 'VOIDED', balanceDue: 0, reversalJournalId, reason: normalizedReason });
      return { success: true, billId, journalEntryId: reversalJournalId };
    });
  }

  public static async reverseJournalEntry(
    _organizationId: string,
    _journalEntryId: string,
    _userId: string,
    _reason: string
  ): Promise<never> {
    throw new Error('Legacy journal reversal is disabled. Use the certified manual-journal reversal endpoint.');
  }
}
