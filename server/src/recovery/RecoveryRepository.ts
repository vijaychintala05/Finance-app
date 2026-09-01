import { db, type DbQueryClient } from '../database/db';
import type { RecoveryJob, RecoveryRepository, ReconciliationResult, StoredRecoveryArtifact } from './types';

function json<T>(value: T | string): T {
  return typeof value === 'string' ? JSON.parse(value) as T : value;
}

export class SqlRecoveryRepository implements RecoveryRepository {
  private artifact(row: any): StoredRecoveryArtifact {
    return {
      id: row.id, organizationId: row.organization_id, status: row.status,
      envelope: json(row.envelope), createdBy: row.created_by, createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private job(row: any): RecoveryJob {
    return {
      id: row.id, artifactId: row.artifact_id, targetOrganizationId: row.target_organization_id,
      stagingOrganizationId: row.staging_organization_id, status: row.status,
      reconciliation: json(row.reconciliation || []), createdBy: row.created_by,
      createdAt: new Date(row.created_at).toISOString(), promotedBy: row.promoted_by || undefined,
      promotedAt: row.promoted_at ? new Date(row.promoted_at).toISOString() : undefined,
      rollbackArtifactId: row.rollback_artifact_id || undefined,
      rolledBackBy: row.rolled_back_by || undefined,
      rolledBackAt: row.rolled_back_at ? new Date(row.rolled_back_at).toISOString() : undefined,
    };
  }

  public async saveArtifact(artifact: StoredRecoveryArtifact, client: DbQueryClient): Promise<void> {
    await client.query(
      `INSERT INTO recovery_artifacts
       (id, organization_id, status, format_version, schema_version, key_id, manifest, envelope, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)`,
      [artifact.id, artifact.organizationId, artifact.status, artifact.envelope.manifest.formatVersion,
        artifact.envelope.manifest.schemaVersion, artifact.envelope.manifest.keyId,
        JSON.stringify(artifact.envelope.manifest), JSON.stringify(artifact.envelope), artifact.createdBy, artifact.createdAt],
    );
  }

  public async getArtifact(artifactId: string): Promise<StoredRecoveryArtifact | null> {
    const result = await db.query('SELECT id, organization_id, status, envelope, created_by, created_at FROM recovery_artifacts WHERE id = $1', [artifactId]);
    const row = result.rows[0];
    return row ? this.artifact(row) : null;
  }

  public async createJob(job: RecoveryJob, client: DbQueryClient): Promise<void> {
    await client.query(
      `INSERT INTO recovery_jobs
       (id, artifact_id, target_organization_id, staging_organization_id, status, reconciliation, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [job.id, job.artifactId, job.targetOrganizationId, job.stagingOrganizationId, job.status,
        JSON.stringify(job.reconciliation), job.createdBy, job.createdAt],
    );
  }

  public async getJob(jobId: string): Promise<RecoveryJob | null> {
    const result = await db.query('SELECT * FROM recovery_jobs WHERE id = $1', [jobId]);
    const row = result.rows[0];
    return row ? this.job(row) : null;
  }

  public async setJobValidated(jobId: string, results: ReconciliationResult[], client: DbQueryClient): Promise<void> {
    await client.query("UPDATE recovery_jobs SET status = 'VALIDATED', reconciliation = $1::jsonb WHERE id = $2 AND status = 'STAGING'", [JSON.stringify(results), jobId]);
  }

  public async setJobFailed(jobId: string, reason: string): Promise<void> {
    await db.query("UPDATE recovery_jobs SET status = 'FAILED', failure_reason = $1 WHERE id = $2 AND status <> 'PROMOTED'", [reason, jobId]);
  }

  public async setJobPromoted(jobId: string, promotedBy: string, promotedAt: string, rollbackArtifactId: string, client: DbQueryClient): Promise<void> {
    await client.query(
      "UPDATE recovery_jobs SET status = 'PROMOTED', promoted_by = $1, promoted_at = $2, rollback_artifact_id = $3 WHERE id = $4 AND status = 'VALIDATED'",
      [promotedBy, promotedAt, rollbackArtifactId, jobId]
    );
  }

  public async setJobRolledBack(jobId: string, rolledBackBy: string, rolledBackAt: string, client: DbQueryClient): Promise<void> {
    await client.query(
      "UPDATE recovery_jobs SET status = 'ROLLED_BACK', rolled_back_by = $1, rolled_back_at = $2 WHERE id = $3 AND status = 'PROMOTED'",
      [rolledBackBy, rolledBackAt, jobId]
    );
  }

  public async listArtifacts(organizationId: string): Promise<StoredRecoveryArtifact[]> {
    const result = await db.query(
      'SELECT * FROM recovery_artifacts WHERE organization_id = $1 ORDER BY created_at DESC',
      [organizationId]
    );
    return result.rows.map((row) => this.artifact(row));
  }

  public async listJobs(organizationId: string): Promise<RecoveryJob[]> {
    const result = await db.query(
      'SELECT * FROM recovery_jobs WHERE target_organization_id = $1 ORDER BY created_at DESC',
      [organizationId]
    );
    return result.rows.map((row) => this.job(row));
  }
}
