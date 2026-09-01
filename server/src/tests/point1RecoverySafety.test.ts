import { describe, expect, it, beforeEach } from 'vitest';
import { db, type DbQueryClient } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { RecoveryArtifactService } from '../recovery/RecoveryArtifactService';
import { sealRecoveryPayload, sha256 } from '../recovery/crypto';
import { RecoveryError } from '../recovery/errors';
import { POINT1_RECOVERY_SCHEMA } from '../recovery/schema';
import { RECOVERY_FORMAT, RECOVERY_FORMAT_VERSION, type RecoveryJob, type RecoveryManifest, type RecoveryPayload, type RecoveryRepository, type StoredRecoveryArtifact } from '../recovery/types';

const now = new Date('2026-08-23T10:00:00.000Z');
const keyring = { activeKeyId: 'test-v1', encryptionKeys: { 'test-v1': Buffer.alloc(32, 7) }, hmacKeys: { 'test-v1': Buffer.alloc(32, 9) } };
const client: DbQueryClient = { query: async () => ({ rows: [], rowCount: 0 }) };

class MemoryRepository implements RecoveryRepository {
  artifacts = new Map<string, StoredRecoveryArtifact>();
  jobs = new Map<string, RecoveryJob>();
  async saveArtifact(value: StoredRecoveryArtifact) { this.artifacts.set(value.id, value); }
  async getArtifact(id: string) { return this.artifacts.get(id) || null; }
  async createJob(value: RecoveryJob) { this.jobs.set(value.id, value); }
  async getJob(id: string) { return this.jobs.get(id) || null; }
  async setJobValidated(id: string, reconciliation: any[]) { const job = this.jobs.get(id)!; this.jobs.set(id, { ...job, status: 'VALIDATED', reconciliation }); }
  async setJobFailed(id: string) { const job = this.jobs.get(id); if (job) this.jobs.set(id, { ...job, status: 'FAILED' }); }
  async setJobPromoted(id: string, promotedBy: string, promotedAt: string, rollbackArtifactId: string) { const job = this.jobs.get(id)!; this.jobs.set(id, { ...job, status: 'PROMOTED', promotedBy, promotedAt, rollbackArtifactId }); }
  async setJobRolledBack(id: string, rolledBackBy: string, rolledBackAt: string) { const job = this.jobs.get(id)!; this.jobs.set(id, { ...job, status: 'ROLLED_BACK', rolledBackBy, rolledBackAt }); }
  async listArtifacts(organizationId: string) { return [...this.artifacts.values()].filter((artifact) => artifact.organizationId === organizationId); }
  async listJobs(organizationId: string) { return [...this.jobs.values()].filter((job) => job.targetOrganizationId === organizationId); }
}

function makeArtifact(organizationId = 'org-a'): StoredRecoveryArtifact {
  const tables = Object.fromEntries(POINT1_RECOVERY_SCHEMA.map((table) => [table.name, []]));
  const payload: RecoveryPayload = { organizationId, schemaVersion: 'schema-v1', tables };
  const manifest: RecoveryManifest = {
    format: RECOVERY_FORMAT,
    formatVersion: RECOVERY_FORMAT_VERSION,
    artifactId: 'artifact-1',
    organizationId,
    schemaVersion: 'schema-v1',
    createdBy: 'owner-1',
    createdAt: now.toISOString(),
    keyId: 'test-v1',
    cipher: 'aes-256-gcm',
    tables: POINT1_RECOVERY_SCHEMA.map((table) => ({ name: table.name, columns: [...table.columns], rowCount: 0, sha256: sha256([]) })),
  };
  return { id: 'artifact-1', organizationId, status: 'READY', envelope: sealRecoveryPayload(manifest, payload, keyring), createdBy: 'owner-1', createdAt: now.toISOString() };
}

function harness(reconciliationPasses = true) {
  const repository = new MemoryRepository();
  repository.artifacts.set('artifact-1', makeArtifact());
  const production = { marker: 'unchanged', promotions: 0 };
  const service = new RecoveryArtifactService({
    repository,
    keyring,
    schemaVersion: 'schema-v1',
    now: () => now,
    transactionManager: { transaction: async (callback) => callback(client) },
    stager: { stage: async ({ job, payload }) => { expect(payload.organizationId).toBe(job.stagingOrganizationId); } },
    reconcilers: [{ name: 'accounting', reconcile: async () => ({ name: 'accounting', passed: reconciliationPasses }) }],
    ownerAuthorizer: { assertOwner: async (_org, user) => { if (user !== 'owner-1') throw new RecoveryError('RECOVERY_OWNER_REQUIRED', 'Owner required', 403); } },
    promoter: { promote: async () => { production.promotions += 1; production.marker = 'promoted'; } },
  });
  return { service, repository, production };
}

describe('Point-1 recovery safety', () => {
  beforeEach(async () => {
    await MigrationRunner.runMigrations(db);
  });

  it('rejects a tampered artifact before staging', async () => {
    const { service, repository } = harness();
    const artifact = repository.artifacts.get('artifact-1')!;
    artifact.envelope.ciphertext = `${artifact.envelope.ciphertext.slice(0, -2)}AA`;
    await expect(service.stageRestore({ artifactId: artifact.id, targetOrganizationId: 'org-a', requestedBy: 'owner-1' }))
      .rejects.toMatchObject({ code: 'RECOVERY_INTEGRITY_FAILED' });
    expect(repository.jobs.size).toBe(0);
  });

  it('rejects tenant mismatch before staging', async () => {
    const { service, repository } = harness();
    await expect(service.stageRestore({ artifactId: 'artifact-1', targetOrganizationId: 'org-b', requestedBy: 'owner-1' }))
      .rejects.toMatchObject({ code: 'RECOVERY_TENANT_MISMATCH' });
    expect(repository.jobs.size).toBe(0);
  });

  it('fails closed when staged accounting validation fails', async () => {
    const { service, repository, production } = harness(false);
    await expect(service.stageRestore({ artifactId: 'artifact-1', targetOrganizationId: 'org-a', requestedBy: 'owner-1' }))
      .rejects.toMatchObject({ code: 'RECOVERY_VALIDATION_FAILED' });
    expect(production).toEqual({ marker: 'unchanged', promotions: 0 });
    expect([...repository.jobs.values()].every((job) => job.status !== 'VALIDATED')).toBe(true);
  });

  it('leaves production unchanged until a separate recent-owner-auth promotion', async () => {
    const { service, production } = harness();
    const job = await service.stageRestore({ artifactId: 'artifact-1', targetOrganizationId: 'org-a', requestedBy: 'owner-1' });
    expect(production).toEqual({ marker: 'unchanged', promotions: 0 });
    await expect(service.promoteRestore({ jobId: job.id, targetOrganizationId: 'org-a', actorUserId: 'owner-1', authenticatedAt: '2026-08-23T09:50:00.000Z', confirmation: `PROMOTE RECOVERY ${job.id} TO org-a` }))
      .rejects.toMatchObject({ code: 'RECOVERY_RECENT_AUTH_REQUIRED' });
    expect(production).toEqual({ marker: 'unchanged', promotions: 0 });
    await service.promoteRestore({ jobId: job.id, targetOrganizationId: 'org-a', actorUserId: 'owner-1', authenticatedAt: '2026-08-23T09:58:00.000Z', confirmation: `PROMOTE RECOVERY ${job.id} TO org-a` });
    expect(production).toEqual({ marker: 'promoted', promotions: 1 });
  });
});
