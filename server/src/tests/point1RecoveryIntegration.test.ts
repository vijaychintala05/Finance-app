import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database/db';
import { CURRENT_SCHEMA_VERSION, MigrationRunner } from '../database/migrationRunner';
import { RecoveryArtifactService } from '../recovery/RecoveryArtifactService';
import {
  RecoveryAccountingReconciler,
  RecoveryRowCountReconciler,
  SqlOwnerAuthorizer,
  SqlRecoveryPromoter,
  SqlRecoveryStager,
} from '../recovery/ProductionRecoveryAdapters';
import { SqlRecoveryRepository } from '../recovery/RecoveryRepository';

describe('Point-1 production recovery integration', () => {
  const organizationId = 'org-recovery';
  const ownerId = 'owner-recovery';
  const now = new Date('2026-08-23T12:00:00.000Z');

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'owner@recovery.test', 'hash', 'Recovery Owner', 'Active')`,
      [ownerId]
    );
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-recovery', 'public-recovery', 'RCV', 'Recovery Org', 'India', 'INR', 'INR', $2)`,
      [organizationId, ownerId]
    );
    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role, status)
       VALUES ('membership-recovery', $1, $2, 'Owner', 'Active')`,
      [organizationId, ownerId]
    );
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance)
       VALUES ('account-recovery', $1, '1000', 'Recovery Bank', 'Asset', 'Bank', 125.50)`,
      [organizationId]
    );
  });

  it('exports, stages, reconciles, and atomically promotes organization data', async () => {
    const repository = new SqlRecoveryRepository();
    const service = new RecoveryArtifactService({
      repository,
      keyring: {
        activeKeyId: 'test-v1',
        encryptionKeys: { 'test-v1': Buffer.alloc(32, 3) },
        hmacKeys: { 'test-v1': Buffer.alloc(32, 4) },
      },
      stager: new SqlRecoveryStager(),
      reconcilers: [new RecoveryRowCountReconciler(), new RecoveryAccountingReconciler()],
      promoter: new SqlRecoveryPromoter(),
      ownerAuthorizer: new SqlOwnerAuthorizer(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      now: () => now,
    });

    const artifact = await service.createArtifact(organizationId, ownerId);
    expect(artifact.envelope.ciphertext).not.toContain('Recovery Bank');
    expect((await service.listArtifacts(organizationId))).toHaveLength(1);

    const job = await service.stageRestore({ artifactId: artifact.id, targetOrganizationId: organizationId, requestedBy: ownerId });
    expect(job.status).toBe('VALIDATED');
    expect(job.reconciliation.every((result) => result.passed)).toBe(true);

    await db.query(`UPDATE accounts SET balance = 999 WHERE organization_id = $1 AND id = 'account-recovery'`, [organizationId]);
    await service.promoteRestore({
      jobId: job.id,
      targetOrganizationId: organizationId,
      actorUserId: ownerId,
      authenticatedAt: now.toISOString(),
      confirmation: `PROMOTE RECOVERY ${job.id} TO ${organizationId}`,
    });

    const restored = await db.query(`SELECT balance FROM accounts WHERE organization_id = $1 AND id = 'account-recovery'`, [organizationId]);
    expect(Number(restored.rows[0].balance)).toBe(125.5);
    expect((await service.listJobs(organizationId))[0].status).toBe('PROMOTED');
  });
});
