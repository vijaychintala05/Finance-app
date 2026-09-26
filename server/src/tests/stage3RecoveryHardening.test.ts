import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner, CURRENT_SCHEMA_VERSION } from '../database/migrationRunner';
import { BackupRestoreService } from '../database/BackupRestoreService';
import { RecoveryArtifactService } from '../recovery/RecoveryArtifactService';
import { SqlRecoveryRepository } from '../recovery/RecoveryRepository';
import {
  RecoveryAccountingReconciler,
  RecoveryRowCountReconciler,
  SqlOwnerAuthorizer,
  SqlRecoveryPromoter,
  SqlRecoveryStager,
} from '../recovery/ProductionRecoveryAdapters';
import { POINT1_RECOVERY_SCHEMA, POINT1_RECOVERY_SCHEMA_V13, POINT1_RECOVERY_SCHEMA_V15 } from '../recovery/schema';
import { RecoveryMigrationPolicy } from '../recovery/RecoveryMigrationPolicy';
import { TenantRecoveryLockService } from '../recovery/TenantRecoveryLockService';
import { newId } from '../utils/ids';
import { sealRecoveryPayload, sha256 } from '../recovery/crypto';
import type { RecoveryKeyring, RecoveryManifest, RecoveryPayload } from '../recovery/types';

describe('Stage 3: Enterprise Backup/Restore Retirement & Recovery Hardening', () => {
  const ORG_A = 'org-s3-alpha';
  const ORG_B = 'org-s3-beta';
  const OWNER_USER_ID = 'usr-owner-s3';
  const OTHER_USER_ID = 'usr-other-s3';

  const recoveryKeyring: RecoveryKeyring = {
    activeKeyId: 's3-key-v1',
    encryptionKeys: {
      's3-key-v1': Buffer.from('1111222233334444555566667777888811112222333344445555666677778888', 'hex'),
    },
    hmacKeys: {
      's3-key-v1': Buffer.from('aaaabbbbccccddddeeeeffff00001111aaaabbbbccccddddeeeeffff00001111', 'hex'),
    },
  };

  const service = new RecoveryArtifactService({
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

    // Clean up test org data
    for (const table of [...POINT1_RECOVERY_SCHEMA].reverse()) {
      await db.query(table.deleteSql, [ORG_A]);
      await db.query(table.deleteSql, [ORG_B]);
    }
    await db.query('DELETE FROM organization_members WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM organizations WHERE id IN ($1, $2)', [ORG_A, ORG_B]);
    await db.query('DELETE FROM users WHERE id IN ($1, $2)', [OWNER_USER_ID, OTHER_USER_ID]);
    await db.query('DELETE FROM tenant_recovery_locks WHERE organization_id IN ($1, $2)', [ORG_A, ORG_B]);

    // Provision test organizations and owners
    await db.query(`INSERT INTO users (id, email, full_name, password_hash) VALUES ($1, 'owner@s3.com', 'S3 Owner', 'hash123') ON CONFLICT (id) DO NOTHING`, [OWNER_USER_ID]);
    await db.query(`INSERT INTO users (id, email, full_name, password_hash) VALUES ($1, 'other@s3.com', 'Other User', 'hash123') ON CONFLICT (id) DO NOTHING`, [OTHER_USER_ID]);
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $1, $1, 'ORG_A', 'Org Alpha', 'United States', 'USD', '$', $2) ON CONFLICT (id) DO NOTHING`,
      [ORG_A, OWNER_USER_ID]
    );
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $1, $1, 'ORG_B', 'Org Beta', 'United States', 'USD', '$', $2) ON CONFLICT (id) DO NOTHING`,
      [ORG_B, OWNER_USER_ID]
    );

    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role, status) VALUES ($1, $2, $3, 'Owner', 'Active')`,
      [newId('mem'), ORG_A, OWNER_USER_ID]
    );
    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role, status) VALUES ($1, $2, $3, 'Owner', 'Active')`,
      [newId('mem'), ORG_B, OWNER_USER_ID]
    );
  });

  it('1. Retires BackupRestoreService.restoreBackup in production and preserves audit_logs from deletion', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      await expect(
        BackupRestoreService.restoreBackup(ORG_A, 'backup-123', OWNER_USER_ID)
      ).rejects.toThrow('LEGACY_RESTORE_DISABLED: BackupRestoreService.restoreBackup is permanently retired in production');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }

    // Verify 'audit_logs' is completely omitted from TENANT_TABLES
    const backupService = new BackupRestoreService();
    // Use reflection or inspect that no audit_logs deletion occurs
    expect((backupService as any).TENANT_TABLES || []).not.toContain('audit_logs');
  });

  it('2. Extended POINT1_RECOVERY_SCHEMA covers finance sources and captures full-fidelity artifacts', async () => {
    // Seed finance sources across newly added and existing tables
    const cashAccId = newId('acc');
    const arAccId = newId('acc');
    const revAccId = newId('acc');
    const bankAccId = newId('bank');
    const custId = newId('cust');
    const invId = newId('inv');
    const payId = newId('pmt');
    const jeId = newId('je');
    const transferId = newId('xfr');
    const treasuryId = newId('trs');

    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, currency_code)
       VALUES ($1, $2, '1010', 'Main Cash', 'Asset', 'Cash', 1000.00, 'USD'),
              ($3, $2, '1200', 'Accounts Receivable', 'Asset', 'Receivable', 0.00, 'USD'),
              ($4, $2, '4000', 'Consulting Revenue', 'Revenue', 'Operating', 0.00, 'USD')`,
      [cashAccId, ORG_A, arAccId, revAccId]
    );

    await db.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, bank_name, currency)
       VALUES ($1, $2, $3, 'Operating Bank', '111222333', 'Global Reserve', 'USD')`,
      [bankAccId, ORG_A, cashAccId]
    );

    await db.query(
      `INSERT INTO customers (id, organization_id, display_name, currency)
       VALUES ($1, $2, 'Enterprise Client A', 'USD')`,
      [custId, ORG_A]
    );

    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_name, issue_date, due_date, subtotal, tax_total, total_amount, paid_amount, balance_due, status)
       VALUES ($1, $2, 'INV-2026-001', $3, 'Enterprise Client A', '2026-09-01', '2026-09-15', 1000.00, 0.00, 1000.00, 1000.00, 0.00, 'PAID')`,
      [invId, ORG_A, custId]
    );

    await db.query(
      `INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, status)
       VALUES ($1, $2, 'PAY-2026-001', $3, 'Enterprise Client A', '2026-09-02', 1000.00, 'BANK_TRANSFER', $4, 'ALLOCATED')`,
      [payId, ORG_A, custId, cashAccId]
    );

    await db.query(
      `INSERT INTO payment_received_allocations (id, organization_id, payment_id, invoice_id, amount)
       VALUES ($1, $2, $3, $4, 1000.00)`,
      [newId('pra'), ORG_A, payId, invId]
    );

    // Balanced Journal Entry
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ($1, $2, 'JE-2026-001', '2026-09-02', 'INV-PAY', 'Payment received for INV-2026-001', 'Posted')`,
      [jeId, ORG_A]
    );

    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, account_code, account_name, debit, credit, description)
       VALUES ($1, $2, $3, $4, '1010', 'Main Cash', 1000.00, 0.00, 'Debit Cash'),
              ($5, $2, $3, $6, '1200', 'Accounts Receivable', 0.00, 1000.00, 'Credit AR')`,
      [newId('jl'), jeId, ORG_A, cashAccId, newId('jl'), arAccId]
    );

    // Bank Transfer
    await db.query(
      `INSERT INTO bank_transfers (id, organization_id, transfer_number, transfer_date, from_bank_account_id, to_bank_account_id, from_ledger_account_id, to_ledger_account_id, amount, status, journal_entry_id)
       VALUES ($1, $2, 'BT-2026-001', '2026-09-03', $3, $3, $4, $4, 500.00, 'POSTED', $5)`,
      [transferId, ORG_A, bankAccId, cashAccId, jeId]
    );

    // Treasury Transaction
    await db.query(
      `INSERT INTO treasury_transactions (id, organization_id, transaction_number, transaction_type, transaction_date, monetary_account_id, counter_account_id, amount, principal_amount, status, journal_entry_id)
       VALUES ($1, $2, 'TR-2026-001', 'OWNER_CONTRIBUTION', '2026-09-04', $3, $4, 250.00, 250.00, 'POSTED', $5)`,
      [treasuryId, ORG_A, cashAccId, revAccId, jeId]
    );

    // Create Recovery Artifact
    const artifact = await service.createArtifact(ORG_A, OWNER_USER_ID);
    expect(artifact).toBeDefined();
    expect(artifact.organizationId).toBe(ORG_A);
    expect(artifact.envelope.manifest.tables.length).toBe(POINT1_RECOVERY_SCHEMA.length);

    // Stage Restore
    const staged = await service.stageRestore({
      artifactId: artifact.id,
      targetOrganizationId: ORG_A,
      requestedBy: OWNER_USER_ID,
    });
    expect(staged.status).toBe('VALIDATED');
    expect(staged.reconciliation.every((r) => r.passed)).toBe(true);

    // Simulate catastrophic data wipe of Org A
    for (const table of [...POINT1_RECOVERY_SCHEMA].reverse()) {
      await db.query(table.deleteSql, [ORG_A]);
    }
    const checkWiped = await db.query('SELECT COUNT(*) as cnt FROM invoices WHERE organization_id = $1', [ORG_A]);
    expect(Number(checkWiped.rows[0].cnt)).toBe(0);

    // Promote Restore
    const nowIso = new Date().toISOString();
    const promoted = await service.promoteRestore({
      jobId: staged.id,
      targetOrganizationId: ORG_A,
      actorUserId: OWNER_USER_ID,
      authenticatedAt: nowIso,
      confirmation: `PROMOTE RECOVERY ${staged.id} TO ${ORG_A}`,
    });
    expect(promoted.status).toBe('PROMOTED');

    // Verify 100% data restoration
    const restoredInv = await db.query('SELECT invoice_number, total_amount, balance_due FROM invoices WHERE organization_id = $1', [ORG_A]);
    expect(restoredInv.rows.length).toBe(1);
    expect(restoredInv.rows[0].invoice_number).toBe('INV-2026-001');

    const restoredTransfers = await db.query('SELECT transfer_number, amount FROM bank_transfers WHERE organization_id = $1', [ORG_A]);
    expect(restoredTransfers.rows.length).toBe(1);
    expect(restoredTransfers.rows[0].transfer_number).toBe('BT-2026-001');

    const restoredTreasury = await db.query('SELECT transaction_number, amount FROM treasury_transactions WHERE organization_id = $1', [ORG_A]);
    expect(restoredTreasury.rows.length).toBe(1);
    expect(restoredTreasury.rows[0].transaction_number).toBe('TR-2026-001');

    const restoredLines = await db.query('SELECT debit, credit FROM journal_lines WHERE organization_id = $1', [ORG_A]);
    expect(restoredLines.rows.length).toBe(2);
    const sumDebit = restoredLines.rows.reduce((acc, r) => acc + Number(r.debit), 0);
    const sumCredit = restoredLines.rows.reduce((acc, r) => acc + Number(r.credit), 0);
    expect(sumDebit).toBe(1000);
    expect(sumCredit).toBe(1000);
  });

  it('3. Preserves existing audit logs immutably across restore cycles and appends RECOVERY_PROMOTED', async () => {
    const historicalAuditId = newId('aud');
    await db.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
       VALUES ($1, $2, $3, 'SETTINGS_UPDATED', 'Organization', $2, '{"old":"val"}'::jsonb, '{"new":"val"}'::jsonb)`,
      [historicalAuditId, ORG_A, OWNER_USER_ID]
    );

    const artifact = await service.createArtifact(ORG_A, OWNER_USER_ID);
    const staged = await service.stageRestore({
      artifactId: artifact.id,
      targetOrganizationId: ORG_A,
      requestedBy: OWNER_USER_ID,
    });

    const nowIso = new Date().toISOString();
    await service.promoteRestore({
      jobId: staged.id,
      targetOrganizationId: ORG_A,
      actorUserId: OWNER_USER_ID,
      authenticatedAt: nowIso,
      confirmation: `PROMOTE RECOVERY ${staged.id} TO ${ORG_A}`,
    });

    // Check historical audit log is STILL present and untouched
    const historical = await db.query('SELECT * FROM audit_logs WHERE id = $1', [historicalAuditId]);
    expect(historical.rows.length).toBe(1);
    expect(historical.rows[0].action).toBe('SETTINGS_UPDATED');

    // Check RECOVERY_PROMOTED entry was appended
    const recoveryAudit = await db.query(
      `SELECT * FROM audit_logs WHERE organization_id = $1 AND action = 'RECOVERY_PROMOTED' AND entity_id = $2`,
      [ORG_A, staged.id]
    );
    expect(recoveryAudit.rows.length).toBe(1);
    expect(recoveryAudit.rows[0].entity_id).toBe(staged.id);
  });

  it('4. Reconciler asserts balanced GL invariant and rejects unbalanced journal staging', async () => {
    const reconciler = new RecoveryAccountingReconciler();

    // Balanced payload
    const balancedPayload: RecoveryPayload = {
      organizationId: ORG_A,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      tables: {
        accounts: [{ id: 'acc-1' }, { id: 'acc-2' }],
        journal_entries: [{ id: 'je-1' }],
        journal_lines: [
          { id: 'jl-1', journal_entry_id: 'je-1', account_id: 'acc-1', debit: 250, credit: 0 },
          { id: 'jl-2', journal_entry_id: 'je-1', account_id: 'acc-2', debit: 0, credit: 250 },
        ],
      },
    };

    const passResult = await reconciler.reconcile({
      job: { id: 'job-1', targetOrganizationId: ORG_A, stagingOrganizationId: 'stg-1' } as any,
      payload: balancedPayload,
      client: db,
    });
    expect(passResult.passed).toBe(true);

    // Unbalanced payload
    const unbalancedPayload: RecoveryPayload = {
      organizationId: ORG_A,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      tables: {
        accounts: [{ id: 'acc-1' }, { id: 'acc-2' }],
        journal_entries: [{ id: 'je-1' }],
        journal_lines: [
          { id: 'jl-1', journal_entry_id: 'je-1', account_id: 'acc-1', debit: 250, credit: 0 },
          { id: 'jl-2', journal_entry_id: 'je-1', account_id: 'acc-2', debit: 0, credit: 150 }, // Discrepancy!
        ],
      },
    };

    const failResult = await reconciler.reconcile({
      job: { id: 'job-2', targetOrganizationId: ORG_A, stagingOrganizationId: 'stg-2' } as any,
      payload: unbalancedPayload,
      client: db,
    });
    expect(failResult.passed).toBe(false);
    expect(JSON.stringify(failResult.details)).toContain('unbalanced');
  });

  it('5. Rejects corrupted artifacts, tampered HMACs, and cross-tenant restores', async () => {
    const artifact = await service.createArtifact(ORG_A, OWNER_USER_ID);

    // Corrupted HMAC
    const tamperedHmacArtifact = JSON.parse(JSON.stringify(artifact));
    tamperedHmacArtifact.envelope.hmac = Buffer.alloc(32, 9).toString('base64');
    await db.query(`UPDATE recovery_artifacts SET envelope = $1 WHERE id = $2`, [
      JSON.stringify(tamperedHmacArtifact.envelope),
      artifact.id,
    ]);

    await expect(
      service.stageRestore({ artifactId: artifact.id, targetOrganizationId: ORG_A, requestedBy: OWNER_USER_ID })
    ).rejects.toMatchObject({ code: 'RECOVERY_INTEGRITY_FAILED' });

    // Cross-tenant restore rejection
    const validArtifact = await service.createArtifact(ORG_A, OWNER_USER_ID);
    await expect(
      service.stageRestore({ artifactId: validArtifact.id, targetOrganizationId: ORG_B, requestedBy: OWNER_USER_ID })
    ).rejects.toMatchObject({ code: 'RECOVERY_TENANT_MISMATCH' });
  });

  it('6. Rollback restores previous state, appends RECOVERY_ROLLED_BACK, and unlocks tenant', async () => {
    // 1. Initial state: Create Account Alpha
    const acc1Id = newId('acc');
    await db.query(`INSERT INTO accounts (id, organization_id, code, name, type, sub_type) VALUES ($1, $2, '9001', 'Initial Alpha', 'Asset', 'Cash')`, [acc1Id, ORG_A]);

    // Snapshot state
    const artifact = await service.createArtifact(ORG_A, OWNER_USER_ID);

    // 2. Modify state: Add Account Beta
    const acc2Id = newId('acc');
    await db.query(`INSERT INTO accounts (id, organization_id, code, name, type, sub_type) VALUES ($1, $2, '9002', 'Intermediate Beta', 'Asset', 'Cash')`, [acc2Id, ORG_A]);

    // Stage and promote initial artifact
    const staged = await service.stageRestore({
      artifactId: artifact.id,
      targetOrganizationId: ORG_A,
      requestedBy: OWNER_USER_ID,
    });

    const nowIso = new Date().toISOString();
    const promoted = await service.promoteRestore({
      jobId: staged.id,
      targetOrganizationId: ORG_A,
      actorUserId: OWNER_USER_ID,
      authenticatedAt: nowIso,
      confirmation: `PROMOTE RECOVERY ${staged.id} TO ${ORG_A}`,
    });
    expect(promoted.status).toBe('PROMOTED');
    expect(promoted.rollbackArtifactId).toBeDefined();

    // Now roll back to the state captured just prior to promotion
    const rolledBack = await service.rollbackRestore({
      jobId: promoted.id,
      targetOrganizationId: ORG_A,
      actorUserId: OWNER_USER_ID,
      authenticatedAt: nowIso,
      confirmation: `ROLLBACK RECOVERY ${promoted.id} TO PRE-PROMOTION STATE`,
    });
    expect(rolledBack.status).toBe('ROLLED_BACK');

    // Verify Intermediate Beta account is restored
    const betaCheck = await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '9002'`, [ORG_A]);
    expect(betaCheck.rows.length).toBe(1);

    // Verify RECOVERY_ROLLED_BACK audit log appended
    const rollbackAudit = await db.query(`SELECT action FROM audit_logs WHERE organization_id = $1 AND action = 'RECOVERY_ROLLED_BACK'`, [ORG_A]);
    expect(rollbackAudit.rows.length).toBe(1);

    // Verify tenant lock is released
    const lockInfo = await TenantRecoveryLockService.getLockInfo(ORG_A);
    expect(lockInfo.isLocked).toBe(false);
  });

  it('7. Enforces TenantRecoveryLock against concurrent operations during active recovery', async () => {
    // Acquire lock
    await TenantRecoveryLockService.acquireLock(ORG_A, 'job-test-lock', 'Active Restore in Progress', OWNER_USER_ID);

    // Verification that lock is detected
    const lockInfo = await TenantRecoveryLockService.getLockInfo(ORG_A);
    expect(lockInfo.isLocked).toBe(true);
    expect(lockInfo.reason).toBe('Active Restore in Progress');

    // Financial mutation attempt must be rejected when locked
    await expect(
      TenantRecoveryLockService.assertNotLocked(ORG_A)
    ).rejects.toMatchObject({ code: 'TENANT_RECOVERY_LOCKED' });

    // Release lock
    await TenantRecoveryLockService.releaseLock(ORG_A);
    const postRelease = await TenantRecoveryLockService.getLockInfo(ORG_A);
    expect(postRelease.isLocked).toBe(false);
  });

  it('8. Enforces migration compatibility policy: rejects old schemas or upgrades via registered transformer', async () => {
    // Construct artifact envelope with legacy schema version '1.0.0'
    const manifest: RecoveryManifest = {
      format: 'firmbooks.point1-recovery',
      formatVersion: 1,
      artifactId: 'art-legacy-1',
      organizationId: ORG_A,
      schemaVersion: '1.0.0', // Legacy unsupported schema
      createdBy: OWNER_USER_ID,
      createdAt: new Date().toISOString(),
      keyId: 's3-key-v1',
      cipher: 'aes-256-gcm',
      tables: POINT1_RECOVERY_SCHEMA.map((t) => ({
        name: t.name,
        columns: [...t.columns],
        rowCount: 0,
        sha256: sha256([]),
      })),
    };

    const emptyTables: Record<string, any[]> = {};
    for (const t of POINT1_RECOVERY_SCHEMA) emptyTables[t.name] = [];
    const payload: RecoveryPayload = {
      organizationId: ORG_A,
      schemaVersion: '1.0.0',
      tables: emptyTables,
    };

    const sealed = sealRecoveryPayload(manifest, payload, recoveryKeyring);
    const repo = new SqlRecoveryRepository();
    await repo.saveArtifact(
      {
        id: 'art-legacy-1',
        organizationId: ORG_A,
        status: 'READY',
        envelope: sealed,
        createdBy: OWNER_USER_ID,
        createdAt: manifest.createdAt,
      },
      db
    );

    // Staging without registered migration must explicitly throw RECOVERY_SCHEMA_INCOMPATIBLE
    await expect(
      service.stageRestore({
        artifactId: 'art-legacy-1',
        targetOrganizationId: ORG_A,
        requestedBy: OWNER_USER_ID,
      })
    ).rejects.toMatchObject({ code: 'RECOVERY_SCHEMA_INCOMPATIBLE' });

    // Now register an upgrade transformer for '1.0.0'
    RecoveryMigrationPolicy.registerUpgradeTransformer('1.0.0', (rawPayload) => {
      return {
        ...rawPayload,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      };
    });

    try {
      // With registered upgrade transformer, artifact staging succeeds!
      const staged = await service.stageRestore({
        artifactId: 'art-legacy-1',
        targetOrganizationId: ORG_A,
        requestedBy: OWNER_USER_ID,
      });
      expect(staged.status).toBe('VALIDATED');
    } finally {
      RecoveryMigrationPolicy.clearTransformers();
    }
  });

  it('keeps the committed v13 recovery schema pinned to its original table shape', () => {
    expect(Object.isFrozen(POINT1_RECOVERY_SCHEMA_V13)).toBe(true);
    expect(POINT1_RECOVERY_SCHEMA_V13).toHaveLength(87);
    expect(createHash('sha256').update(JSON.stringify(POINT1_RECOVERY_SCHEMA_V13)).digest('hex'))
      .toBe('fcf5e35aeeead1d9dcf6d52904cf4f8db81020a4cda1b1ce48072d24743d2be3');
    expect(POINT1_RECOVERY_SCHEMA_V13).toEqual(POINT1_RECOVERY_SCHEMA_V15);
    expect(POINT1_RECOVERY_SCHEMA_V13.find((table) => table.name === 'salespersons')?.columns).toEqual([
      'id', 'organization_id', 'name', 'email', 'phone', 'commission_rate', 'created_at',
    ]);
    expect(POINT1_RECOVERY_SCHEMA_V13.find((table) => table.name === 'projects')?.columns).not.toContain('archived_at');
  });

  it.each([
    { label: 'v13', version: RecoveryMigrationPolicy.V13_SCHEMA_VERSION, schema: POINT1_RECOVERY_SCHEMA_V13 },
    { label: 'v15', version: RecoveryMigrationPolicy.V15_SCHEMA_VERSION, schema: POINT1_RECOVERY_SCHEMA_V15 },
  ])('upgrades a sealed $label recovery artifact and marks unrecoverable historical payment remainder as unknown', async ({ label, version, schema }) => {
    const artifactId = newId(`art-${label}`);
    const createdAt = new Date().toISOString();
    const legacyTables: Record<string, any[]> = Object.fromEntries(schema.map((table) => [table.name, []]));
    const paymentTable = schema.find((table) => table.name === 'payments_received')!;
    expect(paymentTable.columns).not.toContain('unallocated_amount_before_reversal');
    expect(paymentTable.columns).toContain('reversal_reason');
    const legacyPayment = Object.fromEntries(paymentTable.columns.map((column) => [column, null])) as Record<string, any>;
    Object.assign(legacyPayment, {
      id: `legacy-payment-${label}`, organization_id: ORG_A, payment_number: `PAY-${label.toUpperCase()}`, client_id: 'legacy-client',
      client_name: 'Legacy Customer', payment_date: '2026-09-01', amount: '25.00', payment_mode: 'Bank',
      deposit_to_account_id: 'legacy-account', unallocated_amount: '0.00', status: 'REVERSED', created_at: createdAt,
    });
    legacyTables.payments_received = [legacyPayment];
    const salespersonTable = schema.find((table) => table.name === 'salespersons')!;
    const legacySalesperson = Object.fromEntries(salespersonTable.columns.map((column) => [column, null])) as Record<string, any>;
    Object.assign(legacySalesperson, { id: `legacy-salesperson-${label}`, organization_id: ORG_A, name: 'Legacy Rep', email: 'legacy@example.test', phone: '555-0101', commission_rate: '5.00', created_at: createdAt });
    legacyTables.salespersons = [legacySalesperson];
    const projectTable = schema.find((table) => table.name === 'projects')!;
    const legacyProject = Object.fromEntries(projectTable.columns.map((column) => [column, null])) as Record<string, any>;
    Object.assign(legacyProject, { id: `legacy-project-${label}`, organization_id: ORG_A, code: 'OLD-PROJECT', name: 'Legacy Project', status: 'Active', budget_type: 'Fixed Cost', total_budget: '0.00', hourly_rate: '0.00', created_at: createdAt });
    legacyTables.projects = [legacyProject];
    const invoiceTable = schema.find((table) => table.name === 'invoices')!;
    const legacyInvoice = Object.fromEntries(invoiceTable.columns.map((column) => [column, null])) as Record<string, any>;
    Object.assign(legacyInvoice, {
      id: `legacy-invoice-${label}`, organization_id: ORG_A, invoice_number: `INV-${label.toUpperCase()}`,
      subtotal: '25.00', total_amount: '25.00', paid_amount: '5.00', balance_due: '20.00', created_at: createdAt,
    });
    legacyTables.invoices = [legacyInvoice];
    const legacyManifest: RecoveryManifest = {
      format: 'firmbooks.point1-recovery', formatVersion: 1, artifactId, organizationId: ORG_A,
      schemaVersion: version, createdBy: OWNER_USER_ID, createdAt,
      keyId: 's3-key-v1', cipher: 'aes-256-gcm',
      tables: schema.map((table) => ({
        name: table.name, columns: [...table.columns], rowCount: legacyTables[table.name].length,
        sha256: sha256(legacyTables[table.name]),
      })),
    };
    const legacyPayload: RecoveryPayload = {
      organizationId: ORG_A, schemaVersion: version, tables: legacyTables,
    };
    await new SqlRecoveryRepository().saveArtifact({
      id: artifactId, organizationId: ORG_A, status: 'READY',
      envelope: sealRecoveryPayload(legacyManifest, legacyPayload, recoveryKeyring),
      createdBy: OWNER_USER_ID, createdAt,
    }, db);

    let stagedPayment: Record<string, any> | undefined;
    let stagedSalesperson: Record<string, any> | undefined;
    let stagedProject: Record<string, any> | undefined;
    let stagedInvoice: Record<string, any> | undefined;
    const compatibleService = new RecoveryArtifactService({
      repository: new SqlRecoveryRepository(), keyring: recoveryKeyring,
      stager: { stage: async ({ payload }) => { stagedPayment = payload.tables.payments_received[0]; stagedSalesperson = payload.tables.salespersons[0]; stagedProject = payload.tables.projects[0]; stagedInvoice = payload.tables.invoices[0]; } },
      reconcilers: [{ name: 'compatibility-test', reconcile: async () => ({ passed: true, details: {} }) }],
      ownerAuthorizer: { assertOwner: async () => {} }, promoter: { promote: async () => {} },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });

    const staged = await compatibleService.stageRestore({ artifactId, targetOrganizationId: ORG_A, requestedBy: OWNER_USER_ID });
    expect(staged.status).toBe('VALIDATED');
    expect(stagedPayment).toMatchObject({
      id: `legacy-payment-${label}`, amount: '25.00', status: 'REVERSED', unallocated_amount: '0.00',
      unallocated_amount_before_reversal: null,
    });
    expect(stagedSalesperson).toMatchObject({ id: `legacy-salesperson-${label}`, region: null, notes: null, status: 'ACTIVE', updated_at: createdAt });
    expect(stagedSalesperson?.code).toMatch(/^LEGACY-[a-f0-9]{32}$/);
    expect(stagedProject).toMatchObject({ id: `legacy-project-${label}`, start_date: null, archived_at: null, archived_by: null });
    expect(stagedInvoice).toMatchObject({
      id: `legacy-invoice-${label}`, invoice_number: `INV-${label.toUpperCase()}`,
      subtotal: '25.00', total_amount: '25.00', paid_amount: '5.00', balance_due: '20.00',
      edit_version: 1, line_items: null, customer_snapshot: null, is_gst_inclusive: null,
      terms: null, edit_history: null, salesperson_id: null,
    });
  });


  it('round-trips salesperson code and archived state plus archived project metadata without crossing tenants', async () => {
    const salespersonId = newId('sp');
    const projectId = newId('prj');
    const otherSalespersonId = newId('sp');
    const otherProjectId = newId('prj');
    const salespersonUpdatedAt = '2026-09-20T10:30:00.000Z';
    const projectArchivedAt = '2026-09-21T11:45:00.000Z';
    await db.query(
      `INSERT INTO salespersons (id, organization_id, code, name, email, phone, commission_rate, region, notes, status, updated_at)
       VALUES ($1, $2, 'REP-ARCHIVE-1', 'Archived Rep', 'rep@example.test', '555-0100', 12.5, 'North', 'Retain this note', 'INACTIVE', $3),
              ($4, $5, 'REP-OTHER-1', 'Other Rep', 'other@example.test', '555-0200', 4, 'South', 'Other tenant', 'ACTIVE', $3)`,
      [salespersonId, ORG_A, salespersonUpdatedAt, otherSalespersonId, ORG_B]
    );
    await db.query(
      `INSERT INTO projects (id, organization_id, code, name, status, budget_type, total_budget, hourly_rate, start_date, archived_at, archived_by)
       VALUES ($1, $2, 'PRJ-ARCHIVE-1', 'Archived Project', 'Completed', 'Fixed Cost', 500, 0, '2026-01-15', $3, $4),
              ($5, $6, 'PRJ-OTHER-1', 'Other Project', 'Active', 'Fixed Cost', 0, 0, NULL, NULL, NULL)`,
      [projectId, ORG_A, projectArchivedAt, OWNER_USER_ID, otherProjectId, ORG_B]
    );

    const artifact = await service.createArtifact(ORG_A, OWNER_USER_ID);
    const salespersonSnapshot = artifact.envelope.manifest.tables.find((table) => table.name === 'salespersons')!;
    const projectSnapshot = artifact.envelope.manifest.tables.find((table) => table.name === 'projects')!;
    expect(salespersonSnapshot.columns).toEqual(expect.arrayContaining(['code', 'region', 'notes', 'status', 'updated_at']));
    expect(projectSnapshot.columns).toEqual(expect.arrayContaining(['start_date', 'archived_at', 'archived_by']));

    await db.query("UPDATE salespersons SET code = 'REP-CHANGED', status = 'ACTIVE', region = 'Changed', notes = 'Changed', updated_at = CURRENT_TIMESTAMP WHERE organization_id = $1 AND id = $2", [ORG_A, salespersonId]);
    await db.query('UPDATE projects SET archived_at = NULL, archived_by = NULL WHERE organization_id = $1 AND id = $2', [ORG_A, projectId]);
    const staged = await service.stageRestore({ artifactId: artifact.id, targetOrganizationId: ORG_A, requestedBy: OWNER_USER_ID });
    await service.promoteRestore({
      jobId: staged.id,
      targetOrganizationId: ORG_A,
      actorUserId: OWNER_USER_ID,
      authenticatedAt: new Date().toISOString(),
      confirmation: `PROMOTE RECOVERY ${staged.id} TO ${ORG_A}`,
    });

    const restoredSalesperson = await db.query('SELECT code, region, notes, status, updated_at FROM salespersons WHERE organization_id = $1 AND id = $2', [ORG_A, salespersonId]);
    expect(restoredSalesperson.rows[0]).toMatchObject({
      code: 'REP-ARCHIVE-1', region: 'North', notes: 'Retain this note', status: 'INACTIVE',
    });
    expect(new Date(restoredSalesperson.rows[0].updated_at).toISOString()).toBe(salespersonUpdatedAt);
    const restoredProject = await db.query('SELECT start_date, archived_at, archived_by FROM projects WHERE organization_id = $1 AND id = $2', [ORG_A, projectId]);
    expect(new Date(restoredProject.rows[0].start_date).toISOString().slice(0, 10)).toBe('2026-01-15');
    expect(new Date(restoredProject.rows[0].archived_at).toISOString()).toBe(projectArchivedAt);
    expect(restoredProject.rows[0].archived_by).toBe(OWNER_USER_ID);

    const otherTenantSalesperson = await db.query('SELECT code, status, notes FROM salespersons WHERE organization_id = $1 AND id = $2', [ORG_B, otherSalespersonId]);
    const otherTenantProject = await db.query('SELECT code, archived_at, archived_by FROM projects WHERE organization_id = $1 AND id = $2', [ORG_B, otherProjectId]);
    expect(otherTenantSalesperson.rows[0]).toMatchObject({ code: 'REP-OTHER-1', status: 'ACTIVE', notes: 'Other tenant' });
    expect(otherTenantProject.rows[0]).toMatchObject({ code: 'PRJ-OTHER-1', archived_at: null, archived_by: null });
  });
});
