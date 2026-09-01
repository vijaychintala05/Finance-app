import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner, CURRENT_SCHEMA_VERSION } from '../database/migrationRunner';
import { BackupRestoreService, BackupPayload } from '../database/BackupRestoreService';
import { RecoveryArtifactService } from '../recovery/RecoveryArtifactService';
import { SqlRecoveryRepository } from '../recovery/RecoveryRepository';
import {
  SqlRecoveryStager,
  RecoveryRowCountReconciler,
  RecoveryAccountingReconciler,
  SqlOwnerAuthorizer,
  SqlRecoveryPromoter,
} from '../recovery/ProductionRecoveryAdapters';
import { newId } from '../utils/ids';
import { AuditTrailService } from '../security/AuditTrailService';
import { AccountingPeriodService } from '../accounting/AccountingPeriodService';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { JwtAuth } from '../auth/jwt';

describe('T6: PostgreSQL Production Recovery Drill, Restore Correctness & Fail-Safety', () => {
  const ORG_A = 'org-drill-alpha';
  const ORG_B = 'org-drill-beta';
  const USER_OWNER = 'usr-owner-alpha';
  const USER_ACCOUNTANT = 'usr-acct-alpha';

  const recoveryKeyring = {
    activeKeyId: 'drill-key-v1',
    encryptionKeys: {
      'drill-key-v1': Buffer.from('1111222233334444555566667777888811112222333344445555666677778888', 'hex'),
    },
    hmacKeys: {
      'drill-key-v1': Buffer.from('aaaabbbbccccddddeeeeffff00001111aaaabbbbccccddddeeeeffff00001111', 'hex'),
    },
  };

  const point1Service = new RecoveryArtifactService({
    repository: new SqlRecoveryRepository(),
    keyring: recoveryKeyring,
    stager: new SqlRecoveryStager(),
    reconcilers: [new RecoveryRowCountReconciler(), new RecoveryAccountingReconciler()],
    ownerAuthorizer: new SqlOwnerAuthorizer(),
    promoter: new SqlRecoveryPromoter(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  beforeEach(async () => {
    await MigrationRunner.runMigrations(db);
    // Clean up test organizations & all related tenant records
    await db.query('DELETE FROM expense_receipt_attachments WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM expenses WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM payment_made_allocations WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM payments_made WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM bills WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM invoice_items WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM invoices WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE organization_id IN ($1, $2))', [ORG_A, ORG_B]);
    await db.query('DELETE FROM journal_entries WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM customers WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM vendors WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM accounting_defaults WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM accounts WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM organization_profiles WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM period_locks WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM backups WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM recovery_artifacts WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM recovery_staging_rows WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM recovery_jobs WHERE target_organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM audit_logs WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM organization_members WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM organizations WHERE id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM users WHERE id IN ($1, $2)', [USER_OWNER, USER_ACCOUNTANT]);

    // Create users
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status) VALUES
       ($1, 'owner@drill.com', 'hash123', 'Alpha Owner', 'Active'),
       ($2, 'acct@drill.com', 'hash123', 'Alpha Accountant', 'Active')`,
      [USER_OWNER, USER_ACCOUNTANT]
    );

    // Create organizations
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id, status)
       VALUES ($1, 'uuid-alpha', 'pub-alpha', 'ALPH', 'Alpha Tech Ltd', 'India', 'INR', '₹', $2, 'Active')`,
      [ORG_A, USER_OWNER]
    );

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id, status)
       VALUES ($1, 'uuid-beta', 'pub-beta', 'BETA', 'Beta Corp', 'India', 'INR', '₹', $2, 'Active')`,
      [ORG_B, USER_OWNER]
    );

    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role) VALUES
       ($1, $2, $3, 'Owner'),
       ($4, $2, $5, 'Accountant')`,
      [newId('mem'), ORG_A, USER_OWNER, newId('mem'), USER_ACCOUNTANT]
    );
    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role)
       VALUES ($1, $2, $3, 'Owner')`,
      [newId('mem'), ORG_B, USER_OWNER]
    );
  });

  it('1. Full-Spectrum Tenant Seeding, Tier-1 Snapshot & Tier-2 Sealed Artifact Creation', async () => {
    // 1. Seed chart of accounts
    const cashAcc = newId('acc');
    const bankAcc = newId('acc');
    const arAcc = newId('acc');
    const apAcc = newId('acc');
    const salesAcc = newId('acc');
    const expAcc = newId('acc');

    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status) VALUES
       ($1, $2, '1000', 'Cash on Hand', 'ASSET', 'Cash', 50000, 'Active'),
       ($3, $2, '1010', 'HDFC Operating Bank', 'ASSET', 'Bank', 250000, 'Active'),
       ($4, $2, '1200', 'Accounts Receivable', 'ASSET', 'AccountsReceivable', 150000, 'Active'),
       ($5, $2, '2000', 'Accounts Payable', 'LIABILITY', 'AccountsPayable', 80000, 'Active'),
       ($6, $2, '4000', 'Software Development Sales', 'INCOME', 'Sales', 200000, 'Active'),
       ($7, $2, '6000', 'Office & Operating Expenses', 'EXPENSE', 'Operating', 45000, 'Active')`,
      [cashAcc, ORG_A, bankAcc, arAcc, apAcc, salesAcc, expAcc]
    );

    // 2. Seed profile and accounting defaults
    await db.query(
      `INSERT INTO organization_profiles (organization_id, legal_name, gstin, pan, city, country)
       VALUES ($1, 'Alpha Technologies Private Limited', '29ABCDE1234F1Z5', 'ABCDE1234F', 'Bangalore', 'India')`,
      [ORG_A]
    );

    await db.query(
      `INSERT INTO accounting_defaults (organization_id, system_role, account_id) VALUES
       ($1, 'default_cash', $2),
       ($1, 'default_bank', $3),
       ($1, 'default_ar', $4),
       ($1, 'default_ap', $5),
       ($1, 'default_sales', $6),
       ($1, 'default_expense', $7)`,
      [ORG_A, cashAcc, bankAcc, arAcc, apAcc, salesAcc, expAcc]
    );

    // 3. Seed customers, vendors, items
    const custId = newId('cust');
    const vendId = newId('vend');
    await db.query(
      `INSERT INTO customers (id, organization_id, customer_id, display_name, legal_name, currency, active, receivables_balance)
       VALUES ($1, $2, 'CUST-001', 'Acme Corp Global', 'Acme Corp Global Pvt Ltd', 'INR', true, 150000)`,
      [custId, ORG_A]
    );
    await db.query(
      `INSERT INTO vendors (id, organization_id, name, company_name, currency, payables_balance)
       VALUES ($1, $2, 'Century Cloud Services', 'Century Cloud Services Ltd', 'INR', 80000)`,
      [vendId, ORG_A]
    );

    // 4. Seed Invoices & invoice items
    const invId = newId('inv');
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_name, issue_date, due_date, subtotal, tax_total, total_amount, balance_due, status)
       VALUES ($1, $2, 'INV-2026-001', $3, 'Acme Corp Global', '2026-04-10', '2026-05-10', 150000, 0, 150000, 150000, 'SENT')`,
      [invId, ORG_A, custId]
    );
    await db.query(
      `INSERT INTO invoice_items (id, organization_id, invoice_id, description, account_id, quantity, unit_price, tax_rate, amount)
       VALUES ($1, $2, $3, 'Annual Cloud Architecture Retainer', $4, 1, 150000, 0, 150000)`,
      [newId('ii'), ORG_A, invId, salesAcc]
    );

    // 5. Seed Bills & Payments Made
    const billId = newId('bill');
    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, bill_date, due_date, total_amount, amount_paid, status)
       VALUES ($1, $2, 'BILL-2026-099', $3, 'Century Cloud Services', '2026-04-12', '2026-05-12', 80000, 80000, 'PAID')`,
      [billId, ORG_A, vendId]
    );

    const pmtMadeId = newId('pmt');
    await db.query(
      `INSERT INTO payments_made (id, organization_id, payment_number, vendor_id, vendor_name, payment_date, amount, payment_mode, paid_from_account_id, unallocated_amount, status)
       VALUES ($1, $2, 'PMT-001', $3, 'Century Cloud Services', '2026-04-15', 80000, 'Bank Transfer', $4, 0, 'POSTED')`,
      [pmtMadeId, ORG_A, vendId, bankAcc]
    );
    await db.query(
      `INSERT INTO payment_made_allocations (id, organization_id, payment_id, bill_id, amount)
       VALUES ($1, $2, $3, $4, 80000)`,
      [newId('pma'), ORG_A, pmtMadeId, billId]
    );

    // 6. Seed Expenses with Receipt Attachments
    const expId = newId('exp');
    await db.query(
      `INSERT INTO expenses (id, organization_id, expense_number, expense_account_id, paid_from_account_id, vendor_name, date, amount, tax_rate, description)
       VALUES ($1, $2, 'EXP-2026-001', $3, $4, 'Delta Hardware Supplies', '2026-04-20', 45000, 0, 'Server Rack Upgrade')`,
      [expId, ORG_A, expAcc, cashAcc]
    );

    const sampleReceiptBase64 = Buffer.from('Sample PNG binary image receipt bytes 12345').toString('base64');
    await db.query(
      `INSERT INTO expense_receipt_attachments (id, organization_id, expense_id, file_name, mime_type, byte_size, content_base64)
       VALUES ($1, $2, $3, 'server_rack_receipt.png', 'image/png', 42, $4)`,
      [newId('rcpt'), ORG_A, expId, sampleReceiptBase64]
    );

    // 7. Seed Balanced General Ledger Journal Entries
    const jrn1 = newId('je');
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ($1, $2, 'JRN-2026-001', '2026-04-10', 'INV-2026-001', 'Sales Invoice Posting', 'POSTED')`,
      [jrn1, ORG_A]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit, description) VALUES
       ($1, $2, $3, '1200', 'Accounts Receivable', 150000, 0, 'Debit AR for Invoice INV-2026-001'),
       ($4, $2, $5, '4000', 'Software Development Sales', 0, 150000, 'Credit Sales for Invoice INV-2026-001')`,
      [newId('jl'), jrn1, arAcc, newId('jl'), salesAcc]
    );

    // 8. Seed Period Locks & Audit Log
    await db.query(
      `INSERT INTO period_locks (id, organization_id, year, month, period_name, is_locked, lock_date, locked_by, reason, status)
       VALUES ($1, $2, 2025, 12, 'December 2025', true, '2025-12-31', $3, 'Year End Close 2025', 'Active')`,
      [newId('lck'), ORG_A, USER_OWNER]
    );

    await AuditTrailService.logAction({
      organizationId: ORG_A,
      userId: USER_OWNER,
      action: 'ORGANIZATION_PROVISIONED',
      entityType: 'ORGANIZATION',
      entityId: ORG_A,
      afterState: { name: 'Alpha Tech Ltd' },
    });

    // Tier 1: Backup Creation & Checksum Verification
    const tier1Backup = await BackupRestoreService.createBackup(ORG_A, USER_OWNER);
    expect(tier1Backup).toBeDefined();
    expect(tier1Backup.metadata.organizationId).toBe(ORG_A);
    expect(tier1Backup.metadata.recordCount).toBeGreaterThan(10);
    expect(BackupRestoreService.verifyBackup(tier1Backup).isValid).toBe(true);

    // Tier 2: Point-1 Sealed Recovery Artifact Creation & Verification
    const point1Artifact = await point1Service.createArtifact(ORG_A, USER_OWNER);
    expect(point1Artifact).toBeDefined();
    expect(point1Artifact.organizationId).toBe(ORG_A);
    expect(point1Artifact.envelope.manifest.formatVersion).toBe(1);
    expect(point1Artifact.envelope.manifest.keyId).toBe('drill-key-v1');
    expect(point1Artifact.envelope.ciphertext).toBeDefined();
    expect(point1Artifact.envelope.hmac).toBeDefined();

    // Verify stored snapshot in backups table
    const storedBackups = await BackupRestoreService.listBackups(ORG_A);
    expect(storedBackups.length).toBeGreaterThanOrEqual(1);
    expect(storedBackups[0].checksum).toBe(tier1Backup.metadata.checksum);
  });

  it('2. Simulated Catastrophic Wipe & Clean Relational Restoration with Financial Parity (Δ = 0.00)', async () => {
    // 1. Seed baseline data and create backup
    const cashAcc = newId('acc');
    const salesAcc = newId('acc');
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status) VALUES
       ($1, $2, '1000', 'Cash on Hand', 'ASSET', 'Cash', 100000, 'Active'),
       ($3, $2, '4000', 'Sales Revenue', 'INCOME', 'Sales', 100000, 'Active')`,
      [cashAcc, ORG_A, salesAcc]
    );

    const jrn = newId('je');
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ($1, $2, 'JRN-DRILL-100', '2026-04-01', 'REF-100', 'Capital Infusion', 'POSTED')`,
      [jrn, ORG_A]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit, description) VALUES
       ($1, $2, $3, '1000', 'Cash on Hand', 100000, 0, 'Debit Cash'),
       ($4, $2, $5, '4000', 'Sales Revenue', 0, 100000, 'Credit Sales')`,
      [newId('jl'), jrn, cashAcc, newId('jl'), salesAcc]
    );

    const expId = newId('exp');
    await db.query(
      `INSERT INTO expenses (id, organization_id, expense_number, expense_account_id, paid_from_account_id, vendor_name, date, amount, tax_rate, description)
       VALUES ($1, $2, 'EXP-DRILL-1', $3, $4, 'Hardware Mart', '2026-04-05', 25000, 0, 'Hardware purchase')`,
      [expId, ORG_A, salesAcc, cashAcc]
    );
    await db.query(
      `INSERT INTO expense_receipt_attachments (id, organization_id, expense_id, file_name, mime_type, byte_size, content_base64)
       VALUES ($1, $2, $3, 'hardware_bill.jpg', 'image/jpeg', 1024, 'BASE64IMGDATA999')`,
      [newId('rcpt'), ORG_A, expId]
    );

    await db.query(
      `INSERT INTO period_locks (id, organization_id, year, month, period_name, is_locked, lock_date, locked_by, reason, status)
       VALUES ($1, $2, 2026, 3, 'March 2026', true, '2026-03-31', $3, 'Closed', 'Active')`,
      [newId('lck'), ORG_A, USER_OWNER]
    );

    const preLossBackup = await BackupRestoreService.createBackup(ORG_A, USER_OWNER);
    const preLossRecordCount = preLossBackup.metadata.recordCount;

    // 2. SIMULATE DISASTER: Wipe all tenant records in ORG_A
    await db.query('DELETE FROM expense_receipt_attachments WHERE organization_id = $1', [ORG_A]);
    await db.query('DELETE FROM expenses WHERE organization_id = $1', [ORG_A]);
    await db.query('DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE organization_id = $1)', [ORG_A]);
    await db.query('DELETE FROM journal_entries WHERE organization_id = $1', [ORG_A]);
    await db.query('DELETE FROM period_locks WHERE organization_id = $1', [ORG_A]);
    await db.query('DELETE FROM accounts WHERE organization_id = $1', [ORG_A]);

    // Verify tenant data is empty
    const checkAccounts = await db.query('SELECT COUNT(*) FROM accounts WHERE organization_id = $1', [ORG_A]);
    expect(Number(checkAccounts.rows[0].count)).toBe(0);

    // 3. RESTORE FROM BACKUP
    const restoreResult = await BackupRestoreService.restoreBackup(ORG_A, preLossBackup, USER_OWNER);
    expect(restoreResult.success).toBe(true);
    expect(restoreResult.restoredRecords).toBe(preLossRecordCount);

    // 4. VERIFY RESTORED RELATIONAL & FINANCIAL INTEGRITY (Δ = 0.00)
    const restoredAccounts = await db.query('SELECT * FROM accounts WHERE organization_id = $1 ORDER BY code', [ORG_A]);
    expect(restoredAccounts.rows.length).toBe(2);
    expect(restoredAccounts.rows[0].code).toBe('1000');
    expect(Number(restoredAccounts.rows[0].balance)).toBe(100000);

    // General Ledger Trial Balance exact match
    const glTotals = await db.query(
      `SELECT SUM(jl.debit) as total_debit, SUM(jl.credit) as total_credit
         FROM journal_lines jl
         JOIN journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.organization_id = $1`,
      [ORG_A]
    );
    const totalDebit = Number(glTotals.rows[0].total_debit);
    const totalCredit = Number(glTotals.rows[0].total_credit);
    expect(totalDebit).toBe(100000);
    expect(totalCredit).toBe(100000);
    expect(Math.abs(totalDebit - totalCredit)).toBe(0); // GL Balanced Δ = 0.00

    // Expense receipts and attachments restored intact
    const restoredReceipts = await db.query(
      'SELECT * FROM expense_receipt_attachments WHERE organization_id = $1',
      [ORG_A]
    );
    expect(restoredReceipts.rows.length).toBe(1);
    expect(restoredReceipts.rows[0].file_name).toBe('hardware_bill.jpg');
    expect(restoredReceipts.rows[0].content_base64).toBe('BASE64IMGDATA999');

    // Period lock restored and enforced
    const isLocked = await AccountingPeriodService.isPeriodLocked(ORG_A, '2026-03-15');
    expect(isLocked).toBe(true);
  });

  it('3. Point-1 Staged Recovery, Multi-Pass Reconciliation & Atomic Promotion Drill', async () => {
    // 1. Seed accounts & balanced journal in ORG_A
    const acc1 = newId('acc');
    const acc2 = newId('acc');
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status) VALUES
       ($1, $2, '1000', 'Cash', 'ASSET', 'Cash', 5000, 'Active'),
       ($3, $2, '4000', 'Revenue', 'INCOME', 'Sales', 5000, 'Active')`,
      [acc1, ORG_A, acc2]
    );

    const jrn = newId('je');
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ($1, $2, 'JRN-PT1-001', '2026-04-01', 'REF-PT1', 'Point1 Drill Posting', 'POSTED')`,
      [jrn, ORG_A]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit, description) VALUES
       ($1, $2, $3, '1000', 'Cash', 5000, 0, 'Debit Cash'),
       ($4, $2, $5, '4000', 'Revenue', 0, 5000, 'Credit Revenue')`,
      [newId('jl'), jrn, acc1, newId('jl'), acc2]
    );

    // 2. Create sealed recovery artifact
    const artifact = await point1Service.createArtifact(ORG_A, USER_OWNER);
    expect(artifact.id).toBeDefined();

    // 3. Stage artifact into isolated staging namespace
    const stageJob = await point1Service.stageRestore({
      artifactId: artifact.id,
      targetOrganizationId: ORG_A,
      requestedBy: USER_OWNER,
    });
    expect(stageJob.status).toBe('VALIDATED');
    expect(stageJob.stagingOrganizationId).toBeDefined();

    // Verify staged rows reside strictly in staging table
    const stagedCount = await db.query(
      'SELECT COUNT(*) FROM recovery_staging_rows WHERE restore_job_id = $1',
      [stageJob.id]
    );
    expect(Number(stagedCount.rows[0].count)).toBeGreaterThan(0);

    // 4. Atomically promote staged recovery
    const promoteResult = await point1Service.promoteRestore({
      jobId: stageJob.id,
      targetOrganizationId: ORG_A,
      actorUserId: USER_OWNER,
      authenticatedAt: new Date().toISOString(),
      confirmation: `PROMOTE RECOVERY ${stageJob.id} TO ${ORG_A}`,
    });
    expect(promoteResult.status).toBe('PROMOTED');
    expect(promoteResult.promotedBy).toBe(USER_OWNER);
    expect(promoteResult.rollbackArtifactId).toBeDefined();

    // Verify promoted data in active organization tables
    const promotedAccounts = await db.query('SELECT * FROM accounts WHERE organization_id = $1 ORDER BY code', [ORG_A]);
    expect(promotedAccounts.rows.length).toBe(2);
    expect(promotedAccounts.rows[0].code).toBe('1000');
  });

  it('4. P0: Committed-but-Incorrect Promotion Rollback Drill (Durable Pre-Promotion Safety Snapshot)', async () => {
    // 1. Seed genuine current production state
    const currentCashAcc = newId('acc');
    const currentRevAcc = newId('acc');
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status) VALUES
       ($1, $2, '1000', 'Main Operating Cash', 'ASSET', 'Cash', 75000, 'Active'),
       ($3, $2, '4000', 'Consulting Revenue', 'INCOME', 'Sales', 75000, 'Active')`,
      [currentCashAcc, ORG_A, currentRevAcc]
    );

    const initialJournal = newId('je');
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ($1, $2, 'JRN-PROD-LIVE', '2026-04-15', 'LIVE-STATE', 'Current Production Revenue', 'POSTED')`,
      [initialJournal, ORG_A]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit, description) VALUES
       ($1, $2, $3, '1000', 'Main Operating Cash', 75000, 0, 'Debit Cash'),
       ($4, $2, $5, '4000', 'Consulting Revenue', 0, 75000, 'Credit Revenue')`,
      [newId('jl'), initialJournal, currentCashAcc, newId('jl'), currentRevAcc]
    );

    // 2. Prepare an outdated / incorrect snapshot to simulate accidental restore of wrong point-in-time
    // Create an artifact in another tenant or staging representation with different numbers
    const outdatedCashAcc = newId('acc');
    const outdatedRevAcc = newId('acc');
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status) VALUES
       ($1, $2, '1000', 'Old Cash Account', 'ASSET', 'Cash', 12000, 'Active'),
       ($3, $2, '4000', 'Old Sales Account', 'INCOME', 'Sales', 12000, 'Active')`,
      [outdatedCashAcc, ORG_B, outdatedRevAcc]
    );
    const outdatedArtifact = await point1Service.createArtifact(ORG_B, USER_OWNER);
    // Allow this artifact to be opened for ORG_A by generating artifact for ORG_A
    await db.query('DELETE FROM accounts WHERE organization_id = $1', [ORG_B]);

    // Create a valid artifact representing an old backup for ORG_A
    // First, wipe ORG_A accounts temporarily to create outdated snapshot
    await db.query('DELETE FROM journal_lines WHERE journal_entry_id = $1', [initialJournal]);
    await db.query('DELETE FROM journal_entries WHERE id = $1', [initialJournal]);
    await db.query('DELETE FROM accounts WHERE organization_id = $1', [ORG_A]);

    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status) VALUES
       ($1, $2, '1000', 'Outdated Cash Balance', 'ASSET', 'Cash', 10000, 'Active'),
       ($3, $2, '4000', 'Outdated Sales Balance', 'INCOME', 'Sales', 10000, 'Active')`,
      [outdatedCashAcc, ORG_A, outdatedRevAcc]
    );
    const oldBackupArtifact = await point1Service.createArtifact(ORG_A, USER_OWNER);

    // Now restore the genuine live state in ORG_A (75,000 balance)
    await db.query('DELETE FROM accounts WHERE organization_id = $1', [ORG_A]);
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status) VALUES
       ($1, $2, '1000', 'Main Operating Cash', 'ASSET', 'Cash', 75000, 'Active'),
       ($3, $2, '4000', 'Consulting Revenue', 'INCOME', 'Sales', 75000, 'Active')`,
      [currentCashAcc, ORG_A, currentRevAcc]
    );
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ($1, $2, 'JRN-PROD-LIVE', '2026-04-15', 'LIVE-STATE', 'Current Production Revenue', 'POSTED')`,
      [initialJournal, ORG_A]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit, description) VALUES
       ($1, $2, $3, '1000', 'Main Operating Cash', 75000, 0, 'Debit Cash'),
       ($4, $2, $5, '4000', 'Consulting Revenue', 0, 75000, 'Credit Revenue')`,
      [newId('jl'), initialJournal, currentCashAcc, newId('jl'), currentRevAcc]
    );

    // 3. Stage and Promote the OLD backup (simulating operator mistake)
    const stageJob = await point1Service.stageRestore({
      artifactId: oldBackupArtifact.id,
      targetOrganizationId: ORG_A,
      requestedBy: USER_OWNER,
    });
    expect(stageJob.status).toBe('VALIDATED');

    const promoteResult = await point1Service.promoteRestore({
      jobId: stageJob.id,
      targetOrganizationId: ORG_A,
      actorUserId: USER_OWNER,
      authenticatedAt: new Date().toISOString(),
      confirmation: `PROMOTE RECOVERY ${stageJob.id} TO ${ORG_A}`,
    });

    expect(promoteResult.status).toBe('PROMOTED');
    expect(promoteResult.rollbackArtifactId).toBeDefined();

    // Verify live data is now mistakenly overwritten with old 10,000 balance
    const liveAccountsMistake = await db.query('SELECT * FROM accounts WHERE organization_id = $1 ORDER BY code', [ORG_A]);
    expect(liveAccountsMistake.rows.length).toBe(2);
    expect(Number(liveAccountsMistake.rows[0].balance)).toBe(10000);

    // 4. Operator detects mistake and triggers ROLLBACK
    const rollbackResult = await point1Service.rollbackRestore({
      jobId: stageJob.id,
      targetOrganizationId: ORG_A,
      actorUserId: USER_OWNER,
      authenticatedAt: new Date().toISOString(),
      confirmation: `ROLLBACK RECOVERY ${stageJob.id} TO PRE-PROMOTION STATE`,
    });

    expect(rollbackResult.status).toBe('ROLLED_BACK');
    expect(rollbackResult.rolledBackBy).toBe(USER_OWNER);
    expect(rollbackResult.rolledBackAt).toBeDefined();

    // 5. Verify live production state is restored back to exact pre-promotion numbers (75,000 balance)
    const liveAccountsRestored = await db.query('SELECT * FROM accounts WHERE organization_id = $1 ORDER BY code', [ORG_A]);
    expect(liveAccountsRestored.rows.length).toBe(2);
    expect(liveAccountsRestored.rows[0].name).toBe('Main Operating Cash');
    expect(Number(liveAccountsRestored.rows[0].balance)).toBe(75000);

    // General Ledger exact parity after rollback (Δ = 0.00)
    const glTotals = await db.query(
      `SELECT SUM(jl.debit) as total_debit, SUM(jl.credit) as total_credit
         FROM journal_lines jl
         JOIN journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.organization_id = $1`,
      [ORG_A]
    );
    expect(Number(glTotals.rows[0].total_debit)).toBe(75000);
    expect(Number(glTotals.rows[0].total_credit)).toBe(75000);

    // Audit logs recorded both promotion and rollback
    const auditLogs = await db.query(
      "SELECT action FROM audit_logs WHERE organization_id = $1 AND action IN ('RECOVERY_PROMOTED', 'RECOVERY_ROLLED_BACK') ORDER BY timestamp ASC",
      [ORG_A]
    );
    expect(auditLogs.rows.map((r) => r.action)).toEqual(['RECOVERY_PROMOTED', 'RECOVERY_ROLLED_BACK']);
  });

  it('5. P1: Owner-Only Authorization Gate on Recovery Routes (Blocks Non-Owners)', async () => {
    // Generate auth tokens for Owner and Accountant
    const ownerToken = JwtAuth.generateToken({ userId: USER_OWNER, email: 'owner@drill.com' });
    const accountantToken = JwtAuth.generateToken({ userId: USER_ACCOUNTANT, email: 'acct@drill.com' });

    // Enable trusted finance feature in environment for test
    process.env.TRUSTED_FINANCE_FEATURES = 'recovery-center';

    // 1. Non-Owner (Accountant) is strictly blocked (HTTP 403) from listing artifacts
    const acctList = await request(app)
      .get('/api/v1/recovery/artifacts')
      .set('Authorization', `Bearer ${accountantToken}`)
      .set('x-organization-id', ORG_A);
    expect(acctList.status).toBe(403);
    expect(acctList.body.error).toMatch(/Owner or Super Admin/i);

    // 2. Non-Owner (Accountant) is strictly blocked from creating artifacts
    const acctCreate = await request(app)
      .post('/api/v1/recovery/artifacts')
      .set('Authorization', `Bearer ${accountantToken}`)
      .set('x-organization-id', ORG_A)
      .send({});
    expect(acctCreate.status).toBe(403);

    // 3. Non-Owner (Accountant) is strictly blocked from staging
    const acctStage = await request(app)
      .post('/api/v1/recovery/artifacts/art-fake/stage')
      .set('Authorization', `Bearer ${accountantToken}`)
      .set('x-organization-id', ORG_A)
      .send({});
    expect(acctStage.status).toBe(403);

    // 4. Non-Owner (Accountant) is strictly blocked from promotion and rollback
    const acctPromote = await request(app)
      .post('/api/v1/recovery/jobs/job-fake/promote')
      .set('Authorization', `Bearer ${accountantToken}`)
      .set('x-organization-id', ORG_A)
      .send({ password: 'any', confirmation: 'any' });
    expect(acctPromote.status).toBe(403);

    const acctRollback = await request(app)
      .post('/api/v1/recovery/jobs/job-fake/rollback')
      .set('Authorization', `Bearer ${accountantToken}`)
      .set('x-organization-id', ORG_A)
      .send({ password: 'any', confirmation: 'any' });
    expect(acctRollback.status).toBe(403);

    // 5. Active Owner is authorized and passes ownerRecovery guard
    const ownerList = await request(app)
      .get('/api/v1/recovery/artifacts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', ORG_A);
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.success).toBe(true);
  });

  it('6. Negative Safety Gates: Tampered Checksums, Corrupted Payloads & Cross-Tenant Rejection', async () => {
    const backupA = await BackupRestoreService.createBackup(ORG_A, USER_OWNER);

    // a. Cross-tenant restore blocked
    await expect(
      BackupRestoreService.restoreBackup(ORG_B, backupA, USER_OWNER)
    ).rejects.toThrow(/Tenant mismatch/i);

    // b. Tampered data payload rejected by checksum verification
    const tamperedPayload: BackupPayload = JSON.parse(JSON.stringify(backupA));
    tamperedPayload.data.accounts = [
      {
        id: 'acc-injected',
        organization_id: ORG_A,
        code: '9999',
        name: 'Injected Fraudulent Account',
        type: 'ASSET',
        sub_type: 'Cash',
        balance: 99999999,
        status: 'Active',
      },
    ];

    expect(BackupRestoreService.verifyBackup(tamperedPayload).isValid).toBe(false);
    await expect(
      BackupRestoreService.restoreBackup(ORG_A, tamperedPayload, USER_OWNER)
    ).rejects.toThrow(/Checksum mismatch/i);

    // c. Malformed Point-1 ciphertext/HMAC tampering rejected
    const artifact = await point1Service.createArtifact(ORG_A, USER_OWNER);

    // Tamper with envelope ciphertext in database
    const artRow = (await db.query('SELECT envelope FROM recovery_artifacts WHERE id = $1', [artifact.id])).rows[0];
    const envelope = typeof artRow.envelope === 'string' ? JSON.parse(artRow.envelope) : { ...artRow.envelope };
    envelope.ciphertext = 'TAMPERED_CIPHERTEXT_12345';
    await db.query('UPDATE recovery_artifacts SET envelope = $1 WHERE id = $2', [JSON.stringify(envelope), artifact.id]);

    await expect(
      point1Service.stageRestore({
        artifactId: artifact.id,
        targetOrganizationId: ORG_A,
        requestedBy: USER_OWNER,
      })
    ).rejects.toThrow();
  });

  it('7. Tenant Recovery State & Concurrent-Write Financial Mutation Guard Drill', async () => {
    const ownerToken = JwtAuth.generateToken({ userId: USER_OWNER, email: 'owner@drill.com' });
    process.env.TRUSTED_FINANCE_FEATURES = 'recovery-center';

    // 1. Acquire recovery maintenance lock on ORG_A
    const lockRes = await request(app)
      .post('/api/v1/recovery/maintenance/lock')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', ORG_A)
      .send({ reason: 'Simulated disaster recovery restore drill' });

    expect(lockRes.status).toBe(200);
    expect(lockRes.body.data.isLocked).toBe(true);

    // Verify maintenance status endpoint confirms locked state
    const statusRes = await request(app)
      .get('/api/v1/recovery/maintenance/status')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', ORG_A);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.isLocked).toBe(true);
    expect(statusRes.body.data.reason).toBe('Simulated disaster recovery restore drill');

    // 2. CONCURRENT FINANCIAL MUTATION ATTEMPTS: All must fail with HTTP 503 TENANT_RECOVERY_LOCKED
    const invoiceAttempt = await request(app)
      .post('/api/v1/finance/invoices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', ORG_A)
      .send({
        customerId: 'cust-123',
        clientName: 'Concurrent Client',
        issueDate: '2026-04-10',
        dueDate: '2026-05-10',
        items: [{ description: 'Cloud Services', accountId: 'acc-123', quantity: 1, unitPrice: 1000 }],
      });

    expect(invoiceAttempt.status).toBe(503);
    expect(invoiceAttempt.body.error.code).toBe('TENANT_RECOVERY_LOCKED');

    const paymentAttempt = await request(app)
      .post('/api/v1/finance/payments-received')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', ORG_A)
      .send({
        customerId: 'cust-123',
        paymentNumber: 'PMT-RACE-001',
        paymentDate: '2026-04-10',
        amount: 5000,
        depositToAccountId: 'acc-123',
      });

    expect(paymentAttempt.status).toBe(503);
    expect(paymentAttempt.body.error.code).toBe('TENANT_RECOVERY_LOCKED');

    const accountAttempt = await request(app)
      .post('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', ORG_A)
      .send({
        code: '1050',
        name: 'Race Condition Test Account',
        type: 'Asset',
        subType: 'Cash',
      });

    expect(accountAttempt.status).toBe(503);
    expect(accountAttempt.body.error.code).toBe('TENANT_RECOVERY_LOCKED');

    const expenseAttempt = await request(app)
      .post('/api/v1/finance/expenses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', ORG_A)
      .send({
        expenseNumber: 'EXP-RACE-001',
        expenseAccountId: 'acc-123',
        paidFromAccountId: 'acc-456',
        amount: 2500,
        date: '2026-04-10',
      });

    expect(expenseAttempt.status).toBe(503);
    expect(expenseAttempt.body.error.code).toBe('TENANT_RECOVERY_LOCKED');

    // 3. Verify read-only operations on ORG_A are unaffected
    const accountsGet = await request(app)
      .get('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', ORG_A);

    expect(accountsGet.status).toBe(200);

    // 4. Verify un-locked tenant (ORG_B) is completely unaffected
    const orgBAccountAttempt = await request(app)
      .post('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', ORG_B)
      .send({
        code: '1050',
        name: 'Org B Cash Account',
        type: 'Asset',
        subType: 'Cash',
      });

    expect(orgBAccountAttempt.status).toBe(201);

    // 5. Release recovery maintenance lock on ORG_A
    const unlockRes = await request(app)
      .post('/api/v1/recovery/maintenance/unlock')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', ORG_A);

    expect(unlockRes.status).toBe(200);
    expect(unlockRes.body.data.isLocked).toBe(false);

    // 6. Verify financial mutations on ORG_A succeed normally now
    const postUnlockAccount = await request(app)
      .post('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', ORG_A)
      .send({
        code: '1060',
        name: 'Post-Unlock Operating Cash',
        type: 'Asset',
        subType: 'Cash',
      });

    expect(postUnlockAccount.status).toBe(201);
  });

  it('8. Automatic Promotion Lock Visibility & Concurrent HTTP Write Rejection during Active Restore Drill', async () => {
    const ownerToken = JwtAuth.generateToken({ userId: USER_OWNER, email: 'owner@drill.com' });
    process.env.TRUSTED_FINANCE_FEATURES = 'recovery-center';

    // 1. Seed chart of accounts and snapshot
    const cashAcc = newId('acc');
    const salesAcc = newId('acc');
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status) VALUES
       ($1, $2, '1000', 'Cash', 'ASSET', 'Cash', 10000, 'Active'),
       ($3, $2, '4000', 'Sales Revenue', 'REVENUE', 'Operating Revenue', 10000, 'Active')`,
      [cashAcc, ORG_A, salesAcc]
    );

    const artifact = await point1Service.createArtifact(ORG_A, USER_OWNER);

    // 2. Build custom pausing promoter
    class PausingPromoter extends SqlRecoveryPromoter {
      public onPromoteStarted?: () => void;
      public unpausePromise?: Promise<void>;

      override async promote(input: any): Promise<void> {
        if (this.onPromoteStarted) {
          this.onPromoteStarted();
        }
        if (this.unpausePromise) {
          await this.unpausePromise;
        }
        return super.promote(input);
      }
    }

    const pausingPromoter = new PausingPromoter();
    const pausingService = new RecoveryArtifactService({
      repository: new SqlRecoveryRepository(),
      keyring: recoveryKeyring,
      stager: new SqlRecoveryStager(),
      reconcilers: [new RecoveryRowCountReconciler(), new RecoveryAccountingReconciler()],
      ownerAuthorizer: new SqlOwnerAuthorizer(),
      promoter: pausingPromoter,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });

    const stagedJob = await pausingService.stageRestore({
      artifactId: artifact.id,
      targetOrganizationId: ORG_A,
      requestedBy: USER_OWNER,
    });

    let resolvePromotionStarted!: () => void;
    let rejectPromotionStarted!: (err: any) => void;
    const promotionStartedPromise = new Promise<void>((resolve, reject) => {
      resolvePromotionStarted = resolve;
      rejectPromotionStarted = reject;
    });

    let resolveUnpause!: () => void;
    const unpausePromise = new Promise<void>((resolve) => {
      resolveUnpause = resolve;
    });

    pausingPromoter.onPromoteStarted = () => resolvePromotionStarted();
    pausingPromoter.unpausePromise = unpausePromise;

    // 3. Initiate promotion in background
    const promotionTask = pausingService.promoteRestore({
      jobId: stagedJob.id,
      targetOrganizationId: ORG_A,
      actorUserId: USER_OWNER,
      authenticatedAt: new Date().toISOString(),
      confirmation: `PROMOTE RECOVERY ${stagedJob.id} TO ${ORG_A}`,
    }).catch((err) => {
      rejectPromotionStarted(err);
      throw err;
    });

    // 4. Wait for promotion to enter the paused active promotion state (verifying lock was committed first)
    await promotionStartedPromise;

    // 5. CONCURRENT HTTP MUTATIONS MUST BE REJECTED WITH 503 TENANT_RECOVERY_LOCKED
    const concurrentInvoice = await request(app)
      .post('/api/v1/finance/invoices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', ORG_A)
      .send({
        customerId: 'cust-123',
        clientName: 'Race Condition Customer',
        issueDate: '2026-04-10',
        dueDate: '2026-05-10',
        items: [{ description: 'Intercept Item', accountId: cashAcc, quantity: 1, unitPrice: 500 }],
      });

    expect(concurrentInvoice.status).toBe(503);
    expect(concurrentInvoice.body.error.code).toBe('TENANT_RECOVERY_LOCKED');

    const concurrentAccount = await request(app)
      .post('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', ORG_A)
      .send({
        code: '1999',
        name: 'Concurrent Intercept Account',
        type: 'Asset',
        subType: 'Cash',
      });

    expect(concurrentAccount.status).toBe(503);
    expect(concurrentAccount.body.error.code).toBe('TENANT_RECOVERY_LOCKED');

    // 6. Direct financial engine transaction check also rejects
    await expect(
      ServerPostingEngine.postEntry(
        {
          organizationId: ORG_A,
          entryNumber: 'JE-RACE-001',
          date: '2026-04-10',
          description: 'Concurrent race journal entry',
          lines: [
            { accountId: cashAcc, debit: 100, credit: 0 },
            { accountId: salesAcc, debit: 0, credit: 100 },
          ],
        },
        db
      )
    ).rejects.toThrow(/Organization is locked for (maintenance \/ )?disaster recovery/i);

    // 7. Resume and complete promotion
    resolveUnpause();
    const promotedResult = await promotionTask;
    expect(promotedResult.status).toBe('PROMOTED');
    expect(promotedResult.rollbackArtifactId).toBeDefined();

    // 8. Post-promotion HTTP write succeeds normally
    const postPromotionAccount = await request(app)
      .post('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', ORG_A)
      .send({
        code: '1999',
        name: 'Post-Promotion Operating Cash',
        type: 'Asset',
        subType: 'Cash',
      });

    expect(postPromotionAccount.status).toBe(201);
  });
});
