import crypto from 'node:crypto';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { openRecoveryPayload, sealRecoveryPayload, sha256 } from './crypto';
import { RecoveryError } from './errors';
import { POINT1_RECOVERY_SCHEMA, type RecoveryTableSchema } from './schema';
import {
  RECOVERY_FORMAT,
  RECOVERY_FORMAT_VERSION,
  type OwnerAuthorizer,
  type RecoveryEnvelope,
  type RecoveryJob,
  type RecoveryKeyring,
  type RecoveryManifest,
  type RecoveryPayload,
  type RecoveryPromoter,
  type RecoveryReconciler,
  type RecoveryRepository,
  type RecoveryRow,
  type RecoveryStager,
  type RecoveryTransactionManager,
  type StoredRecoveryArtifact,
} from './types';

export interface RecoveryArtifactServiceDependencies {
  repository: RecoveryRepository;
  keyring: RecoveryKeyring;
  stager: RecoveryStager;
  reconcilers: RecoveryReconciler[];
  promoter: RecoveryPromoter;
  ownerAuthorizer: OwnerAuthorizer;
  transactionManager?: RecoveryTransactionManager;
  schemaVersion: string;
  now?: () => Date;
}

export class RecoveryArtifactService {
  private readonly transactions: RecoveryTransactionManager;
  private readonly now: () => Date;

  constructor(private readonly dependencies: RecoveryArtifactServiceDependencies) {
    this.transactions = dependencies.transactionManager || db;
    this.now = dependencies.now || (() => new Date());
  }

  public async listArtifacts(organizationId: string): Promise<StoredRecoveryArtifact[]> {
    return this.dependencies.repository.listArtifacts(organizationId);
  }

  public async listJobs(organizationId: string): Promise<RecoveryJob[]> {
    return this.dependencies.repository.listJobs(organizationId);
  }

  public async downloadArtifact(artifactId: string, organizationId: string): Promise<StoredRecoveryArtifact> {
    const artifact = await this.requireArtifact(artifactId);
    if (artifact.organizationId !== organizationId) throw new RecoveryError('RECOVERY_TENANT_MISMATCH', 'Recovery artifact belongs to another organization', 403);
    return artifact;
  }

  public async createArtifact(organizationId: string, createdBy: string): Promise<StoredRecoveryArtifact> {
    if (!organizationId || !createdBy) throw new RecoveryError('RECOVERY_MANIFEST_INVALID', 'Organization and actor are required', 400);
    return this.transactions.transaction(async (client) => {
      if (!db.isMemoryMode()) await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const tables: Record<string, RecoveryRow[]> = {};
      for (const table of POINT1_RECOVERY_SCHEMA) {
        const result = await client.query<RecoveryRow>(table.selectSql, [organizationId]);
        tables[table.name] = result.rows.map((row) => this.normalizeRow(table, row));
      }
      const artifactId = newId('rcv-art');
      const createdAt = this.now().toISOString();
      const payload: RecoveryPayload = { organizationId, schemaVersion: this.dependencies.schemaVersion, tables };
      const manifest: RecoveryManifest = {
        format: RECOVERY_FORMAT,
        formatVersion: RECOVERY_FORMAT_VERSION,
        artifactId,
        organizationId,
        schemaVersion: this.dependencies.schemaVersion,
        createdBy,
        createdAt,
        keyId: this.dependencies.keyring.activeKeyId,
        cipher: 'aes-256-gcm',
        tables: POINT1_RECOVERY_SCHEMA.map((table) => ({
          name: table.name,
          columns: [...table.columns],
          rowCount: tables[table.name].length,
          sha256: sha256(tables[table.name]),
        })),
      };
      const artifact: StoredRecoveryArtifact = {
        id: artifactId,
        organizationId,
        status: 'READY',
        envelope: sealRecoveryPayload(manifest, payload, this.dependencies.keyring),
        createdBy,
        createdAt,
      };
      await this.dependencies.repository.saveArtifact(artifact, client);
      return artifact;
    });
  }

  public async stageRestore(input: { artifactId: string; targetOrganizationId: string; requestedBy: string }): Promise<RecoveryJob> {
    const artifact = await this.requireArtifact(input.artifactId);
    const payload = this.validateAndOpen(artifact.envelope, input.targetOrganizationId);
    const job: RecoveryJob = {
      id: newId('rcv-job'),
      artifactId: artifact.id,
      targetOrganizationId: input.targetOrganizationId,
      stagingOrganizationId: `recovery-stage-${crypto.randomUUID()}`,
      status: 'STAGING',
      reconciliation: [],
      createdBy: input.requestedBy,
      createdAt: this.now().toISOString(),
    };
    const stagedPayload = this.forStagingNamespace(payload, job.stagingOrganizationId);
    try {
      return await this.transactions.transaction(async (client) => {
        await this.dependencies.repository.createJob(job, client);
        await this.dependencies.stager.stage({ job, payload: stagedPayload, client });
        const reconciliation = [];
        for (const reconciler of this.dependencies.reconcilers) {
          const result = await reconciler.reconcile({ job, payload: stagedPayload, client });
          reconciliation.push({ ...result, name: reconciler.name });
        }
        const failures = reconciliation.filter((result) => !result.passed);
        if (failures.length > 0) {
          throw new RecoveryError('RECOVERY_VALIDATION_FAILED', 'Staged recovery reconciliation failed', 422, { failures });
        }
        await this.dependencies.repository.setJobValidated(job.id, reconciliation, client);
        return { ...job, status: 'VALIDATED' as const, reconciliation };
      });
    } catch (error) {
      await this.dependencies.repository.setJobFailed(job.id, error instanceof Error ? error.message : 'Unknown staging failure');
      throw error;
    }
  }

  public async promoteRestore(input: {
    jobId: string;
    targetOrganizationId: string;
    actorUserId: string;
    authenticatedAt: string;
    confirmation: string;
  }): Promise<RecoveryJob> {
    const job = await this.dependencies.repository.getJob(input.jobId);
    if (!job) throw new RecoveryError('RECOVERY_JOB_NOT_FOUND', 'Recovery job was not found', 404);
    if (job.targetOrganizationId !== input.targetOrganizationId) {
      throw new RecoveryError('RECOVERY_TENANT_MISMATCH', 'Recovery job does not belong to the target organization', 403);
    }
    if (job.status !== 'VALIDATED') {
      throw new RecoveryError('RECOVERY_JOB_NOT_READY', 'Only a validated recovery job can be promoted', 409);
    }
    const authenticatedAt = new Date(input.authenticatedAt).getTime();
    const ageMs = this.now().getTime() - authenticatedAt;
    if (!Number.isFinite(authenticatedAt) || ageMs < 0 || ageMs > 5 * 60 * 1000) {
      throw new RecoveryError('RECOVERY_RECENT_AUTH_REQUIRED', 'Owner authentication must be less than five minutes old', 401);
    }
    const expectedConfirmation = `PROMOTE RECOVERY ${job.id} TO ${job.targetOrganizationId}`;
    if (input.confirmation !== expectedConfirmation) {
      throw new RecoveryError('RECOVERY_CONFIRMATION_MISMATCH', 'Typed recovery confirmation does not match', 422);
    }
    const artifact = await this.requireArtifact(job.artifactId);
    const payload = this.forStagingNamespace(
      this.validateAndOpen(artifact.envelope, job.targetOrganizationId),
      job.stagingOrganizationId,
    );
    const promotedAt = this.now().toISOString();
    return this.transactions.transaction(async (client) => {
      await this.dependencies.ownerAuthorizer.assertOwner(job.targetOrganizationId, input.actorUserId, client);
      await this.dependencies.promoter.promote({ job, payload, actorUserId: input.actorUserId, client });
      await this.dependencies.repository.setJobPromoted(job.id, input.actorUserId, promotedAt, client);
      return { ...job, status: 'PROMOTED', promotedBy: input.actorUserId, promotedAt };
    });
  }

  private async requireArtifact(artifactId: string): Promise<StoredRecoveryArtifact> {
    const artifact = await this.dependencies.repository.getArtifact(artifactId);
    if (!artifact) throw new RecoveryError('RECOVERY_ARTIFACT_NOT_FOUND', 'Recovery artifact was not found', 404);
    return artifact;
  }

  private validateAndOpen(envelope: RecoveryEnvelope, targetOrganizationId: string): RecoveryPayload {
    const manifest = envelope.manifest;
    if (manifest.format !== RECOVERY_FORMAT || manifest.formatVersion !== RECOVERY_FORMAT_VERSION || manifest.cipher !== 'aes-256-gcm') {
      throw new RecoveryError('RECOVERY_MANIFEST_INVALID', 'Recovery artifact format is unsupported', 422);
    }
    if (manifest.organizationId !== targetOrganizationId) {
      throw new RecoveryError('RECOVERY_TENANT_MISMATCH', 'Recovery artifact belongs to a different organization', 403);
    }
    if (manifest.schemaVersion !== this.dependencies.schemaVersion) {
      throw new RecoveryError('RECOVERY_SCHEMA_MISMATCH', 'Recovery artifact schema version is incompatible', 422);
    }
    if (manifest.keyId !== this.dependencies.keyring.activeKeyId) {
      throw new RecoveryError('RECOVERY_MANIFEST_INVALID', 'Recovery artifact key is not active', 422);
    }
    this.assertManifestSchema(manifest);
    const payload = openRecoveryPayload(envelope, this.dependencies.keyring);
    if (payload.organizationId !== manifest.organizationId || payload.schemaVersion !== manifest.schemaVersion) {
      throw new RecoveryError('RECOVERY_MANIFEST_INVALID', 'Recovery payload metadata does not match its manifest', 422);
    }
    for (const table of POINT1_RECOVERY_SCHEMA) {
      const rows = payload.tables[table.name];
      const entry = manifest.tables.find((item) => item.name === table.name)!;
      if (!Array.isArray(rows) || rows.length !== entry.rowCount || sha256(rows) !== entry.sha256) {
        throw new RecoveryError('RECOVERY_MANIFEST_INVALID', `Recovery table [${table.name}] failed manifest validation`, 422);
      }
      for (const row of rows) this.assertRow(table, row, manifest.organizationId);
    }
    return payload;
  }

  private assertManifestSchema(manifest: RecoveryManifest): void {
    if (manifest.tables.length !== POINT1_RECOVERY_SCHEMA.length) {
      throw new RecoveryError('RECOVERY_MANIFEST_INVALID', 'Recovery manifest table set is incomplete', 422);
    }
    POINT1_RECOVERY_SCHEMA.forEach((table, index) => {
      const entry = manifest.tables[index];
      if (!entry || entry.name !== table.name || JSON.stringify(entry.columns) !== JSON.stringify(table.columns)) {
        throw new RecoveryError('RECOVERY_MANIFEST_INVALID', `Recovery manifest schema differs at [${table.name}]`, 422);
      }
    });
  }

  private normalizeRow(table: RecoveryTableSchema, row: RecoveryRow): RecoveryRow {
    this.assertRow(table, row);
    return Object.fromEntries(table.columns.map((column) => [column, row[column]])) as RecoveryRow;
  }

  private assertRow(table: RecoveryTableSchema, row: RecoveryRow, organizationId?: string): void {
    const keys = Object.keys(row).sort();
    const expected = [...table.columns].sort();
    if (JSON.stringify(keys) !== JSON.stringify(expected)) {
      throw new RecoveryError('RECOVERY_MANIFEST_INVALID', `Recovery row for [${table.name}] has unexpected columns`, 422);
    }
    if (organizationId && table.tenantColumn && row[table.tenantColumn] !== organizationId) {
      throw new RecoveryError('RECOVERY_TENANT_MISMATCH', `Recovery row for [${table.name}] belongs to another organization`, 403);
    }
  }

  private forStagingNamespace(payload: RecoveryPayload, stagingOrganizationId: string): RecoveryPayload {
    const tables = Object.fromEntries(POINT1_RECOVERY_SCHEMA.map((table) => [
      table.name,
      payload.tables[table.name].map((row) => table.tenantColumn ? { ...row, [table.tenantColumn]: stagingOrganizationId } : { ...row }),
    ]));
    return { ...payload, organizationId: stagingOrganizationId, tables };
  }
}
