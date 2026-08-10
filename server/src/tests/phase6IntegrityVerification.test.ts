import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { AccountingIntegrityService } from '../services/AccountingIntegrityService';
import { AccountingPeriods } from '../utils/accountingPeriods';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { SalesEngine } from '../sales/SalesEngine';

describe('Phase 6: General Ledger Integrity & Hardened Verification Test Suite', () => {
  const ORG_ID = 'org-integrity-test-123';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // Seed GL accounts
    await db.query(`
      INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance)
      VALUES 
        ('acc-1100', '${ORG_ID}', '1100', 'Accounts Receivable', 'Asset', 'Accounts Receivable', 0.00),
        ('acc-2000', '${ORG_ID}', '2000', 'Accounts Payable', 'Asset', 'Accounts Payable', 0.00),
        ('acc-4000', '${ORG_ID}', '4000', 'Sales Revenue', 'Revenue', 'Sales Revenue', 0.00),
        ('acc-2100', '${ORG_ID}', '2100', 'GST Output Liability', 'Liability', 'GST Output Liability', 0.00)
      ON CONFLICT DO NOTHING;
    `);
  });

  it('1. Date utilities in AccountingPeriods compute accurate half-open date ranges', () => {
    const monthRange = AccountingPeriods.getMonthRange(2025, 4);
    expect(monthRange.startInclusive).toBe('2025-04-01');
    expect(monthRange.endExclusive).toBe('2025-05-01');

    const qRange = AccountingPeriods.getQuarterRange(2025, 1);
    expect(qRange.startInclusive).toBe('2025-01-01');
    expect(qRange.endExclusive).toBe('2025-04-01');

    const fyRange = AccountingPeriods.getFinancialYearRange(2025);
    expect(fyRange.startInclusive).toBe('2025-04-01');
    expect(fyRange.endExclusive).toBe('2026-04-01');
  });

  it('2. Journal & Trial Balance Integrity passes on balanced double-entry entries', async () => {
    const jeId = `je-${Date.now()}`;
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [jeId, ORG_ID, 'JE-101', '2025-04-10', 'INV-101', 'Test Entry', 'POSTED']
    );

    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit)
       VALUES 
       ('jl-1', $1, 'acc-1100', '1100', 'Accounts Receivable', 1000.00, 0.00),
       ('jl-2', $1, 'acc-4000', '4000', 'Sales Revenue', 0.00, 1000.00)`,
      [jeId]
    );

    const journalIntegrity = await AccountingIntegrityService.verifyJournalIntegrity(ORG_ID);
    expect(journalIntegrity.isBalanced).toBe(true);
    expect(journalIntegrity.difference).toBe('0.00');

    const tbIntegrity = await AccountingIntegrityService.verifyTrialBalanceIntegrity(ORG_ID);
    expect(tbIntegrity.isBalanced).toBe(true);
    expect(tbIntegrity.difference).toBe('0.00');
  });

  it('3. Journal Integrity detects unbalanced posted journal entries', async () => {
    const jeId = `je-unbal-${Date.now()}`;
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [jeId, ORG_ID, 'JE-ERR', '2025-04-10', 'REF-ERR', 'Unbalanced Entry', 'POSTED']
    );

    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit)
       VALUES 
       ('jl-1', $1, 'acc-1100', '1100', 'Accounts Receivable', 1000.00, 0.00),
       ('jl-2', $1, 'acc-4000', '4000', 'Sales Revenue', 0.00, 800.00)`,
      [jeId]
    );

    const journalIntegrity = await AccountingIntegrityService.verifyJournalIntegrity(ORG_ID);
    expect(journalIntegrity.isBalanced).toBe(false);
    expect(journalIntegrity.difference).toBe('200.00');
  });

  it('4. Void Invoice blocks direct void when active allocations exist (Rule #17)', async () => {
    const invId = `inv-void-test-${Date.now()}`;
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_name, issue_date, due_date, total_amount, paid_amount, balance_due, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [invId, ORG_ID, 'INV-VOID-1', 'cust-1', 'Customer One', '2025-04-01', '2025-04-30', 5000.00, 2000.00, 3000.00, 'Partially Paid']
    );

    await expect(
      FinancialDestructiveActionsService.voidInvoice(ORG_ID, invId, 'user-1', 'Attempt void on paid invoice')
    ).rejects.toThrow('INVOICE_HAS_ALLOCATED_PAYMENTS');
  });

  it('5. Cross-customer payment/advance application is strictly rejected (Rule #18)', async () => {
    const advId = `adv-cross-${Date.now()}`;
    await db.query(
      `INSERT INTO customer_advances (id, organization_id, customer_id, payment_id, amount, unapplied_amount, received_date, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [advId, ORG_ID, 'cust-A', 'pay-1', 1000.00, 1000.00, '2025-04-01', 'UNAPPLIED', new Date().toISOString()]
    );

    const invId = `inv-cross-${Date.now()}`;
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_name, issue_date, due_date, total_amount, paid_amount, balance_due, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [invId, ORG_ID, 'INV-B', 'cust-B', 'Customer B', '2025-04-01', '2025-04-30', 1000.00, 0.00, 1000.00, 'Sent']
    );

    await expect(
      SalesEngine.applyAdvanceToInvoice(ORG_ID, advId, invId, 500.00, '2025-04-05')
    ).rejects.toThrow('CROSS_CUSTOMER_ALLOCATION');
  });

  it('6. Full Organization Integrity Verifier generates multi-module status report', async () => {
    const result = await AccountingIntegrityService.verifyOrganizationIntegrity(ORG_ID);
    expect(result.organizationId).toBe(ORG_ID);
    expect(typeof result.isHealthy).toBe('boolean');
    expect(result.checks.journal).toBeDefined();
    expect(result.checks.trialBalance).toBeDefined();
    expect(result.checks.accountsReceivable).toBeDefined();
    expect(result.checks.accountsPayable).toBeDefined();
    expect(result.checks.banking).toBeDefined();
    expect(result.checks.gst).toBeDefined();
  });
});
