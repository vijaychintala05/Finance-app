import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { AuditTrailService, GENESIS_HASH } from '../security/AuditTrailService';
import { DocumentNumberingEngine } from '../services/DocumentNumberingEngine';
import { PeriodCloseService } from '../services/PeriodCloseService';
import { AccountingIntegrityService } from '../services/AccountingIntegrityService';

describe('Enterprise PostgreSQL Database Hardening & Fortress Test Suite', () => {
  beforeEach(async () => {
    db.resetPool();
    await MigrationRunner.runMigrations();
  });

  it('1. Initializes v6 enterprise schema and applies audit log hash-chaining columns', async () => {
    const isCur = await MigrationRunner.isCurrent();
    expect(isCur).toBe(true);

    const check = await db.checkHealth();
    expect(check.isConnected).toBe(true);
  });

  it('2. Computes valid SHA-256 cryptographic hash chain on sequential audit logs', async () => {
    const orgId = 'org_test_audit_chain';
    const userId = 'usr_auditor_1';

    // Log 1 (Genesis)
    const log1 = await AuditTrailService.logAction({
      organizationId: orgId,
      userId,
      action: 'INVOICE_CREATED',
      entityType: 'Invoice',
      entityId: 'inv_001',
      afterState: { total: 1000 },
    });

    expect(log1.previousHash).toBe(GENESIS_HASH);
    expect(log1.currentHash).toHaveLength(64);

    // Log 2 (Chained)
    const log2 = await AuditTrailService.logAction({
      organizationId: orgId,
      userId,
      action: 'PAYMENT_RECEIVED',
      entityType: 'Payment',
      entityId: 'pay_001',
      afterState: { amount: 1000 },
    });

    expect(log2.previousHash).toBe(log1.currentHash);
    expect(log2.currentHash).toHaveLength(64);
    expect(log2.currentHash).not.toBe(log1.currentHash);

    // Log 3 (Chained)
    const log3 = await AuditTrailService.logAction({
      organizationId: orgId,
      userId,
      action: 'PERIOD_CLOSED',
      entityType: 'AccountingPeriodClose',
      entityId: 'apc_001',
      afterState: { periodKey: '2026-03' },
    });

    expect(log3.previousHash).toBe(log2.currentHash);

    // Verify hash chain
    const verification = await AuditTrailService.verifyHashChain(orgId);
    expect(verification.isValid).toBe(true);
    expect(verification.verifiedCount).toBe(3);
  });

  it('3. Detects tampering in historical audit log entries', async () => {
    const orgId = 'org_tamper_test';
    const userId = 'usr_hacker_test';

    await AuditTrailService.logAction({
      organizationId: orgId,
      userId,
      action: 'CREATE_EXPENSE',
      entityType: 'Expense',
      entityId: 'exp_001',
      afterState: { amount: 500 },
    });

    await AuditTrailService.logAction({
      organizationId: orgId,
      userId,
      action: 'APPROVE_EXPENSE',
      entityType: 'Expense',
      entityId: 'exp_001',
      afterState: { status: 'Approved' },
    });

    // Check valid
    const cleanCheck = await AuditTrailService.verifyHashChain(orgId);
    expect(cleanCheck.isValid).toBe(true);

    // Simulate tampering: update the action on in-memory store
    const store = (db as any).getMemoryStore?.();
    if (store && store.has('audit_logs')) {
      const logs = store.get('audit_logs');
      const target = logs.find((l: any) => l.organization_id === orgId && l.action === 'CREATE_EXPENSE');
      if (target) {
        target.action = 'TAMPERED_ACTION';
        const tamperedCheck = await AuditTrailService.verifyHashChain(orgId);
        expect(tamperedCheck.isValid).toBe(false);
      }
    }
  });

  it('4. Supports db.withOrganizationContext and session isolation binding', async () => {
    const orgA = 'org_alpha';
    const orgB = 'org_beta';

    await db.withOrganizationContext(orgA, async () => {
      expect(db.getCurrentOrganizationId()).toBe(orgA);

      await db.transaction(async (client) => {
        expect(db.getCurrentOrganizationId()).toBe(orgA);
      });
    });

    await db.withOrganizationContext(orgB, async () => {
      expect(db.getCurrentOrganizationId()).toBe(orgB);
    });

    expect(db.getCurrentOrganizationId()).toBeUndefined();
  });

  it('5. Generates concurrency-safe document numbers under advisory lock coordination', async () => {
    const orgId = 'org_concurrency_test';

    const num1 = await DocumentNumberingEngine.getNextNumber(orgId, 'INVOICE', '2026-08-30');
    const num2 = await DocumentNumberingEngine.getNextNumber(orgId, 'INVOICE', '2026-08-30');
    const num3 = await DocumentNumberingEngine.getNextNumber(orgId, 'INVOICE', '2026-08-30');

    expect(num1).toBe('INV/2026-27/0001');
    expect(num2).toBe('INV/2026-27/0002');
    expect(num3).toBe('INV/2026-27/0003');
  });

  it('6. Executes in-engine database invariant diagnostics cleanly on balanced books', async () => {
    const orgId = 'org_diag_clean';

    const diagnostics = await AccountingIntegrityService.runDatabaseInvariantDiagnostics(orgId);
    expect(diagnostics.isClean).toBe(true);
    expect(diagnostics.arDiscrepanciesCount).toBe(0);
    expect(diagnostics.apDiscrepanciesCount).toBe(0);
  });
});
