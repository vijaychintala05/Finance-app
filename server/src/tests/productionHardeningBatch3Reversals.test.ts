import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { newId } from '../utils/ids';

describe('Production Hardening: Batch 3 - Reversal Reconciled Protection & Document Validation', () => {
  const ORG_ID = 'org-hardening-batch3';
  const USER_ID = 'usr-hardening-batch3';

  let bankAccId: string;
  let ledgerBankId: string;
  let customerId: string;
  let vendorId: string;
  let arAccId: string;
  let apAccId: string;

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // 1. Seed user and organization
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'batch3_tester@firmbooks.io', 'hashed_pass', 'Batch 3 Tester', 'Active')
       ON CONFLICT DO NOTHING`,
      [USER_ID]
    );

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-batch3', 'pub-b3', 'B3ORG', 'Batch 3 Org', 'IN', 'INR', '₹', $2)
       ON CONFLICT DO NOTHING`,
      [ORG_ID, USER_ID]
    );

    // 2. Seed accounts
    ledgerBankId = newId('acc');
    arAccId = newId('acc');
    apAccId = newId('acc');

    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES 
         ($1, $4, '1010', 'Bank Account', 'Asset', 'Bank', 500000.00, 'Active'),
         ($2, $4, '1200', 'Accounts Receivable', 'Asset', 'Accounts Receivable', 100000.00, 'Active'),
         ($3, $4, '2100', 'Accounts Payable', 'Liability', 'Accounts Payable', 100000.00, 'Active')`,
      [ledgerBankId, arAccId, apAccId, ORG_ID]
    );

    // 3. Seed bank account
    bankAccId = newId('bnk');
    await db.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, bank_name, current_balance, status, is_active, currency)
       VALUES ($1, $2, $3, 'HDFC Main', '1234567890', 'HDFC Bank', 500000.00, 'Active', true, 'INR')`,
      [bankAccId, ORG_ID, ledgerBankId]
    );

    // 4. Seed customer & vendor
    customerId = newId('cust');
    vendorId = newId('vend');
    await db.query(
      `INSERT INTO customers (id, organization_id, customer_id, display_name, legal_name, currency, active)
       VALUES ($1, $2, 'CUST-001', 'Test Customer', 'Test Customer Ltd', 'INR', true)`,
      [customerId, ORG_ID]
    );
    await db.query(
      `INSERT INTO vendors (id, organization_id, name, company_name, currency)
       VALUES ($1, $2, 'Test Vendor', 'Test Vendor Ltd', 'INR')`,
      [vendorId, ORG_ID]
    );
  });

  it('1. Reversing a payment matched in bank reconciliation is blocked with PAYMENT_RECONCILED', async () => {
    const paymentId = newId('pay');
    const jeId = newId('je');

    // Create posted journal entry and balanced lines
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status)
       VALUES ($1, $2, 'JE-PMT-01', '2026-09-01', 'Posted')`,
      [jeId, ORG_ID]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit)
       VALUES 
         ($1, $2, $3, $4, 10000, 0),
         ($5, $2, $3, $6, 0, 10000)`,
      [newId('jl'), jeId, ORG_ID, ledgerBankId, newId('jl'), arAccId]
    );

    // Create payment received
    await db.query(
      `INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, status, journal_entry_id)
       VALUES ($1, $2, 'PMT-001', $3, 'Test Customer', '2026-09-01', 10000, 'Bank Transfer', $4, 'ALLOCATED', $5)`,
      [paymentId, ORG_ID, customerId, ledgerBankId, jeId]
    );

    // Create a bank statement transaction
    const stmtTxId = newId('stmt-tx');
    await db.query(
      `INSERT INTO bank_statement_transactions (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint)
       VALUES ($1, $2, $3, 'imp-01', '2026-09-01', 10000, 'CREDIT', 'Customer Wire', 'INR', 'fp-01')`,
      [stmtTxId, ORG_ID, bankAccId]
    );

    // Match the statement transaction to this payment
    const matchId = newId('match');
    await db.query(
      `INSERT INTO bank_reconciliation_matches (id, organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id, matched_amount, status)
       VALUES ($1, $2, $3, 'payment_received', $4, 10000, 'MATCHED')`,
      [matchId, ORG_ID, stmtTxId, paymentId]
    );

    // Attempt reversal while matched - MUST be rejected
    await expect(
      FinancialDestructiveActionsService.reversePaymentReceived(
        ORG_ID,
        paymentId,
        USER_ID,
        'Attempt reverse of reconciled payment'
      )
    ).rejects.toThrow('PAYMENT_RECONCILED');

    // Unmatch the bank reconciliation
    await BankReconciliationService.unmatchTransaction(ORG_ID, matchId, USER_ID);

    // Reversal should now succeed cleanly
    const revResult = await FinancialDestructiveActionsService.reversePaymentReceived(
      ORG_ID,
      paymentId,
      USER_ID,
      'Valid reversal after unmatching'
    );
    expect(revResult.success).toBe(true);
    expect(revResult.journalEntryId).toBeDefined();
  });

  it('2. Reversing a vendor payment matched in bank reconciliation is blocked with PAYMENT_RECONCILED', async () => {
    const pmtMadeId = newId('pmt-made');
    const jeId = newId('je');

    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status)
       VALUES ($1, $2, 'JE-VPMT-01', '2026-09-01', 'Posted')`,
      [jeId, ORG_ID]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit)
       VALUES 
         ($1, $2, $3, $4, 15000, 0),
         ($5, $2, $3, $6, 0, 15000)`,
      [newId('jl'), jeId, ORG_ID, apAccId, newId('jl'), ledgerBankId]
    );

    await db.query(
      `INSERT INTO payments_made (id, organization_id, payment_number, vendor_id, vendor_name, payment_date, amount, payment_mode, paid_from_account_id, status, journal_entry_id)
       VALUES ($1, $2, 'VPMT-001', $3, 'Test Vendor', '2026-09-01', 15000, 'Bank Transfer', $4, 'ALLOCATED', $5)`,
      [pmtMadeId, ORG_ID, vendorId, ledgerBankId, jeId]
    );

    const stmtTxId = newId('stmt-tx');
    await db.query(
      `INSERT INTO bank_statement_transactions (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint)
       VALUES ($1, $2, $3, 'imp-02', '2026-09-01', 15000, 'DEBIT', 'Vendor Payment Wire', 'INR', 'fp-02')`,
      [stmtTxId, ORG_ID, bankAccId]
    );

    const matchId = newId('match');
    await db.query(
      `INSERT INTO bank_reconciliation_matches (id, organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id, matched_amount, status)
       VALUES ($1, $2, $3, 'payment_made', $4, 15000, 'MATCHED')`,
      [matchId, ORG_ID, stmtTxId, pmtMadeId]
    );

    await expect(
      FinancialDestructiveActionsService.reverseVendorPayment(
        ORG_ID,
        pmtMadeId,
        USER_ID,
        'Attempt reverse of reconciled vendor payment'
      )
    ).rejects.toThrow('PAYMENT_RECONCILED');

    // Unmatch
    await BankReconciliationService.unmatchTransaction(ORG_ID, matchId, USER_ID);

    // Reversal should now succeed
    const revResult = await FinancialDestructiveActionsService.reverseVendorPayment(
      ORG_ID,
      pmtMadeId,
      USER_ID,
      'Valid vendor payment reversal after unmatching'
    );
    expect(revResult.success).toBe(true);
  });

  it('3. Bank matching rejects non-existent or cross-tenant accounting document by default', async () => {
    const stmtTxId = newId('stmt-tx');
    await db.query(
      `INSERT INTO bank_statement_transactions (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint)
       VALUES ($1, $2, $3, 'imp-03', '2026-09-01', 5000, 'CREDIT', 'Unknown Receipt', 'INR', 'fp-03')`,
      [stmtTxId, ORG_ID, bankAccId]
    );

    // Attempt match against non-existent payment ID with document validation enabled
    await expect(
      BankReconciliationService.matchTransaction(
        ORG_ID,
        stmtTxId,
        'payment_received',
        'non-existent-payment-id',
        5000,
        100,
        [],
        'System',
        true
      )
    ).rejects.toThrow('Accounting document was not found in this organization');
  });
});
