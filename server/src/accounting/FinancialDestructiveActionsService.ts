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
  private static async reversePostedJournal(
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
          WHERE organization_id = $2 AND id = $3 AND payables_balance >= $1`,
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
